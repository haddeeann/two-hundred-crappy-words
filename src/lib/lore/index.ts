import { fingerprintContent } from "$lib/editor/recovery";
import { parseMarkdownNote } from "./markdown";
import { normalizeLoreName } from "./normalize";
import { createResolutionCatalog, resolveWikiLink } from "./resolve";
import type {
  LoreBacklink,
  LoreDocumentRecord,
  LoreIndexIssue,
  LoreProjectIndex,
  ParsedMarkdownNote,
} from "./types";

export const LORE_INDEX_FORMAT = "200-crappy-words/lore-index" as const;
export const LORE_INDEX_VERSION = 1 as const;

export interface LoreSourceDocument {
  path: string;
  text: string;
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

  const parsed = [...parsedByPath.values()];
  const catalog = createResolutionCatalog(parsed);
  const issues = duplicateIdIssues(parsed);
  const records = new Map<string, LoreDocumentRecord>();
  const backlinks = new Map<string, LoreBacklink[]>();

  for (const document of parsed) {
    const text = textByPath.get(document.path)!;
    const outgoing = document.links.map((link) => {
      const resolution = resolveWikiLink(document.path, link, catalog);
      const context = linkContext(text, link.range.start, link.range.end);
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
      fingerprint: fingerprintContent(text),
      size: new TextEncoder().encode(text).byteLength,
      id: document.id,
      type: document.type,
      title: document.title,
      aliases: document.aliases,
      headings: document.headings,
      outgoing,
      parseIssues: document.issues,
      normalizedSearchText: normalizeLoreName(text),
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

function duplicateIdIssues(documents: readonly ParsedMarkdownNote[]): LoreIndexIssue[] {
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
