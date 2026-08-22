import { fingerprintContent } from "$lib/editor/recovery";
import { parseMarkdownNote } from "./markdown";
import { normalizeLoreSearchText } from "./normalize";
import {
  createResolutionCatalog,
  resolveWikiLink,
  type LoreResolvableDocument,
} from "./resolve";
import type {
  LoreBacklink,
  LoreDocumentRecord,
  LoreIndexIssue,
  LoreProjectIndex,
  LoreIssue,
  ParsedMarkdownNote,
  ParsedWikiLink,
} from "./types";

export const LORE_INDEX_FORMAT = "200-crappy-words/lore-index" as const;
export const LORE_INDEX_VERSION = 1 as const;

export interface LoreSourceDocument {
  path: string;
  text: string;
}

export interface CooperativeIndexOptions {
  batchSize?: number;
  yieldControl?: () => Promise<void>;
}

interface IndexableLoreDocument extends LoreResolvableDocument {
  id: string | null;
  type: string | null;
  links: readonly ParsedWikiLink[];
  issues: readonly LoreIssue[];
}

export function buildLoreProjectIndex(
  sources: readonly LoreSourceDocument[],
  generation = 1,
): LoreProjectIndex {
  const parsedByPath = new Map<string, ParsedMarkdownNote>();
  const textByPath = new Map<string, string>();
  for (const source of sources) {
    if (parsedByPath.has(source.path)) {
      throw new RangeError(`Duplicate lore source path: ${source.path}`);
    }
    parsedByPath.set(source.path, parseMarkdownNote(source.path, source.text));
    textByPath.set(source.path, source.text);
  }

  return assembleLoreIndex(
    [...parsedByPath.values()],
    textByPath,
    new Map(),
    generation,
  );
}

export async function buildLoreProjectIndexCooperatively(
  sources: readonly LoreSourceDocument[],
  generation = 1,
  options: CooperativeIndexOptions = {},
): Promise<LoreProjectIndex> {
  const batchSize = options.batchSize ?? 24;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError("Lore index batch size must be a positive safe integer.");
  }
  const yieldControl = options.yieldControl ?? yieldToMainThread;
  const parsed: ParsedMarkdownNote[] = [];
  const preparedRecords = new Map<string, LoreDocumentRecord>();
  const paths = new Set<string>();

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]!;
    if (paths.has(source.path)) {
      throw new RangeError(`Duplicate lore source path: ${source.path}`);
    }
    paths.add(source.path);
    const document = parseMarkdownNote(source.path, source.text);
    parsed.push(document);
    preparedRecords.set(
      source.path,
      preparedRecord(document, source.text),
    );
    if ((index + 1) % batchSize === 0 && index + 1 < sources.length) {
      await yieldControl();
    }
  }
  if (sources.length > batchSize) await yieldControl();
  return assembleLoreIndex(parsed, new Map(), preparedRecords, generation);
}

export function updateLoreProjectIndex(
  current: LoreProjectIndex,
  path: string,
  text: string | null,
): LoreProjectIndex {
  return updateLoreProjectIndexBatch(current, new Map([[path, text]]));
}

export function updateLoreProjectIndexBatch(
  current: LoreProjectIndex,
  changes: ReadonlyMap<string, string | null>,
): LoreProjectIndex {
  const documents: IndexableLoreDocument[] = [];
  for (const record of current.documents.values()) {
    if (!changes.has(record.path)) documents.push(recordToIndexable(record));
  }
  const textByPath = new Map<string, string>();
  for (const [path, text] of changes) {
    if (text === null) continue;
    documents.push(parseMarkdownNote(path, text));
    textByPath.set(path, text);
  }
  return assembleLoreIndex(
    documents,
    textByPath,
    current.documents,
    current.generation + 1,
  );
}

function assembleLoreIndex(
  parsed: readonly IndexableLoreDocument[],
  textByPath: ReadonlyMap<string, string>,
  previousRecords: ReadonlyMap<string, LoreDocumentRecord>,
  generation: number,
): LoreProjectIndex {
  const catalog = createResolutionCatalog(parsed);
  const issues = duplicateIdIssues(parsed);
  const records = new Map<string, LoreDocumentRecord>();
  const backlinks = new Map<string, LoreBacklink[]>();

  for (const document of parsed) {
    const text = textByPath.get(document.path);
    const previous = previousRecords.get(document.path);
    const previousContext = new Map(
      previous?.outgoing.map(({ link, context }) => [linkKey(link), context]) ?? [],
    );
    const outgoing = document.links.map((link) => {
      const resolution = resolveWikiLink(document.path, link, catalog);
      const context =
        text === undefined
          ? (previousContext.get(linkKey(link)) ?? "")
          : linkContext(text, link.range.start, link.range.end);
      if (resolution.kind === "resolved") {
        const values = backlinks.get(resolution.targetPath) ?? [];
        values.push({
          sourcePath: document.path,
          targetPath: resolution.targetPath,
          link,
          context,
        });
        backlinks.set(resolution.targetPath, values);
      }
      return { link, resolution, context };
    });

    records.set(document.path, {
      path: document.path,
      fingerprint: text === undefined ? previous!.fingerprint : fingerprintContent(text),
      size: text === undefined ? previous!.size : new TextEncoder().encode(text).byteLength,
      id: document.id,
      type: document.type,
      title: document.title,
      aliases: [...document.aliases],
      headings: [...document.headings],
      outgoing,
      parseIssues: [...document.issues],
      searchText: text === undefined ? previous!.searchText : text,
      normalizedSearchText:
        text === undefined
          ? previous!.normalizedSearchText
          : normalizeLoreSearchText(text),
    });
  }

  for (const values of backlinks.values()) {
    values.sort(
      (first, second) =>
        first.sourcePath.localeCompare(second.sourcePath) ||
        first.link.range.start - second.link.range.start,
    );
  }

  return {
    format: LORE_INDEX_FORMAT,
    version: LORE_INDEX_VERSION,
    generation,
    documents: records,
    backlinks,
    issues,
  };
}

function duplicateIdIssues(documents: readonly IndexableLoreDocument[]): LoreIndexIssue[] {
  const byId = new Map<string, string[]>();
  for (const document of documents) {
    if (!document.id) continue;
    const paths = byId.get(document.id) ?? [];
    paths.push(document.path);
    byId.set(document.id, paths);
  }
  return [...byId.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([id, paths]) => ({
      kind: "duplicate-note-id" as const,
      message: `Note ID ${id} appears in more than one file and was not repaired.`,
      paths: paths.sort((first, second) => first.localeCompare(second)),
    }))
    .sort((first, second) => first.paths[0]!.localeCompare(second.paths[0]!));
}

function recordToIndexable(record: LoreDocumentRecord): IndexableLoreDocument {
  return {
    path: record.path,
    id: record.id,
    type: record.type,
    title: record.title,
    aliases: record.aliases,
    headings: record.headings,
    links: record.outgoing.map(({ link }) => link),
    issues: record.parseIssues,
  };
}

function preparedRecord(
  document: ParsedMarkdownNote,
  text: string,
): LoreDocumentRecord {
  return {
    path: document.path,
    fingerprint: fingerprintContent(text),
    size: new TextEncoder().encode(text).byteLength,
    id: document.id,
    type: document.type,
    title: document.title,
    aliases: document.aliases,
    headings: document.headings,
    outgoing: document.links.map((link) => ({
      link,
      resolution: {
        kind: "broken-note" as const,
        candidatePaths: [],
        message: "Resolution pending.",
      },
      context: linkContext(text, link.range.start, link.range.end),
    })),
    parseIssues: document.issues,
    searchText: text,
    normalizedSearchText: normalizeLoreSearchText(text),
  };
}

function linkKey(link: ParsedWikiLink): string {
  return `${link.range.start}:${link.range.end}:${link.raw}`;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function linkContext(text: string, start: number, end: number, limit = 240): string {
  const lineStart = Math.max(text.lastIndexOf("\n", start - 1) + 1, 0);
  const nextNewline = text.indexOf("\n", end);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  const line = text.slice(lineStart, lineEnd).trim();
  if (line.length <= limit) return line;
  const linkStart = Math.max(0, start - lineStart);
  const windowStart = Math.max(0, Math.min(linkStart - 80, line.length - limit));
  const excerpt = line.slice(windowStart, windowStart + limit).trim();
  return `${windowStart > 0 ? "…" : ""}${excerpt}${windowStart + limit < line.length ? "…" : ""}`;
}
