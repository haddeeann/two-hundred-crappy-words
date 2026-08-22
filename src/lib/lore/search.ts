import {
  markdownFileStem,
  normalizeLoreName,
  normalizeLoreSearchText,
  relativeMarkdownStem,
} from "./normalize";
import type {
  LoreDocumentRecord,
  LoreProjectIndex,
  SourceRange,
} from "./types";

export const DEFAULT_LORE_SEARCH_LIMIT = 30;
export const MAX_LORE_SEARCH_CODE_POINTS = 120;

export type LoreSearchMatchKind =
  | "title"
  | "alias"
  | "filename"
  | "path"
  | "heading"
  | "content";

export interface LoreSearchResult {
  key: string;
  path: string;
  title: string;
  kind: LoreSearchMatchKind;
  reason: string;
  context: string;
  range: SourceRange | null;
}

interface RankedSearchResult extends LoreSearchResult {
  score: readonly (number | string)[];
  normalizedContentOffset?: number;
}

interface FieldCandidate {
  kind: Exclude<LoreSearchMatchKind, "content">;
  value: string;
  range: SourceRange | null;
  ordinal: number;
}

export function searchProjectLore(
  index: LoreProjectIndex,
  rawQuery: string,
  limit = DEFAULT_LORE_SEARCH_LIMIT,
): LoreSearchResult[] {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("Lore search limit must be a positive safe integer.");
  }
  const query = rawQuery.trim();
  if ([...query].length > MAX_LORE_SEARCH_CODE_POINTS) {
    throw new RangeError(
      `Lore search query must be at most ${MAX_LORE_SEARCH_CODE_POINTS} Unicode code points.`,
    );
  }
  const ranked = [...index.documents.values()].map((document) =>
    bestDocumentMatch(document, query),
  );
  return ranked
    .filter((result): result is RankedSearchResult => result !== null)
    .sort(compareRanked)
    .slice(0, limit)
    .map((result) => materializeResult(index, query, result));
}

function bestDocumentMatch(
  document: LoreDocumentRecord,
  query: string,
): RankedSearchResult | null {
  if (!query) {
    return {
      key: `title:${document.path}`,
      path: document.path,
      title: document.title,
      kind: "title",
      reason: "Note title",
      context: document.path,
      range: null,
      score: [20, 0, 0, normalizeLoreName(document.title), document.path, 0],
    };
  }

  const fields: FieldCandidate[] = [
    { kind: "title", value: document.title, range: null, ordinal: 0 },
    ...document.aliases.map((value, ordinal) => ({
      kind: "alias" as const,
      value,
      range: null,
      ordinal: ordinal + 1,
    })),
    {
      kind: "filename",
      value: markdownFileStem(document.path),
      range: null,
      ordinal: document.aliases.length + 1,
    },
    {
      kind: "path",
      value: relativeMarkdownStem(document.path),
      range: null,
      ordinal: document.aliases.length + 2,
    },
    ...document.headings.map((heading, ordinal) => ({
      kind: "heading" as const,
      value: heading.lookupText,
      range: heading.textRange,
      ordinal: document.aliases.length + 3 + ordinal,
    })),
  ];
  const fieldMatches = fields.flatMap((field): RankedSearchResult[] => {
    const match = fieldMatchScore(query, field.value, field.kind);
    if (!match) return [];
    return [{
      key: `${field.kind}:${document.path}:${field.range?.start ?? field.ordinal}`,
      path: document.path,
      title: document.title,
      kind: field.kind,
      reason: matchReason(field.kind, field.value),
      context: field.kind === "title" ? document.path : field.value,
      range: field.range,
      score: [match[0], match[1], field.ordinal, document.path, field.range?.start ?? 0],
    }];
  });
  fieldMatches.sort(compareRanked);
  if (fieldMatches[0]) return fieldMatches[0];

  const needle = normalizeLoreSearchText(query);
  const normalizedContentOffset = document.normalizedSearchText.indexOf(needle);
  if (normalizedContentOffset === -1) return null;
  return {
    key: `content:${document.path}:${normalizedContentOffset}`,
    path: document.path,
    title: document.title,
    kind: "content",
    reason: "Text match",
    context: "",
    range: null,
    normalizedContentOffset,
    score: [12, normalizedContentOffset, 0, document.path, normalizedContentOffset],
  };
}

function materializeResult(
  index: LoreProjectIndex,
  query: string,
  ranked: RankedSearchResult,
): LoreSearchResult {
  const { score: _score, normalizedContentOffset, ...result } = ranked;
  if (result.kind !== "content" || normalizedContentOffset === undefined) {
    return result;
  }
  const document = index.documents.get(result.path);
  const content = document
    ? contentMatchAt(document, query, normalizedContentOffset)
    : null;
  return content
    ? { ...result, context: content.context, range: content.range }
    : result;
}

function fieldMatchScore(
  query: string,
  value: string,
  kind: Exclude<LoreSearchMatchKind, "content">,
): readonly [number, number] | null {
  const needle = normalizeLoreName(query);
  const haystack = normalizeLoreName(value);
  const family = kind === "title" ? 0 : kind === "heading" ? 2 : 1;
  if (haystack === needle) return [family, 0];
  if (haystack.startsWith(needle)) return [3 + family, 0];
  const wordIndex = haystack
    .split(/[^\p{L}\p{N}]+/u)
    .findIndex((word) => word.startsWith(needle));
  if (wordIndex !== -1) return [6 + family, wordIndex];
  const substring = haystack.indexOf(needle);
  return substring === -1 ? null : [9 + family, substring];
}

function contentMatchAt(
  document: LoreDocumentRecord,
  query: string,
  normalizedOffset: number,
): { context: string; range: SourceRange } | null {
  const needle = normalizeLoreSearchText(query);
  const normalizedLineStart =
    document.normalizedSearchText.lastIndexOf("\n", normalizedOffset - 1) + 1;
  const lineNumber = countLines(document.normalizedSearchText, normalizedLineStart);
  const originalLine = lineAt(document.searchText, lineNumber);
  if (!originalLine) return null;
  const mapped = normalizedRangeInLine(originalLine.text, needle);
  if (!mapped) return null;
  const start = originalLine.start + mapped.start;
  const end = originalLine.start + mapped.end;
  return {
    context: boundedContext(originalLine.text, mapped.start, mapped.end),
    range: {
      start,
      end,
      line: lineNumber,
      column: mapped.start + 1,
    },
  };
}

function normalizedRangeInLine(
  line: string,
  needle: string,
): { start: number; end: number } | null {
  const normalizedLine = normalizeLoreSearchText(line);
  const directOffset = normalizedLine.indexOf(needle);
  if (directOffset === -1) return null;
  if (normalizedLine.length === line.length) {
    return { start: directOffset, end: directOffset + needle.length };
  }
  const segments = graphemeSegments(line);
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (const segment of segments) {
    const folded = normalizeLoreSearchText(segment.text);
    normalized += folded;
    for (let index = 0; index < folded.length; index += 1) {
      starts.push(segment.start);
      ends.push(segment.end);
    }
  }
  const offset = normalized.indexOf(needle);
  if (offset === -1) return null;
  return {
    start: starts[offset] ?? 0,
    end: ends[offset + needle.length - 1] ?? line.length,
  };
}

function graphemeSegments(line: string): { text: string; start: number; end: number }[] {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(line)].map((segment) => ({
      text: segment.segment,
      start: segment.index,
      end: segment.index + segment.segment.length,
    }));
  }
  const segments: { text: string; start: number; end: number }[] = [];
  let start = 0;
  for (const text of line) {
    segments.push({ text, start, end: start + text.length });
    start += text.length;
  }
  return segments;
}

function lineAt(
  text: string,
  lineNumber: number,
): { text: string; start: number } | null {
  let start = 0;
  for (let line = 1; line < lineNumber; line += 1) {
    const newline = text.indexOf("\n", start);
    if (newline === -1) return null;
    start = newline + 1;
  }
  const newline = text.indexOf("\n", start);
  return {
    text: text.slice(start, newline === -1 ? text.length : newline),
    start,
  };
}

function countLines(text: string, end: number): number {
  let lines = 1;
  for (let index = 0; index < end; index += 1) {
    if (text[index] === "\n") lines += 1;
  }
  return lines;
}

function boundedContext(line: string, start: number, end: number, limit = 220): string {
  const trimmed = line.trim();
  if (trimmed.length <= limit) return trimmed;
  const leading = line.length - line.trimStart().length;
  const matchStart = Math.max(0, start - leading);
  const matchEnd = Math.max(matchStart, end - leading);
  const windowStart = Math.max(
    0,
    Math.min(matchStart - 70, trimmed.length - limit),
  );
  const windowEnd = Math.min(
    trimmed.length,
    Math.max(windowStart + limit, matchEnd),
  );
  return `${windowStart > 0 ? "…" : ""}${trimmed.slice(windowStart, windowEnd)}${windowEnd < trimmed.length ? "…" : ""}`;
}

function matchReason(
  kind: Exclude<LoreSearchMatchKind, "content">,
  value: string,
): string {
  if (kind === "title") return "Note title";
  if (kind === "alias") return `Alias: ${value}`;
  if (kind === "filename") return `Filename: ${value}`;
  if (kind === "path") return `Project path: ${value}`;
  return `Heading: ${value}`;
}

function compareRanked(first: RankedSearchResult, second: RankedSearchResult): number {
  for (let index = 0; index < first.score.length; index += 1) {
    const left = first.score[index]!;
    const right = second.score[index]!;
    if (left === right) continue;
    if (typeof left === "number" && typeof right === "number") return left - right;
    return String(left).localeCompare(String(right));
  }
  return 0;
}
