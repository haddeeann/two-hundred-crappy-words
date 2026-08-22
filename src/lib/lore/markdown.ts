import { parseFrontmatter } from "./frontmatter";
import { markdownFileStem, simplifyHeadingText } from "./normalize";
import { lineStartsFor, sourceRange } from "./source";
import type {
  LoreIssue,
  ParsedHeading,
  ParsedMarkdownNote,
  ParsedWikiLink,
} from "./types";

interface Line {
  start: number;
  contentEnd: number;
  next: number;
  text: string;
}

interface IgnoredRange {
  start: number;
  end: number;
}

export function parseMarkdownNote(path: string, text: string): ParsedMarkdownNote {
  const lineStarts = lineStartsFor(text);
  const frontmatter = parseFrontmatter(text);
  const issues = [...frontmatter.issues];
  const ignored: IgnoredRange[] = [];
  if (frontmatter.range) ignored.push(frontmatter.range);

  const lines = collectLines(text, frontmatter.bodyStart);
  collectFences(lines, text.length, ignored, issues, lineStarts);
  collectHtmlComments(text, frontmatter.bodyStart, ignored, issues, lineStarts);
  collectInlineCode(lines, ignored);
  ignored.sort((first, second) => first.start - second.start || first.end - second.end);

  const headings = parseHeadings(lines, ignored, lineStarts);
  const links = parseWikiLinks(text, frontmatter.bodyStart, ignored, issues, lineStarts);
  const firstH1 = headings.find((heading) => heading.level === 1)?.text;

  return {
    path,
    id: frontmatter.id,
    type: frontmatter.type,
    title: frontmatter.title ?? firstH1 ?? markdownFileStem(path),
    aliases: frontmatter.aliases,
    headings,
    links,
    issues,
    frontmatter,
  };
}

function collectLines(text: string, start: number): Line[] {
  const lines: Line[] = [];
  let cursor = start;
  while (cursor <= text.length) {
    const newline = text.indexOf("\n", cursor);
    const contentEnd = newline === -1 ? text.length : newline;
    lines.push({
      start: cursor,
      contentEnd,
      next: newline === -1 ? text.length : newline + 1,
      text: text.slice(cursor, contentEnd).replace(/\r$/u, ""),
    });
    if (newline === -1) break;
    cursor = newline + 1;
  }
  return lines;
}

function collectFences(
  lines: readonly Line[],
  textLength: number,
  ignored: IgnoredRange[],
  issues: LoreIssue[],
  lineStarts: readonly number[],
): void {
  let open: { marker: "`" | "~"; length: number; start: number } | null = null;
  for (const line of lines) {
    const match = /^(?: {0,3})(`{3,}|~{3,})/u.exec(line.text);
    if (!match) continue;
    const marker = match[1]![0] as "`" | "~";
    if (!open) {
      open = { marker, length: match[1]!.length, start: line.start };
      continue;
    }
    if (marker === open.marker && match[1]!.length >= open.length) {
      ignored.push({ start: open.start, end: line.next });
      open = null;
    }
  }
  if (open) {
    ignored.push({ start: open.start, end: textLength });
    issues.push({
      kind: "unclosed-fence",
      message: "A fenced code block is not closed; its remaining text was not indexed.",
      range: sourceRange(open.start, Math.min(textLength, open.start + open.length), lineStarts),
    });
  }
}

function collectHtmlComments(
  text: string,
  start: number,
  ignored: IgnoredRange[],
  issues: LoreIssue[],
  lineStarts: readonly number[],
): void {
  let cursor = start;
  while (cursor < text.length) {
    const opening = text.indexOf("<!--", cursor);
    if (opening === -1) return;
    const closing = text.indexOf("-->", opening + 4);
    if (closing === -1) {
      ignored.push({ start: opening, end: text.length });
      issues.push({
        kind: "unclosed-comment",
        message: "An HTML comment is not closed; its remaining text was not indexed.",
        range: sourceRange(opening, Math.min(text.length, opening + 4), lineStarts),
      });
      return;
    }
    ignored.push({ start: opening, end: closing + 3 });
    cursor = closing + 3;
  }
}

function collectInlineCode(lines: readonly Line[], ignored: IgnoredRange[]): void {
  for (const line of lines) {
    let cursor = 0;
    while (cursor < line.text.length) {
      if (line.text[cursor] !== "`") {
        cursor += 1;
        continue;
      }
      let length = 1;
      while (line.text[cursor + length] === "`") length += 1;
      const marker = "`".repeat(length);
      const closing = line.text.indexOf(marker, cursor + length);
      if (closing === -1) {
        cursor += length;
        continue;
      }
      ignored.push({
        start: line.start + cursor,
        end: line.start + closing + length,
      });
      cursor = closing + length;
    }
  }
}

function parseHeadings(
  lines: readonly Line[],
  ignored: readonly IgnoredRange[],
  lineStarts: readonly number[],
): ParsedHeading[] {
  const headings: ParsedHeading[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (isIgnored(line.start, ignored)) continue;
    const atx = /^( {0,3})(#{1,6})(?:[\t ]+|$)(.*)$/u.exec(line.text);
    if (atx) {
      const rawText = atx[3]!.replace(/[\t ]+#+[\t ]*$/u, "").trim();
      if (!rawText) continue;
      const rawStart = line.text.indexOf(atx[3]!, atx[1]!.length + atx[2]!.length);
      const trimStart = atx[3]!.indexOf(rawText);
      const textStart = line.start + rawStart + Math.max(0, trimStart);
      headings.push(makeHeading(atx[2]!.length, rawText, line, textStart, lineStarts));
      continue;
    }
    const underline = /^( {0,3})(=+|-+)[\t ]*$/u.exec(line.text);
    const previous = lines[index - 1];
    if (!underline || !previous || !previous.text.trim()) continue;
    if (isIgnored(previous.start, ignored)) continue;
    const textValue = previous.text.trim();
    const textStart = previous.start + previous.text.indexOf(textValue);
    headings.push(
      makeHeading(
        underline[2]![0] === "=" ? 1 : 2,
        textValue,
        { ...previous, contentEnd: line.contentEnd, next: line.next },
        textStart,
        lineStarts,
      ),
    );
  }
  return headings;
}

function makeHeading(
  level: number,
  text: string,
  line: Line,
  textStart: number,
  lineStarts: readonly number[],
): ParsedHeading {
  return {
    level,
    text,
    lookupText: simplifyHeadingText(text),
    range: sourceRange(line.start, line.contentEnd, lineStarts),
    textRange: sourceRange(textStart, textStart + text.length, lineStarts),
  };
}

function parseWikiLinks(
  text: string,
  start: number,
  ignored: readonly IgnoredRange[],
  issues: LoreIssue[],
  lineStarts: readonly number[],
): ParsedWikiLink[] {
  const links: ParsedWikiLink[] = [];
  let cursor = start;
  while (cursor < text.length - 1) {
    const opening = text.indexOf("[[", cursor);
    if (opening === -1) break;
    if (isIgnored(opening, ignored) || isEscaped(text, opening)) {
      cursor = opening + 2;
      continue;
    }

    let closing = -1;
    let malformedAt = -1;
    for (let index = opening + 2; index < text.length - 1; index += 1) {
      if (text[index] === "\n" || text[index] === "\r") {
        malformedAt = index;
        break;
      }
      if (text[index] === "[" && text[index + 1] === "[") {
        malformedAt = index;
        break;
      }
      if (
        text[index] === "]" &&
        text[index + 1] === "]" &&
        !isEscaped(text, index)
      ) {
        closing = index;
        break;
      }
    }
    if (closing === -1) {
      const end = malformedAt === -1 ? Math.min(text.length, opening + 2) : malformedAt;
      issues.push({
        kind: "malformed-wiki-link",
        message: "Wiki links cannot contain a newline or nested [[ and must end with ]].",
        range: sourceRange(opening, Math.max(opening + 2, end), lineStarts),
      });
      cursor = malformedAt === -1 ? opening + 2 : malformedAt + 1;
      continue;
    }

    const contentStart = opening + 2;
    const contentEnd = closing;
    const pipe = firstUnescaped(text, "|", contentStart, contentEnd);
    const destinationEnd = pipe === -1 ? contentEnd : pipe;
    const hash = firstUnescaped(text, "#", contentStart, destinationEnd);
    const noteEnd = hash === -1 ? destinationEnd : hash;
    const noteRaw = text.slice(contentStart, noteEnd);
    const headingRaw = hash === -1 ? null : text.slice(hash + 1, destinationEnd);
    const labelRaw = pipe === -1 ? null : text.slice(pipe + 1, contentEnd);
    const noteTarget = decodeLinkPart(noteRaw).trim();
    const headingTarget = headingRaw === null ? null : decodeLinkPart(headingRaw).trim();
    const label = labelRaw === null ? null : decodeLinkPart(labelRaw).trim();
    const invalid =
      (!noteTarget && headingTarget === null) ||
      (headingTarget !== null && !headingTarget) ||
      (label !== null && !label);

    if (invalid) {
      issues.push({
        kind: "malformed-wiki-link",
        message: "A wiki link needs a note or same-file heading, and explicit headings and labels cannot be empty.",
        range: sourceRange(opening, closing + 2, lineStarts),
      });
    } else {
      links.push({
        raw: text.slice(opening, closing + 2),
        noteTarget,
        headingTarget,
        label,
        range: sourceRange(opening, closing + 2, lineStarts),
        destinationRange: sourceRange(contentStart, destinationEnd, lineStarts),
        noteRange: sourceRange(contentStart, noteEnd, lineStarts),
        headingRange:
          hash === -1 ? null : sourceRange(hash + 1, destinationEnd, lineStarts),
        labelRange:
          pipe === -1 ? null : sourceRange(pipe + 1, contentEnd, lineStarts),
      });
    }
    cursor = closing + 2;
  }
  return links;
}

function firstUnescaped(
  text: string,
  character: string,
  start: number,
  end: number,
): number {
  for (let index = start; index < end; index += 1) {
    if (text[index] === character && !isEscaped(text, index)) return index;
  }
  return -1;
}

function decodeLinkPart(value: string): string {
  return value.replace(/\\([\\|#\]])/gu, "$1");
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function isIgnored(offset: number, ignored: readonly IgnoredRange[]): boolean {
  return ignored.some((range) => offset >= range.start && offset < range.end);
}
