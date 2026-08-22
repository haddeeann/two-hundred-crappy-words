import { isMarkdownPath, markdownFileStem } from "$lib/lore/normalize";
import type { LoreScanBackend, LoreScanEntry } from "$lib/lore/scan";
import type { LoreProjectIndex } from "$lib/lore/types";
import { isSafeProjectRelativePath } from "$lib/project/workspace";
import {
  reconcileManuscriptStructure,
  type ManuscriptSourceState,
  type ReconciledManuscriptItem,
} from "./source-reconciliation";
import {
  MANUSCRIPT_STRUCTURE_FILE,
  MAX_OUTLINE_TITLE_CODE_POINTS,
  serializeManuscriptStructure,
  type ManuscriptChapter,
  type ManuscriptOutlineItem,
  type ManuscriptScene,
  type ManuscriptSourceBinding,
  type ManuscriptStructure,
} from "./structure";

export type ManuscriptCreationMode = "empty" | "import";
export const MAX_MANUSCRIPT_IMPORT_ENTRIES = 20_000;

export interface ManuscriptImportSkip {
  path: string;
  reason: string;
}

export interface ManuscriptCreationIssue {
  path: string;
  message: string;
}

interface ImportScene {
  kind: "scene";
  path: string;
  title: string;
  noteId?: string;
}

interface ImportChapter {
  kind: "chapter";
  folder: string;
  title: string;
  overview?: ManuscriptSourceBinding;
  children: ImportScene[];
}

type ImportItem = ImportScene | ImportChapter;

interface ManuscriptImportSnapshot {
  relativeDirectory: string;
  items: ImportItem[];
  skipped: ManuscriptImportSkip[];
}

export interface ReadyManuscriptCreationPlan {
  kind: "ready";
  mode: ManuscriptCreationMode;
  importDirectory: string;
  structure: ManuscriptStructure;
  text: string;
  sourceFingerprints: Readonly<Record<string, string>>;
  skipped: ManuscriptImportSkip[];
  snapshot: string;
}

export type ManuscriptCreationPlan =
  | ReadyManuscriptCreationPlan
  | { kind: "blocked"; issues: ManuscriptCreationIssue[] };

export type ManuscriptCreationVerification =
  | { kind: "ready"; text: string }
  | { kind: "blocked"; issues: ManuscriptCreationIssue[] };

interface PlanOptions {
  rootPath: string;
  importDirectory: string;
  title: string;
  mode: ManuscriptCreationMode;
  backend: LoreScanBackend;
  loreIndex?: LoreProjectIndex | null;
  createId: () => string;
}

interface DiscoveryBudget {
  examinedEntries: number;
}

export async function planManuscriptCreation(
  options: PlanOptions,
): Promise<ManuscriptCreationPlan> {
  const structureState = await inspectStructureAbsence(options.rootPath, options.backend);
  if (structureState) return { kind: "blocked", issues: [structureState] };

  let imported: ManuscriptImportSnapshot = {
    relativeDirectory: options.importDirectory,
    items: [],
    skipped: [],
  };
  if (options.mode === "import") {
    const discovery = await discoverImport(
      options.rootPath,
      options.importDirectory,
      options.backend,
      options.loreIndex ?? null,
    );
    if (discovery.kind === "blocked") return discovery;
    imported = discovery.snapshot;
  }

  const structure = buildStructure(imported.items, options.title, options.createId);
  let text: string;
  try {
    text = serializeManuscriptStructure(structure);
  } catch (cause) {
    return {
      kind: "blocked",
      issues: [{ path: MANUSCRIPT_STRUCTURE_FILE, message: formatError(cause) }],
    };
  }

  const reconciled = await reconcileManuscriptStructure(
    options.rootPath,
    structure,
    options.backend,
    { loreIndex: options.loreIndex },
  );
  const sourceCheck = collectVerifiedSources(reconciled.manuscripts.flatMap((entry) => entry.items));
  if (sourceCheck.issues.length > 0) {
    return { kind: "blocked", issues: sourceCheck.issues };
  }

  return {
    kind: "ready",
    mode: options.mode,
    importDirectory: options.importDirectory,
    structure,
    text,
    sourceFingerprints: sourceCheck.fingerprints,
    skipped: imported.skipped,
    snapshot: serializeSnapshot(imported),
  };
}

export function retitleManuscriptCreationPlan(
  plan: ReadyManuscriptCreationPlan,
  title: string,
): ManuscriptCreationPlan {
  const structure: ManuscriptStructure = {
    ...plan.structure,
    manuscripts: plan.structure.manuscripts.map((manuscript, index) =>
      index === 0 ? { ...manuscript, title } : manuscript,
    ),
  };
  try {
    return {
      ...plan,
      structure,
      text: serializeManuscriptStructure(structure),
    };
  } catch (cause) {
    return {
      kind: "blocked",
      issues: [{ path: "manuscripts[0].title", message: formatError(cause) }],
    };
  }
}

export async function verifyManuscriptCreationPlan(
  rootPath: string,
  plan: ReadyManuscriptCreationPlan,
  backend: LoreScanBackend,
  loreIndex?: LoreProjectIndex | null,
): Promise<ManuscriptCreationVerification> {
  const structureState = await inspectStructureAbsence(rootPath, backend);
  if (structureState) return { kind: "blocked", issues: [structureState] };

  if (plan.mode === "import") {
    const discovery = await discoverImport(
      rootPath,
      plan.importDirectory,
      backend,
      loreIndex ?? null,
    );
    if (discovery.kind === "blocked") return discovery;
    if (serializeSnapshot(discovery.snapshot) !== plan.snapshot) {
      return {
        kind: "blocked",
        issues: [{
          path: plan.importDirectory,
          message: "The import folder changed after preview. Review a fresh preview before creating the structure.",
        }],
      };
    }
  }

  const reconciled = await reconcileManuscriptStructure(rootPath, plan.structure, backend, {
    loreIndex,
  });
  const sourceCheck = collectVerifiedSources(reconciled.manuscripts.flatMap((entry) => entry.items));
  if (sourceCheck.issues.length > 0) {
    return { kind: "blocked", issues: sourceCheck.issues };
  }
  for (const [path, fingerprint] of Object.entries(plan.sourceFingerprints)) {
    if (sourceCheck.fingerprints[path] !== fingerprint) {
      return {
        kind: "blocked",
        issues: [{
          path,
          message: "This Markdown source changed after preview. Review a fresh preview before creating the structure.",
        }],
      };
    }
  }
  return { kind: "ready", text: plan.text };
}

async function inspectStructureAbsence(
  rootPath: string,
  backend: LoreScanBackend,
): Promise<ManuscriptCreationIssue | null> {
  let entries: readonly LoreScanEntry[];
  try {
    entries = await backend.readDirectory(rootPath);
  } catch (cause) {
    return { path: "", message: `The selected project could not be inspected: ${formatError(cause)}` };
  }
  const existing = entries.find((entry) => entry.name === MANUSCRIPT_STRUCTURE_FILE);
  return existing
    ? {
        path: MANUSCRIPT_STRUCTURE_FILE,
        message: "A manuscript structure path already exists. Nothing will replace or repair it.",
      }
    : null;
}

async function discoverImport(
  rootPath: string,
  relativeDirectory: string,
  backend: LoreScanBackend,
  loreIndex: LoreProjectIndex | null,
): Promise<
  | { kind: "ready"; snapshot: ManuscriptImportSnapshot }
  | { kind: "blocked"; issues: ManuscriptCreationIssue[] }
> {
  if (
    relativeDirectory !== "" &&
    !isSafeProjectRelativePath(relativeDirectory, false)
  ) {
    return {
      kind: "blocked",
      issues: [{ path: relativeDirectory, message: "The import folder must stay inside the selected project." }],
    };
  }

  const resolved = await resolveDirectory(rootPath, relativeDirectory, backend);
  if (resolved.kind === "blocked") return resolved;
  const issues: ManuscriptCreationIssue[] = [];
  const skipped: ManuscriptImportSkip[] = [];
  const items: ImportItem[] = [];
  const idPaths = pathsByLoreId(loreIndex);
  const budget: DiscoveryBudget = { examinedEntries: 0 };

  let entries: readonly LoreScanEntry[];
  try {
    entries = await backend.readDirectory(resolved.absolutePath);
  } catch (cause) {
    return {
      kind: "blocked",
      issues: [{ path: relativeDirectory, message: `The import folder could not be read: ${formatError(cause)}` }],
    };
  }
  const rootLimit = reserveDiscoveryEntries(budget, entries.length, relativeDirectory);
  if (rootLimit) return { kind: "blocked", issues: [rootLimit] };

  for (const entry of naturalEntries(entries)) {
    const path = joinRelative(relativeDirectory, entry.name);
    if (entry.isSymlink) {
      issues.push({ path, message: "Symbolic links are not imported as manuscript material." });
      continue;
    }
    if (entry.name.startsWith(".")) {
      skipped.push({ path, reason: "Hidden paths are outside the importer." });
      continue;
    }
    if (entry.isDirectory && !entry.isFile) {
      const chapter = await discoverChapter(
        resolved.absolutePath,
        path,
        entry.name,
        backend,
        loreIndex,
        idPaths,
        budget,
      );
      if (chapter.kind === "blocked") issues.push(...chapter.issues);
      else {
        items.push(chapter.chapter);
        skipped.push(...chapter.skipped);
      }
      continue;
    }
    if (entry.isFile && !entry.isDirectory && isMarkdownPath(entry.name)) {
      const binding = sourceBinding(path, loreIndex, idPaths, issues);
      items.push({ kind: "scene", path, title: sourceTitle(path, loreIndex), ...binding });
      continue;
    }
    skipped.push({ path, reason: "Only immediate Markdown files and chapter folders are imported." });
  }

  if (issues.length > 0) return { kind: "blocked", issues };
  return {
    kind: "ready",
    snapshot: { relativeDirectory, items, skipped },
  };
}

async function discoverChapter(
  absoluteParent: string,
  relativePath: string,
  name: string,
  backend: LoreScanBackend,
  loreIndex: LoreProjectIndex | null,
  idPaths: ReadonlyMap<string, readonly string[]>,
  budget: DiscoveryBudget,
): Promise<
  | { kind: "ready"; chapter: ImportChapter; skipped: ManuscriptImportSkip[] }
  | { kind: "blocked"; issues: ManuscriptCreationIssue[] }
> {
  let entries: readonly LoreScanEntry[];
  try {
    entries = await backend.readDirectory(await backend.join(absoluteParent, name));
  } catch (cause) {
    return {
      kind: "blocked",
      issues: [{ path: relativePath, message: `This chapter folder could not be read: ${formatError(cause)}` }],
    };
  }
  const chapterLimit = reserveDiscoveryEntries(budget, entries.length, relativePath);
  if (chapterLimit) return { kind: "blocked", issues: [chapterLimit] };
  const issues: ManuscriptCreationIssue[] = [];
  const skipped: ManuscriptImportSkip[] = [];
  const children: ImportScene[] = [];
  const overviewEntries = entries.filter(
    (entry) => entry.name.localeCompare("chapter.md", undefined, { sensitivity: "base" }) === 0,
  );
  if (overviewEntries.length > 1) {
    issues.push({ path: relativePath, message: "More than one case-variant of chapter.md exists." });
  }
  let overview: ManuscriptSourceBinding | undefined;

  for (const entry of naturalEntries(entries)) {
    const path = `${relativePath}/${entry.name}`;
    if (entry.isSymlink) {
      issues.push({ path, message: "Symbolic links are not imported as manuscript material." });
      continue;
    }
    if (entry.name.startsWith(".")) {
      skipped.push({ path, reason: "Hidden paths are outside the importer." });
      continue;
    }
    if (entry.isDirectory && !entry.isFile) {
      skipped.push({ path, reason: "Nested folders are outside the one-level chapter importer." });
      continue;
    }
    if (!entry.isFile || entry.isDirectory || !isMarkdownPath(entry.name)) {
      skipped.push({ path, reason: "Only Markdown files are imported as chapter material." });
      continue;
    }
    const binding = { path, ...sourceBinding(path, loreIndex, idPaths, issues) };
    if (overviewEntries.length === 1 && entry === overviewEntries[0]) {
      overview = binding;
    } else {
      children.push({
        kind: "scene",
        path,
        title: sourceTitle(path, loreIndex),
        ...(binding.noteId ? { noteId: binding.noteId } : {}),
      });
    }
  }

  if (issues.length > 0) return { kind: "blocked", issues };
  return {
    kind: "ready",
    chapter: {
      kind: "chapter",
      folder: relativePath,
      title: displayTitle(name),
      ...(overview ? { overview } : {}),
      children,
    },
    skipped,
  };
}

async function resolveDirectory(
  rootPath: string,
  relativeDirectory: string,
  backend: LoreScanBackend,
): Promise<
  | { kind: "ready"; absolutePath: string }
  | { kind: "blocked"; issues: ManuscriptCreationIssue[] }
> {
  let absolutePath = rootPath;
  let traversed = "";
  for (const segment of relativeDirectory.split("/").filter(Boolean)) {
    let entries: readonly LoreScanEntry[];
    try {
      entries = await backend.readDirectory(absolutePath);
    } catch (cause) {
      return {
        kind: "blocked",
        issues: [{ path: traversed, message: `The import path could not be inspected: ${formatError(cause)}` }],
      };
    }
    const entry = entries.find((candidate) => candidate.name === segment);
    traversed = joinRelative(traversed, segment);
    if (!entry) {
      return { kind: "blocked", issues: [{ path: traversed, message: "The import folder is missing." }] };
    }
    if (entry.isSymlink) {
      return { kind: "blocked", issues: [{ path: traversed, message: "Symbolic-link import folders are not followed." }] };
    }
    if (!entry.isDirectory || entry.isFile) {
      return { kind: "blocked", issues: [{ path: traversed, message: "The import folder is missing." }] };
    }
    absolutePath = await backend.join(absolutePath, segment);
  }
  return { kind: "ready", absolutePath };
}

function buildStructure(
  imported: readonly ImportItem[],
  title: string,
  createId: () => string,
): ManuscriptStructure {
  return {
    formatVersion: 1,
    manuscripts: [{
      id: createId(),
      title,
      items: imported.map((item): ManuscriptOutlineItem => {
        if (item.kind === "scene") return createScene(item, createId);
        const chapter: ManuscriptChapter = {
          id: createId(),
          kind: "chapter",
          title: item.title,
          folder: item.folder,
          ...(item.overview ? { overview: item.overview } : {}),
          children: item.children.map((scene) => createScene(scene, createId)),
          includeInCompile: true,
        };
        return chapter;
      }),
    }],
  };
}

function createScene(scene: ImportScene, createId: () => string): ManuscriptScene {
  return {
    id: createId(),
    kind: "scene",
    title: scene.title,
    source: {
      path: scene.path,
      ...(scene.noteId ? { noteId: scene.noteId } : {}),
    },
    includeInCompile: true,
  };
}

function collectVerifiedSources(items: readonly ReconciledManuscriptItem[]): {
  issues: ManuscriptCreationIssue[];
  fingerprints: Record<string, string>;
} {
  const issues: ManuscriptCreationIssue[] = [];
  const fingerprints: Record<string, string> = {};
  const accept = (state: ManuscriptSourceState | null) => {
    if (!state) return;
    if (state.kind !== "ready") {
      issues.push({ path: state.declaredPath, message: sourceMessage(state) });
      return;
    }
    fingerprints[state.resolvedPath] = state.fingerprint;
  };
  for (const item of items) {
    if ("children" in item) {
      if (item.folder && item.folder.kind !== "ready") {
        issues.push({ path: item.folder.path, message: item.folder.message });
      }
      accept(item.overview);
      accept(item.source);
      for (const scene of item.children) accept(scene.source);
    } else {
      accept(item.source);
    }
  }
  return { issues, fingerprints };
}

function sourceMessage(state: Exclude<ManuscriptSourceState, { kind: "ready" }>): string {
  if (state.kind === "moved") return "The stable-ID source is no longer at the previewed path.";
  return state.message;
}

function sourceBinding(
  path: string,
  loreIndex: LoreProjectIndex | null,
  idPaths: ReadonlyMap<string, readonly string[]>,
  issues: ManuscriptCreationIssue[],
): { noteId?: string } {
  const noteId = loreIndex?.documents.get(path)?.id ?? null;
  if (!noteId) return {};
  const paths = idPaths.get(noteId) ?? [];
  if (paths.length > 1) {
    issues.push({
      path,
      message: `Stable note ID ${noteId} is duplicated in: ${paths.join(", ")}.`,
    });
    return {};
  }
  return { noteId };
}

function pathsByLoreId(index: LoreProjectIndex | null): ReadonlyMap<string, readonly string[]> {
  const values = new Map<string, string[]>();
  if (!index) return values;
  for (const document of index.documents.values()) {
    if (!document.id) continue;
    const paths = values.get(document.id) ?? [];
    paths.push(document.path);
    values.set(document.id, paths);
  }
  for (const paths of values.values()) paths.sort((a, b) => a.localeCompare(b));
  return values;
}

function sourceTitle(path: string, index: LoreProjectIndex | null): string {
  const indexedTitle = index?.documents.get(path)?.title;
  return indexedTitle
    ? displayTitle(indexedTitle, false)
    : displayTitle(markdownFileStem(path));
}

function displayTitle(value: string, stripLeadingNumber = true): string {
  const normalized = (stripLeadingNumber
    ? value
        .replace(/^\s*\d+(?:[.\s_-]+|$)/u, "")
        .replace(/[-_]+/gu, " ")
    : value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim() || "Untitled";
  const codePoints = [...normalized];
  return codePoints.length <= MAX_OUTLINE_TITLE_CODE_POINTS
    ? normalized
    : codePoints.slice(0, MAX_OUTLINE_TITLE_CODE_POINTS).join("");
}

function naturalEntries(entries: readonly LoreScanEntry[]): LoreScanEntry[] {
  return [...entries].sort((first, second) =>
    first.name.localeCompare(second.name, undefined, {
      sensitivity: "variant",
      numeric: true,
    }),
  );
}

function reserveDiscoveryEntries(
  budget: DiscoveryBudget,
  count: number,
  path: string,
): ManuscriptCreationIssue | null {
  budget.examinedEntries += count;
  return budget.examinedEntries > MAX_MANUSCRIPT_IMPORT_ENTRIES
    ? {
        path,
        message: `Import inspection stopped before exceeding ${MAX_MANUSCRIPT_IMPORT_ENTRIES.toLocaleString()} visible directory entries.`,
      }
    : null;
}

function serializeSnapshot(snapshot: ManuscriptImportSnapshot): string {
  return JSON.stringify(snapshot);
}

function joinRelative(parent: string, child: string): string {
  return parent ? `${parent}/${child}` : child;
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
