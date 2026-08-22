import { normalizeLoreName } from "./normalize";
import { lineStartsFor, sourceRange } from "./source";
import type {
  LoreDocumentRecord,
  LoreProjectIndex,
  SourceRange,
} from "./types";

export const DEFAULT_UNLINKED_MENTION_LIMIT = 20;
export const MAX_UNLINKED_MENTIONS_PER_TARGET = 3;
const MIN_MENTION_CODE_POINTS = 4;
const MAX_MENTION_WORDS = 12;
const COMMON_SINGLE_WORDS = new Set([
  "chapter",
  "draft",
  "event",
  "location",
  "note",
  "scene",
  "story",
  "that",
  "this",
  "world",
]);
const WORD_PATTERN = /[\p{L}\p{N}\p{M}]+/gu;

interface Candidate {
  targetPath: string;
  targetTitle: string;
  matchedBy: "title" | "alias";
  wordCount: number;
}

interface OffsetRange {
  start: number;
  end: number;
}

export interface LoreUnlinkedMention {
  key: string;
  sourcePath: string;
  targetPath: string;
  targetTitle: string;
  matchedText: string;
  matchedBy: "title" | "alias";
  context: string;
  sourceLocation: string;
  range: SourceRange;
}

export function activeLoreMentions(
  index: LoreProjectIndex | null,
  activePath: string | null,
  limit = DEFAULT_UNLINKED_MENTION_LIMIT,
): LoreUnlinkedMention[] {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("Unlinked mention limit must be a positive safe integer.");
  }
  if (!index || !activePath) return [];
  const source = index.documents.get(activePath);
  if (!source) return [];

  const candidates = mentionCandidates(index, source);
  if (candidates.size === 0) return [];
  const exclusions = mentionExclusions(source);
  const lineStarts = lineStartsFor(source.searchText);
  const matches: LoreUnlinkedMention[] = [];
  const lines = source.searchText.split("\n");
  let lineStart = 0;
  const maximumWords = Math.max(
    1,
    ...[...candidates.values()].map(({ wordCount }) => wordCount),
  );

  for (const line of lines) {
    const words = [...line.matchAll(WORD_PATTERN)].map((match) => ({
      start: lineStart + (match.index ?? 0),
      end: lineStart + (match.index ?? 0) + match[0].length,
    }));
    for (let first = 0; first < words.length; first += 1) {
      for (
        let last = first;
        last < words.length && last < first + maximumWords;
        last += 1
      ) {
        const start = words[first]!.start;
        const end = words[last]!.end;
        if (overlapsAny(start, end, exclusions)) continue;
        const matchedText = source.searchText.slice(start, end);
        const candidate = candidates.get(normalizeLoreName(matchedText));
        if (!candidate || candidate.wordCount !== last - first + 1) continue;
        const range = sourceRange(start, end, lineStarts);
        matches.push({
          key: `${source.path}:${start}:${candidate.targetPath}`,
          sourcePath: source.path,
          targetPath: candidate.targetPath,
          targetTitle: candidate.targetTitle,
          matchedText,
          matchedBy: candidate.matchedBy,
          context: boundedLineContext(line, start - lineStart, end - lineStart),
          sourceLocation: `${source.path}:${range.line}:${range.column}`,
          range,
        });
      }
    }
    lineStart += line.length + 1;
  }

  matches.sort(
    (first, second) =>
      first.range.start - second.range.start ||
      second.range.end - second.range.start - (first.range.end - first.range.start) ||
      first.targetPath.localeCompare(second.targetPath),
  );
  const accepted: LoreUnlinkedMention[] = [];
  const perTarget = new Map<string, number>();
  for (const mention of matches) {
    if (accepted.some(({ range }) => rangesOverlap(range, mention.range))) continue;
    const targetCount = perTarget.get(mention.targetPath) ?? 0;
    if (targetCount >= MAX_UNLINKED_MENTIONS_PER_TARGET) continue;
    accepted.push(mention);
    perTarget.set(mention.targetPath, targetCount + 1);
    if (accepted.length === limit) break;
  }
  return accepted;
}

function mentionCandidates(
  index: LoreProjectIndex,
  source: LoreDocumentRecord,
): Map<string, Candidate> {
  const grouped = new Map<string, Candidate[]>();
  for (const document of index.documents.values()) {
    const values = [
      { value: document.title, matchedBy: "title" as const },
      ...document.aliases.map((value) => ({ value, matchedBy: "alias" as const })),
    ];
    for (const { value, matchedBy } of values) {
      const eligible = eligibleMentionName(value);
      if (!eligible) continue;
      const candidate: Candidate = {
        targetPath: document.path,
        targetTitle: document.title,
        matchedBy,
        wordCount: eligible.wordCount,
      };
      const existing = grouped.get(eligible.normalizedName) ?? [];
      if (!existing.some(({ targetPath }) => targetPath === candidate.targetPath)) {
        existing.push(candidate);
      } else if (matchedBy === "title") {
        const index = existing.findIndex(({ targetPath }) => targetPath === candidate.targetPath);
        existing[index] = candidate;
      }
      grouped.set(eligible.normalizedName, existing);
    }
  }
  return new Map(
    [...grouped.entries()]
      .filter(([, values]) => values.length === 1 && values[0]!.targetPath !== source.path)
      .map(([name, values]) => [name, values[0]!] as const),
  );
}

function eligibleMentionName(
  value: string,
): { normalizedName: string; wordCount: number } | null {
  const trimmed = value.trim();
  const codePoints = [...trimmed];
  if (
    codePoints.length < MIN_MENTION_CODE_POINTS ||
    !/^\p{L}/u.test(trimmed) ||
    !/[\p{L}\p{N}\p{M}]$/u.test(trimmed)
  ) {
    return null;
  }
  const words = [...trimmed.matchAll(WORD_PATTERN)];
  if (words.length === 0 || words.length > MAX_MENTION_WORDS) return null;
  const normalizedName = normalizeLoreName(trimmed);
  if (words.length === 1 && COMMON_SINGLE_WORDS.has(normalizedName)) return null;
  return { normalizedName, wordCount: words.length };
}

function mentionExclusions(source: LoreDocumentRecord): OffsetRange[] {
  const text = source.searchText;
  const exclusions: OffsetRange[] = [];
  const parsedFrontmatterEnd = frontmatterEnd(text);
  if (parsedFrontmatterEnd > 0) exclusions.push({ start: 0, end: parsedFrontmatterEnd });
  exclusions.push(...source.headings.map(({ range }) => ({
    start: range.start,
    end: range.end,
  })));
  exclusions.push(...source.outgoing.map(({ link }) => ({
    start: link.range.start,
    end: link.range.end,
  })));
  collectMarkdownSyntaxExclusions(text, exclusions);
  return mergeRanges(exclusions);
}

function frontmatterEnd(text: string): number {
  if (!/^(?:\uFEFF)?---[\t ]*(?:\r?\n|$)/u.test(text)) return 0;
  const lines = text.split(/(?<=\n)/u);
  let offset = lines[0]?.length ?? 0;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    offset += line.length;
    if (/^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/u.test(line)) return offset;
  }
  return text.length;
}

function collectMarkdownSyntaxExclusions(text: string, exclusions: OffsetRange[]): void {
  let fence: { marker: "`" | "~"; length: number; start: number } | null = null;
  let lineStart = 0;
  for (const lineWithBreak of text.split(/(?<=\n)/u)) {
    const line = lineWithBreak.replace(/\r?\n$/u, "");
    const marker = /^(?: {0,3})(`{3,}|~{3,})/u.exec(line)?.[1];
    if (marker) {
      if (!fence) {
        fence = { marker: marker[0] as "`" | "~", length: marker.length, start: lineStart };
      } else if (marker[0] === fence.marker && marker.length >= fence.length) {
        exclusions.push({ start: fence.start, end: lineStart + lineWithBreak.length });
        fence = null;
      }
    } else if (!fence) {
      collectInlineRanges(line, lineStart, exclusions);
    }
    lineStart += lineWithBreak.length;
  }
  if (fence) exclusions.push({ start: fence.start, end: text.length });

  let commentStart = text.indexOf("<!--");
  while (commentStart !== -1) {
    const closing = text.indexOf("-->", commentStart + 4);
    const end = closing === -1 ? text.length : closing + 3;
    exclusions.push({ start: commentStart, end });
    if (closing === -1) break;
    commentStart = text.indexOf("<!--", end);
  }
}

function collectInlineRanges(
  line: string,
  lineStart: number,
  exclusions: OffsetRange[],
): void {
  const markdownLinks = /!?\[[^\]\n]*\]\([^\)\n]*\)/gu;
  for (const match of line.matchAll(markdownLinks)) {
    const start = lineStart + (match.index ?? 0);
    exclusions.push({ start, end: start + match[0].length });
  }
  let cursor = 0;
  while (cursor < line.length) {
    if (line[cursor] !== "`") {
      cursor += 1;
      continue;
    }
    let length = 1;
    while (line[cursor + length] === "`") length += 1;
    const marker = "`".repeat(length);
    const closing = line.indexOf(marker, cursor + length);
    if (closing === -1) {
      cursor += length;
      continue;
    }
    exclusions.push({
      start: lineStart + cursor,
      end: lineStart + closing + length,
    });
    cursor = closing + length;
  }
}

function mergeRanges(ranges: readonly OffsetRange[]): OffsetRange[] {
  const sorted = [...ranges]
    .filter(({ start, end }) => end > start)
    .sort((first, second) => first.start - second.start || first.end - second.end);
  const merged: OffsetRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function overlapsAny(start: number, end: number, ranges: readonly OffsetRange[]): boolean {
  return ranges.some((range) => range.start < end && start < range.end);
}

function rangesOverlap(first: SourceRange, second: SourceRange): boolean {
  return first.start < second.end && second.start < first.end;
}

function boundedLineContext(line: string, start: number, end: number, limit = 220): string {
  const trimmed = line.trim();
  if (trimmed.length <= limit) return trimmed;
  const leading = line.length - line.trimStart().length;
  const matchStart = Math.max(0, start - leading);
  const matchEnd = Math.max(matchStart, end - leading);
  const windowStart = Math.max(0, Math.min(matchStart - 70, trimmed.length - limit));
  const windowEnd = Math.min(trimmed.length, Math.max(windowStart + limit, matchEnd));
  return `${windowStart > 0 ? "…" : ""}${trimmed.slice(windowStart, windowEnd)}${windowEnd < trimmed.length ? "…" : ""}`;
}
