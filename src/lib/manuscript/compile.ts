import { fingerprintContent } from "$lib/editor/recovery";
import { parseFrontmatter } from "$lib/lore/frontmatter";
import { countManuscriptSourceWords } from "./word-count";
import type {
  ManuscriptProjectLoadResult,
  ManuscriptSourceState,
  ReconciledManuscriptChapter,
  ReconciledManuscriptScene,
} from "./source-reconciliation";

export type ManuscriptCompileFormat = "markdown" | "text";

export interface ManuscriptCompileEntry {
  itemId: string;
  kind: "chapter" | "scene";
  title: string;
  included: boolean;
  sourcePath?: string;
}

export interface ManuscriptCompileBlocker {
  itemId: string;
  title: string;
  sourcePath: string;
  hasStableId: boolean;
  sourceKind: ManuscriptSourceState["kind"] | "changed" | "not-loaded";
  message: string;
}

export interface ManuscriptCompileSummary {
  chapters: number;
  scenes: number;
  words: number;
  excludedItems: number;
}

interface CompilePlanBase {
  manuscriptId: string;
  manuscriptTitle: string;
  format: ManuscriptCompileFormat;
  suggestedFilename: string;
  entries: ManuscriptCompileEntry[];
  blockers: ManuscriptCompileBlocker[];
  summary: ManuscriptCompileSummary;
}

export type ManuscriptCompilePlan =
  | { kind: "unavailable"; reason: string }
  | (CompilePlanBase & { kind: "blocked" })
  | (CompilePlanBase & { kind: "ready"; output: string; outputFingerprint: string });

interface CompileToken {
  kind: "chapter" | "scene";
  title?: string;
  body?: string;
}

/**
 * Build a deterministic reading copy from an already reconciled manuscript and
 * freshly loaded source text. This function performs no filesystem writes.
 */
export function planManuscriptCompile({
  project,
  manuscriptId,
  format,
  sourceTexts,
}: {
  project: ManuscriptProjectLoadResult;
  manuscriptId: string;
  format: ManuscriptCompileFormat;
  sourceTexts: ReadonlyMap<string, string>;
}): ManuscriptCompilePlan {
  if (project.kind !== "ready") {
    return {
      kind: "unavailable",
      reason: "The manuscript structure is not currently valid and verified.",
    };
  }
  const manuscript = project.reconciled.manuscripts.find(
    (candidate) => candidate.manuscript.id === manuscriptId,
  );
  if (!manuscript) {
    return { kind: "unavailable", reason: "The selected manuscript is no longer available." };
  }

  const entries: ManuscriptCompileEntry[] = [];
  const blockers: ManuscriptCompileBlocker[] = [];
  const tokens: CompileToken[] = [];
  let chapters = 0;
  let scenes = 0;
  let words = 0;
  let excludedItems = 0;

  const addExcludedScene = (scene: ReconciledManuscriptScene): void => {
    excludedItems += 1;
    entries.push({
      itemId: scene.item.id,
      kind: "scene",
      title: scene.item.title,
      included: false,
      sourcePath: declaredPath(scene.source),
    });
  };

  const addScene = (scene: ReconciledManuscriptScene): void => {
    if (!scene.item.includeInCompile) {
      addExcludedScene(scene);
      return;
    }
    scenes += 1;
    entries.push({
      itemId: scene.item.id,
      kind: "scene",
      title: scene.item.title,
      included: true,
      sourcePath: declaredPath(scene.source),
    });
    const body = verifiedSourceBody(scene, sourceTexts, blockers);
    if (body === null) return;
    if (scene.source.kind === "ready") {
      words += countManuscriptSourceWords(sourceTexts.get(scene.source.resolvedPath) ?? "");
    }
    tokens.push({ kind: "scene", body });
  };

  for (const item of manuscript.items) {
    if (!("children" in item)) {
      addScene(item);
      continue;
    }
    const chapter = item as ReconciledManuscriptChapter;
    if (!chapter.item.includeInCompile) {
      excludedItems += 1;
      entries.push({
        itemId: chapter.item.id,
        kind: "chapter",
        title: chapter.item.title,
        included: false,
        ...(chapter.source ? { sourcePath: declaredPath(chapter.source) } : {}),
      });
      for (const child of chapter.children) addExcludedScene(child);
      continue;
    }

    chapters += 1;
    entries.push({
      itemId: chapter.item.id,
      kind: "chapter",
      title: chapter.item.title,
      included: true,
      ...(chapter.source ? { sourcePath: declaredPath(chapter.source) } : {}),
    });
    tokens.push({ kind: "chapter", title: chapter.item.title });
    if (chapter.source) {
      scenes += 1;
      const syntheticScene: ReconciledManuscriptScene = {
        item: {
          ...chapter.item,
          kind: "scene",
          source: chapter.item.source!,
        },
        source: chapter.source,
      };
      const body = verifiedSourceBody(syntheticScene, sourceTexts, blockers);
      if (body !== null) {
        words += countManuscriptSourceWords(
          chapter.source.kind === "ready"
            ? sourceTexts.get(chapter.source.resolvedPath) ?? ""
            : "",
        );
        tokens.push({ kind: "scene", body });
      }
      continue;
    }
    for (const child of chapter.children) addScene(child);
  }

  const base: CompilePlanBase = {
    manuscriptId,
    manuscriptTitle: manuscript.manuscript.title,
    format,
    suggestedFilename: suggestedCompileFilename(manuscript.manuscript.title, format),
    entries,
    blockers,
    summary: { chapters, scenes, words, excludedItems },
  };
  if (blockers.length > 0) return { ...base, kind: "blocked" };

  const output = format === "markdown"
    ? renderMarkdown(manuscript.manuscript.title, tokens)
    : renderPlainText(manuscript.manuscript.title, tokens);
  return {
    ...base,
    kind: "ready",
    output,
    outputFingerprint: fingerprintContent(output),
  };
}

function verifiedSourceBody(
  scene: ReconciledManuscriptScene,
  sourceTexts: ReadonlyMap<string, string>,
  blockers: ManuscriptCompileBlocker[],
): string | null {
  const state = scene.source;
  const path = declaredPath(state);
  if (state.kind !== "ready") {
    blockers.push({
      itemId: scene.item.id,
      title: scene.item.title,
      sourcePath: path,
      hasStableId: Boolean(scene.item.source.noteId),
      sourceKind: state.kind,
      message: sourceMessage(state),
    });
    return null;
  }
  const text = sourceTexts.get(state.resolvedPath);
  if (text === undefined) {
    blockers.push({
      itemId: scene.item.id,
      title: scene.item.title,
      sourcePath: state.resolvedPath,
      hasStableId: Boolean(scene.item.source.noteId),
      sourceKind: "not-loaded",
      message: "The source was not freshly loaded for this compile preview.",
    });
    return null;
  }
  if (fingerprintContent(text) !== state.fingerprint) {
    blockers.push({
      itemId: scene.item.id,
      title: scene.item.title,
      sourcePath: state.resolvedPath,
      hasStableId: Boolean(scene.item.source.noteId),
      sourceKind: "changed",
      message: "The source changed after manuscript verification. Refresh before compiling.",
    });
    return null;
  }
  return markdownBody(text);
}

function declaredPath(state: ManuscriptSourceState): string {
  return state.declaredPath;
}

function sourceMessage(state: Exclude<ManuscriptSourceState, { kind: "ready" }>): string {
  if (state.kind === "moved") {
    return `The source moved to ${state.suggestedPath}; review its path repair before compiling.`;
  }
  return state.message;
}

export function markdownBody(text: string): string {
  const frontmatter = parseFrontmatter(text);
  const body = frontmatter.range ? text.slice(frontmatter.bodyStart) : text;
  return trimBlankLines(body.replace(/\r\n?/gu, "\n"));
}

export function markdownToReadableText(text: string): string {
  let value = markdownBody(text);
  value = value.replace(/<!--[\s\S]*?-->/gu, "");
  const lines = value.split("\n");
  const rendered: string[] = [];
  let fence: { marker: "`" | "~"; length: number } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index]!;
    const marker = /^(?: {0,3})(`{3,}|~{3,})/u.exec(line);
    if (marker) {
      const next = { marker: marker[1]![0] as "`" | "~", length: marker[1]!.length };
      if (!fence) fence = next;
      else if (fence.marker === next.marker && next.length >= fence.length) fence = null;
      continue;
    }
    if (fence) {
      rendered.push(line);
      continue;
    }
    if (/^(?: {0,3})(=+|-+)\s*$/u.test(line) && rendered.at(-1)?.trim()) continue;
    line = line.replace(/^( {0,3})#{1,6}(?:[\t ]+|$)/u, "$1");
    line = line.replace(/^(\s*)>\s?/u, "$1");
    if (/^\s{0,3}(?:\*\s*){3,}$/u.test(line) || /^\s{0,3}(?:-\s*){3,}$/u.test(line)) {
      rendered.push("* * *");
      continue;
    }
    rendered.push(stripInlineMarkdown(line));
  }
  return trimBlankLines(rendered.join("\n").replace(/\n{3,}/gu, "\n\n"));
}

function stripInlineMarkdown(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, (_match, alt: string) =>
      alt.trim() ? `[Image: ${alt.trim()}]` : "[Image]",
    )
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/gu, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/gu, "$2")
    .replace(/\[\[([^\]]+)\]\]/gu, "$1")
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gu, "$1")
    .replace(/<\/?[A-Za-z][^>]*>/gu, "")
    .replace(/(`+)(.*?)\1/gu, "$2")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/__([^_]+)__/gu, "$1")
    .replace(/~~([^~]+)~~/gu, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/gu, "$1")
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/gu, "$1")
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/gu, "$1");
}

function renderMarkdown(title: string, tokens: readonly CompileToken[]): string {
  return renderTokens(`# ${title}`, tokens, (chapter) => `## ${chapter}`, (body) => body);
}

function renderPlainText(title: string, tokens: readonly CompileToken[]): string {
  const heading = `${title}\n${"=".repeat(Math.max(3, title.length))}`;
  return renderTokens(
    heading,
    tokens,
    (chapter) => `${chapter}\n${"-".repeat(Math.max(3, chapter.length))}`,
    markdownToReadableText,
  );
}

function renderTokens(
  title: string,
  tokens: readonly CompileToken[],
  chapter: (title: string) => string,
  scene: (body: string) => string,
): string {
  const sections = [title];
  let previous: CompileToken["kind"] | null = null;
  for (const token of tokens) {
    if (token.kind === "chapter") {
      sections.push(chapter(token.title ?? ""));
      previous = "chapter";
      continue;
    }
    if (previous === "scene") sections.push("* * *");
    sections.push(scene(token.body ?? ""));
    previous = "scene";
  }
  return `${sections.join("\n\n")}\n`;
}

function suggestedCompileFilename(title: string, format: ManuscriptCompileFormat): string {
  const base = title
    .normalize("NFC")
    .replace(/[<>:"\/\\|?*\u0000-\u001f\u007f]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/[ .]+$/gu, "")
    .trim() || "Manuscript";
  return `${base}.${format === "markdown" ? "md" : "txt"}`;
}

function trimBlankLines(text: string): string {
  return text
    .replace(/^(?:[\t ]*\n)+/u, "")
    .replace(/(?:\n[\t ]*)+$/u, "");
}
