import { markdownFileStem, normalizeLoreName, relativeMarkdownStem } from "./normalize";
import { createResolutionCatalog, resolveWikiLink } from "./resolve";
import type { LoreResolutionCatalog } from "./resolve";
import type {
  LoreDocumentRecord,
  LoreProjectIndex,
  ParsedWikiLink,
  SourceRange,
} from "./types";

export const DEFAULT_LORE_COMPLETION_LIMIT = 8;

export interface WikiLinkCompletionContext {
  linkStart: number;
  replaceStart: number;
  replaceEnd: number;
  mode: "note" | "heading";
  noteTarget: string;
  query: string;
}

export interface LoreCompletionCandidate {
  key: string;
  kind: "note" | "heading";
  label: string;
  detail: string;
  insertText: string;
  targetPath: string;
  headingStart: number | null;
}

interface RankedCandidate extends LoreCompletionCandidate {
  score: readonly [number, number, number, string, number];
}

const catalogCache = new WeakMap<LoreProjectIndex, LoreResolutionCatalog>();

export function findWikiLinkCompletion(
  text: string,
  selectionStart: number,
  selectionEnd = selectionStart,
): WikiLinkCompletionContext | null {
  if (
    selectionStart !== selectionEnd ||
    selectionStart < 0 ||
    selectionStart > text.length
  ) {
    return null;
  }

  const lineStart = text.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  let linkStart = -1;
  for (let index = lineStart; index < selectionStart; index += 1) {
    const pair = text.slice(index, index + 2);
    if (pair === "[[" && !isEscaped(text, index)) {
      if (linkStart !== -1) return null;
      linkStart = index;
      index += 1;
    } else if (pair === "]]" && linkStart !== -1 && !isEscaped(text, index)) {
      linkStart = -1;
      index += 1;
    }
  }
  if (linkStart === -1) return null;

  const lineEndCandidate = text.indexOf("\n", selectionStart);
  const lineEnd = lineEndCandidate === -1 ? text.length : lineEndCandidate;
  for (let index = selectionStart; index < lineEnd; index += 1) {
    if (text.slice(index, index + 2) === "]]" && !isEscaped(text, index)) {
      return null;
    }
  }

  const partial = text.slice(linkStart + 2, selectionStart);
  const labelAt = firstUnescaped(partial, "|");
  if (labelAt !== -1) return null;
  const headingAt = firstUnescaped(partial, "#");
  if (headingAt === -1) {
    return {
      linkStart,
      replaceStart: linkStart + 2,
      replaceEnd: selectionStart,
      mode: "note",
      noteTarget: "",
      query: decodeWikiText(partial.trim()),
    };
  }

  return {
    linkStart,
    replaceStart: linkStart + 2 + headingAt + 1,
    replaceEnd: selectionStart,
    mode: "heading",
    noteTarget: decodeWikiText(partial.slice(0, headingAt).trim()),
    query: decodeWikiText(partial.slice(headingAt + 1).trim()),
  };
}

export function loreCompletionCandidates(
  index: LoreProjectIndex,
  sourcePath: string,
  context: WikiLinkCompletionContext,
  limit = DEFAULT_LORE_COMPLETION_LIMIT,
): LoreCompletionCandidate[] {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("Lore completion limit must be a positive safe integer.");
  }
  const catalog = completionCatalog(index);
  const ranked = context.mode === "note"
    ? rankNotes(index, catalog, context.query)
    : rankHeadings(index, catalog, sourcePath, context);
  return ranked.sort(compareRanked).slice(0, limit).map(stripScore);
}

function completionCatalog(index: LoreProjectIndex): LoreResolutionCatalog {
  const cached = catalogCache.get(index);
  if (cached) return cached;
  const catalog = createResolutionCatalog([...index.documents.values()]);
  catalogCache.set(index, catalog);
  return catalog;
}

export function applyLoreCompletion(
  text: string,
  context: WikiLinkCompletionContext,
  candidate: LoreCompletionCandidate,
): { text: string; caret: number } {
  const next =
    text.slice(0, context.replaceStart) +
    candidate.insertText +
    text.slice(context.replaceEnd);
  return {
    text: next,
    caret: context.replaceStart + candidate.insertText.length,
  };
}

function rankNotes(
  index: LoreProjectIndex,
  catalog: ReturnType<typeof createResolutionCatalog>,
  query: string,
): RankedCandidate[] {
  const ranked: RankedCandidate[] = [];
  for (const document of index.documents.values()) {
    const names = noteNames(document);
    const matches = names
      .map(({ value, source }, sourceIndex) => ({
        value,
        source,
        sourceIndex,
        match: matchScore(query, value),
      }))
      .filter((candidate) => candidate.match !== null)
      .sort(
        (first, second) =>
          compareTuple(first.match!, second.match!) ||
          first.sourceIndex - second.sourceIndex ||
          first.value.localeCompare(second.value),
      );
    const best = matches[0];
    if (!best) continue;
    const normalized = normalizeLoreName(best.value);
    const isPath = best.source === "path";
    const collides = (catalog.names.get(normalized)?.size ?? 0) > 1;
    const insertion = isPath || collides
      ? relativeMarkdownStem(document.path)
      : best.value;
    ranked.push({
      key: `note:${document.path}`,
      kind: "note",
      label: document.title,
      detail: best.source === "title" ? document.path : `${best.source}: ${best.value} · ${document.path}`,
      insertText: escapeWikiText(insertion),
      targetPath: document.path,
      headingStart: null,
      score: [best.match![0], best.match![1], best.sourceIndex, document.path, 0],
    });
  }
  return ranked;
}

function rankHeadings(
  index: LoreProjectIndex,
  catalog: ReturnType<typeof createResolutionCatalog>,
  sourcePath: string,
  context: WikiLinkCompletionContext,
): RankedCandidate[] {
  const targetPath = resolvedHeadingDocument(sourcePath, context.noteTarget, catalog);
  const target = targetPath ? index.documents.get(targetPath) : null;
  if (!target) return [];
  return target.headings.flatMap((heading) => {
    const match = matchScore(context.query, heading.lookupText);
    if (!match) return [];
    return [{
      key: `heading:${target.path}:${heading.range.start}`,
      kind: "heading" as const,
      label: heading.text,
      detail: `${target.title} · line ${heading.range.line}`,
      insertText: escapeWikiText(heading.lookupText),
      targetPath: target.path,
      headingStart: heading.range.start,
      score: [match[0], match[1], heading.level, target.path, heading.range.start] as const,
    }];
  });
}

function resolvedHeadingDocument(
  sourcePath: string,
  noteTarget: string,
  catalog: ReturnType<typeof createResolutionCatalog>,
): string | null {
  const range: SourceRange = { start: 0, end: 0, line: 1, column: 1 };
  const link: ParsedWikiLink = {
    raw: "",
    noteTarget,
    headingTarget: "completion",
    label: null,
    range,
    destinationRange: range,
    noteRange: range,
    headingRange: range,
    labelRange: null,
  };
  const resolution = resolveWikiLink(sourcePath, link, catalog);
  return "targetPath" in resolution ? resolution.targetPath : null;
}

function noteNames(document: LoreDocumentRecord): { value: string; source: string }[] {
  const values = [
    { value: document.title, source: "title" },
    ...document.aliases.map((value) => ({ value, source: "alias" })),
    { value: markdownFileStem(document.path), source: "filename" },
    { value: relativeMarkdownStem(document.path), source: "path" },
  ];
  const seen = new Set<string>();
  return values.filter(({ value }) => {
    const normalized = normalizeLoreName(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function matchScore(query: string, value: string): readonly [number, number] | null {
  const needle = normalizeLoreName(query);
  const haystack = normalizeLoreName(value);
  if (!needle) return [4, 0];
  if (haystack === needle) return [0, 0];
  if (haystack.startsWith(needle)) return [1, 0];
  const wordIndex = haystack
    .split(/[^\p{L}\p{N}]+/u)
    .findIndex((word) => word.startsWith(needle));
  if (wordIndex !== -1) return [2, wordIndex];
  const substring = haystack.indexOf(needle);
  return substring === -1 ? null : [3, substring];
}

function compareRanked(first: RankedCandidate, second: RankedCandidate): number {
  return compareTuple(first.score, second.score);
}

function compareTuple(
  first: readonly (number | string)[],
  second: readonly (number | string)[],
): number {
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    const left = first[index];
    const right = second[index];
    if (left === right) continue;
    if (typeof left === "number" && typeof right === "number") return left - right;
    return String(left).localeCompare(String(right));
  }
  return 0;
}

function stripScore({ score: _score, ...candidate }: RankedCandidate): LoreCompletionCandidate {
  return candidate;
}

function firstUnescaped(value: string, token: string): number {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === token && !isEscaped(value, index)) return index;
  }
  return -1;
}

function isEscaped(value: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function decodeWikiText(value: string): string {
  return value.replace(/\\([\\|#\]])/gu, "$1");
}

function escapeWikiText(value: string): string {
  return value.replace(/[\\|#\]]/gu, "\\$&");
}
