import { fingerprintContent } from "$lib/editor/recovery";
import { parseMarkdownNote } from "$lib/lore/markdown";
import type {
  LoreScanBackend,
  LoreScanEntry,
  LoreFileRevision,
} from "$lib/lore/scan";
import type { LoreProjectIndex } from "$lib/lore/types";
import {
  MANUSCRIPT_STRUCTURE_FILE,
  MAX_MANUSCRIPT_STRUCTURE_BYTES,
  parseManuscriptStructure,
  type ManuscriptChapter,
  type ManuscriptDefinition,
  type ManuscriptOutlineItem,
  type ManuscriptScene,
  type ManuscriptSourceBinding,
  type ManuscriptStructure,
  type ManuscriptStructureIssue,
} from "./structure";
import { countManuscriptSourceWords } from "./word-count";

export const DEFAULT_MAX_MANUSCRIPT_SOURCE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MAX_MANUSCRIPT_TOTAL_SOURCE_BYTES = 100 * 1024 * 1024;

export type ManuscriptFolderState =
  | { kind: "ready"; path: string }
  | { kind: "missing" | "unsafe" | "unreadable" | "not-directory"; path: string; message: string };

interface AvailableSourceState {
  declaredPath: string;
  resolvedPath: string;
  fingerprint: string;
  bytes: number;
  noteId?: string;
}

export type ManuscriptSourceState =
  | ({ kind: "ready"; wordCount: number } & AvailableSourceState)
  | ({
      kind: "moved";
      suggestedPath: string;
      declaredPathOccupied: boolean;
    } & AvailableSourceState)
  | {
      kind: "missing" | "unsafe" | "unreadable" | "unstable" | "oversized" | "limit";
      declaredPath: string;
      resolvedPath?: string;
      message: string;
    }
  | {
      kind: "ambiguous-id";
      declaredPath: string;
      noteId: string;
      candidatePaths: string[];
      message: string;
    }
  | {
      kind: "identity-mismatch";
      declaredPath: string;
      resolvedPath: string;
      noteId: string;
      actualNoteId: string | null;
      message: string;
    }
  | {
      kind: "path-conflict";
      declaredPath: string;
      resolvedPath: string;
      conflictingItemIds: string[];
      message: string;
    };

export interface ReconciledManuscriptScene {
  item: ManuscriptScene;
  source: ManuscriptSourceState;
}

export interface ReconciledManuscriptChapter {
  item: ManuscriptChapter;
  folder: ManuscriptFolderState | null;
  overview: ManuscriptSourceState | null;
  source: ManuscriptSourceState | null;
  children: ReconciledManuscriptScene[];
}

export type ReconciledManuscriptItem =
  | ReconciledManuscriptScene
  | ReconciledManuscriptChapter;

export interface ReconciledManuscript {
  manuscript: ManuscriptDefinition;
  items: ReconciledManuscriptItem[];
}

export interface ReconciledManuscriptStructure {
  structure: ManuscriptStructure;
  manuscripts: ReconciledManuscript[];
  acceptedSourceBytes: number;
  readSourceBytes: number;
}

export type ManuscriptProjectLoadResult =
  | { kind: "absent" }
  | { kind: "unsafe" | "unreadable" | "unstable"; message: string }
  | { kind: "malformed"; message: string; fingerprint: string }
  | { kind: "invalid"; issues: ManuscriptStructureIssue[]; fingerprint: string | null }
  | { kind: "unsupported-version"; version: number; fingerprint: string }
  | {
      kind: "ready";
      fingerprint: string;
      text: string;
      source: Record<string, unknown>;
      reconciled: ReconciledManuscriptStructure;
    };

export interface ManuscriptReconcileOptions {
  loreIndex?: LoreProjectIndex | null;
  maxSourceBytes?: number;
  maxTotalSourceBytes?: number;
}

interface ReconcileContext {
  rootPath: string;
  backend: LoreScanBackend;
  idPaths: ReadonlyMap<string, readonly string[]>;
  maxSourceBytes: number;
  maxTotalSourceBytes: number;
  readSourceBytes: number;
}

type LocatedPath =
  | { kind: "found"; absolutePath: string; entry: LoreScanEntry }
  | { kind: "missing" }
  | { kind: "unsafe"; path: string; message: string }
  | { kind: "unreadable"; path: string; message: string };

type StableReadResult =
  | { kind: "ready"; text: string; bytes: number; fingerprint: string }
  | { kind: "unreadable" | "unstable" | "oversized"; message: string };

type BoundSourceLoadResult =
  | {
      kind: "ready";
      declaredPath: string;
      resolvedPath: string;
      text: string;
      bytes: number;
      fingerprint: string;
    }
  | {
      kind: "missing" | "unsafe" | "unreadable" | "unstable" | "oversized" | "limit";
      declaredPath: string;
      resolvedPath?: string;
      message: string;
    };

export async function loadManuscriptProject(
  rootPath: string,
  backend: LoreScanBackend,
  options: ManuscriptReconcileOptions = {},
): Promise<ManuscriptProjectLoadResult> {
  const maxSourceBytes = positiveLimit(
    options.maxSourceBytes,
    DEFAULT_MAX_MANUSCRIPT_SOURCE_BYTES,
  );
  const maxTotalSourceBytes = positiveLimit(
    options.maxTotalSourceBytes,
    DEFAULT_MAX_MANUSCRIPT_TOTAL_SOURCE_BYTES,
  );
  const located = await locateContainedPath(rootPath, MANUSCRIPT_STRUCTURE_FILE, backend);
  if (located.kind === "missing") return { kind: "absent" };
  if (located.kind === "unsafe" || located.kind === "unreadable") {
    return { kind: located.kind, message: located.message };
  }
  if (!located.entry.isFile || located.entry.isDirectory) {
    return {
      kind: "unsafe",
      message: `${MANUSCRIPT_STRUCTURE_FILE} must be a regular non-symbolic file.`,
    };
  }

  const loaded = await readStableText(
    located.absolutePath,
    MANUSCRIPT_STRUCTURE_FILE,
    backend,
    MAX_MANUSCRIPT_STRUCTURE_BYTES,
  );
  if (loaded.kind !== "ready") {
    if (loaded.kind === "oversized") {
      return {
        kind: "invalid",
        issues: [{ path: "$", message: loaded.message }],
        fingerprint: null,
      };
    }
    return {
      kind: loaded.kind,
      message: loaded.message,
    };
  }
  const parsed = parseManuscriptStructure(loaded.text);
  if (parsed.kind === "malformed") {
    return { kind: "malformed", message: parsed.message, fingerprint: loaded.fingerprint };
  }
  if (parsed.kind === "invalid") {
    return { kind: "invalid", issues: parsed.issues, fingerprint: loaded.fingerprint };
  }
  if (parsed.kind === "unsupported-version") {
    return {
      kind: "unsupported-version",
      version: parsed.version,
      fingerprint: loaded.fingerprint,
    };
  }

  const reconciled = await reconcileManuscriptStructure(
    rootPath,
    parsed.structure,
    backend,
    {
      loreIndex: options.loreIndex,
      maxSourceBytes,
      maxTotalSourceBytes,
    },
  );
  return {
    kind: "ready",
    fingerprint: loaded.fingerprint,
    text: loaded.text,
    source: parsed.source,
    reconciled,
  };
}

export async function reconcileManuscriptStructure(
  rootPath: string,
  structure: ManuscriptStructure,
  backend: LoreScanBackend,
  options: ManuscriptReconcileOptions = {},
): Promise<ReconciledManuscriptStructure> {
  const context: ReconcileContext = {
    rootPath,
    backend,
    idPaths: indexPathsById(options.loreIndex ?? null),
    maxSourceBytes: positiveLimit(
      options.maxSourceBytes,
      DEFAULT_MAX_MANUSCRIPT_SOURCE_BYTES,
    ),
    maxTotalSourceBytes: positiveLimit(
      options.maxTotalSourceBytes,
      DEFAULT_MAX_MANUSCRIPT_TOTAL_SOURCE_BYTES,
    ),
    readSourceBytes: 0,
  };

  const manuscripts: ReconciledManuscript[] = [];
  for (const manuscript of structure.manuscripts) {
    const items: ReconciledManuscriptItem[] = [];
    for (const item of manuscript.items) {
      items.push(await reconcileItem(item, context));
    }
    manuscripts.push({ manuscript, items });
  }
  markResolvedPathConflicts(manuscripts);
  return {
    structure,
    manuscripts,
    acceptedSourceBytes: sumAcceptedSourceBytes(manuscripts),
    readSourceBytes: context.readSourceBytes,
  };
}

async function reconcileItem(
  item: ManuscriptOutlineItem,
  context: ReconcileContext,
): Promise<ReconciledManuscriptItem> {
  if (item.kind === "scene") return reconcileScene(item, context);
  const folder = item.folder
    ? await reconcileFolder(item.folder, context)
    : null;
  const overview = item.overview
    ? await reconcileBinding(item.overview, context)
    : null;
  const source = item.source
    ? await reconcileBinding(item.source, context)
    : null;
  const children: ReconciledManuscriptScene[] = [];
  for (const child of item.children) {
    children.push(await reconcileScene(child, context));
  }
  return { item, folder, overview, source, children };
}

async function reconcileScene(
  item: ManuscriptScene,
  context: ReconcileContext,
): Promise<ReconciledManuscriptScene> {
  return {
    item,
    source: await reconcileBinding(item.source, context),
  };
}

async function reconcileFolder(
  path: string,
  context: ReconcileContext,
): Promise<ManuscriptFolderState> {
  const located = await locateContainedPath(context.rootPath, path, context.backend);
  if (located.kind === "found") {
    if (!located.entry.isDirectory || located.entry.isFile) {
      return {
        kind: "not-directory",
        path,
        message: "The recorded chapter folder is not a directory.",
      };
    }
    return { kind: "ready", path };
  }
  if (located.kind === "missing") {
    return { kind: "missing", path, message: "The recorded chapter folder is missing." };
  }
  return { kind: located.kind, path, message: located.message };
}

async function reconcileBinding(
  binding: ManuscriptSourceBinding,
  context: ReconcileContext,
): Promise<ManuscriptSourceState> {
  let state: ManuscriptSourceState;
  const candidates = binding.noteId
    ? [...(context.idPaths.get(binding.noteId) ?? [])]
    : [];
  if (binding.noteId && candidates.length > 1) {
    state = {
      kind: "ambiguous-id",
      declaredPath: binding.path,
      noteId: binding.noteId,
      candidatePaths: candidates,
      message: "The stable note ID appears in more than one indexed Markdown file.",
    };
  } else if (
    binding.noteId &&
    candidates.length === 1 &&
    candidates[0] !== binding.path
  ) {
    state = await reconcileMovedBinding(
      { ...binding, noteId: binding.noteId },
      candidates[0]!,
      context,
    );
  } else {
    state = await reconcileDeclaredBinding(binding, context);
  }
  return state;
}

async function reconcileDeclaredBinding(
  binding: ManuscriptSourceBinding,
  context: ReconcileContext,
): Promise<ManuscriptSourceState> {
  const loaded = await loadBoundSource(binding.path, binding.path, context);
  if (loaded.kind !== "ready") return loaded;
  if (binding.noteId) {
    const actualNoteId = parseMarkdownNote(binding.path, loaded.text).id;
    if (actualNoteId !== binding.noteId) {
      return {
        kind: "identity-mismatch",
        declaredPath: binding.path,
        resolvedPath: binding.path,
        noteId: binding.noteId,
        actualNoteId,
        message: "The file at the recorded path no longer has the expected stable note ID.",
      };
    }
  }
  return {
    kind: "ready",
    declaredPath: binding.path,
    resolvedPath: binding.path,
    fingerprint: loaded.fingerprint,
    bytes: loaded.bytes,
    wordCount: countManuscriptSourceWords(loaded.text),
    ...(binding.noteId ? { noteId: binding.noteId } : {}),
  };
}

async function reconcileMovedBinding(
  binding: ManuscriptSourceBinding & { noteId: string },
  candidatePath: string,
  context: ReconcileContext,
): Promise<ManuscriptSourceState> {
  const loaded = await loadBoundSource(binding.path, candidatePath, context);
  if (loaded.kind !== "ready") return loaded;
  const actualNoteId = parseMarkdownNote(candidatePath, loaded.text).id;
  if (actualNoteId !== binding.noteId) {
    return {
      kind: "identity-mismatch",
      declaredPath: binding.path,
      resolvedPath: candidatePath,
      noteId: binding.noteId,
      actualNoteId,
      message: "The indexed move candidate no longer has the expected stable note ID.",
    };
  }
  const declared = await locateContainedPath(
    context.rootPath,
    binding.path,
    context.backend,
  );
  return {
    kind: "moved",
    declaredPath: binding.path,
    resolvedPath: candidatePath,
    suggestedPath: candidatePath,
    declaredPathOccupied: declared.kind !== "missing",
    fingerprint: loaded.fingerprint,
    bytes: loaded.bytes,
    noteId: binding.noteId,
  };
}

async function loadBoundSource(
  declaredPath: string,
  resolvedPath: string,
  context: ReconcileContext,
): Promise<BoundSourceLoadResult> {
  const located = await locateContainedPath(
    context.rootPath,
    resolvedPath,
    context.backend,
  );
  if (located.kind === "missing") {
    return {
      kind: "missing",
      declaredPath,
      ...(resolvedPath !== declaredPath ? { resolvedPath } : {}),
      message: resolvedPath === declaredPath
        ? "The recorded Markdown source is missing."
        : "The indexed move candidate is no longer available.",
    };
  }
  if (located.kind === "unsafe" || located.kind === "unreadable") {
    return {
      kind: located.kind,
      declaredPath,
      ...(resolvedPath !== declaredPath ? { resolvedPath } : {}),
      message: located.message,
    };
  }
  if (!located.entry.isFile || located.entry.isDirectory) {
    return {
      kind: "unsafe",
      declaredPath,
      ...(resolvedPath !== declaredPath ? { resolvedPath } : {}),
      message: "The recorded manuscript source is not a regular file.",
    };
  }
  let revision: LoreFileRevision;
  try {
    revision = await context.backend.inspectFile(located.absolutePath);
  } catch (cause) {
    return {
      kind: "unreadable",
      declaredPath,
      ...(resolvedPath !== declaredPath ? { resolvedPath } : {}),
      message: `Could not inspect the manuscript source: ${formatError(cause)}`,
    };
  }
  if (revision.size > context.maxSourceBytes) {
    return {
      kind: "oversized",
      declaredPath,
      ...(resolvedPath !== declaredPath ? { resolvedPath } : {}),
      message: `The manuscript source exceeds the ${context.maxSourceBytes}-byte per-file limit.`,
    };
  }
  if (context.readSourceBytes + revision.size > context.maxTotalSourceBytes) {
    return {
      kind: "limit",
      declaredPath,
      ...(resolvedPath !== declaredPath ? { resolvedPath } : {}),
      message: `Reading this source would exceed the ${context.maxTotalSourceBytes}-byte manuscript limit.`,
    };
  }
  const loaded = await readStableText(
    located.absolutePath,
    resolvedPath,
    context.backend,
    context.maxSourceBytes,
  );
  if (loaded.kind !== "ready") {
    return {
      kind: loaded.kind,
      declaredPath,
      ...(resolvedPath !== declaredPath ? { resolvedPath } : {}),
      message: loaded.message,
    };
  }
  if (context.readSourceBytes + loaded.bytes > context.maxTotalSourceBytes) {
    return {
      kind: "limit",
      declaredPath,
      ...(resolvedPath !== declaredPath ? { resolvedPath } : {}),
      message: `Reading this source would exceed the ${context.maxTotalSourceBytes}-byte manuscript limit.`,
    };
  }
  context.readSourceBytes += loaded.bytes;
  return { ...loaded, declaredPath, resolvedPath };
}

async function locateContainedPath(
  rootPath: string,
  relativePath: string,
  backend: LoreScanBackend,
): Promise<LocatedPath> {
  let absoluteDirectory = rootPath;
  let traversed = "";
  const segments = relativePath.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    let entries: readonly LoreScanEntry[];
    try {
      entries = await backend.readDirectory(absoluteDirectory);
    } catch (cause) {
      return {
        kind: "unreadable",
        path: traversed,
        message: `Could not inspect the selected project path: ${formatError(cause)}`,
      };
    }
    const segment = segments[index]!;
    const entry = entries.find((candidate) => candidate.name === segment);
    if (!entry) return { kind: "missing" };
    traversed = traversed ? `${traversed}/${segment}` : segment;
    if (entry.isSymlink) {
      return {
        kind: "unsafe",
        path: traversed,
        message: `Symbolic links are not followed for manuscript structure or sources (${traversed}).`,
      };
    }
    const absolutePath = await backend.join(absoluteDirectory, segment);
    if (index === segments.length - 1) {
      return { kind: "found", absolutePath, entry };
    }
    if (!entry.isDirectory || entry.isFile) return { kind: "missing" };
    absoluteDirectory = absolutePath;
  }
  return { kind: "missing" };
}

async function readStableText(
  absolutePath: string,
  relativePath: string,
  backend: LoreScanBackend,
  maxBytes: number,
): Promise<StableReadResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const before = await backend.inspectFile(absolutePath);
      if (before.size > maxBytes) {
        return {
          kind: "oversized",
          message: `${relativePath} exceeds the ${maxBytes}-byte read limit.`,
        };
      }
      const text = await backend.readText(absolutePath);
      const after = await backend.inspectFile(absolutePath);
      const bytes = new TextEncoder().encode(text).byteLength;
      if (bytes > maxBytes) {
        return {
          kind: "oversized",
          message: `${relativePath} exceeds the ${maxBytes}-byte read limit.`,
        };
      }
      if (
        before.size === after.size &&
        before.revision === after.revision &&
        after.size === bytes
      ) {
        return { kind: "ready", text, bytes, fingerprint: fingerprintContent(text) };
      }
    } catch (cause) {
      return {
        kind: "unreadable",
        message: `Could not read ${relativePath}: ${formatError(cause)}`,
      };
    }
  }
  return {
    kind: "unstable",
    message: `${relativePath} kept changing while it was read.`,
  };
}

function indexPathsById(index: LoreProjectIndex | null): ReadonlyMap<string, readonly string[]> {
  const paths = new Map<string, string[]>();
  if (!index) return paths;
  for (const record of index.documents.values()) {
    if (!record.id) continue;
    const values = paths.get(record.id) ?? [];
    values.push(record.path);
    paths.set(record.id, values);
  }
  for (const values of paths.values()) values.sort((first, second) => first.localeCompare(second));
  return paths;
}

function markResolvedPathConflicts(
  manuscripts: ReconciledManuscript[],
): void {
  const states: Array<{
    itemId: string;
    state: ManuscriptSourceState;
    replace: (state: ManuscriptSourceState) => void;
  }> = [];
  for (const manuscript of manuscripts) {
    for (const item of manuscript.items) {
      if (!("children" in item)) {
        states.push({
          itemId: item.item.id,
          state: item.source,
          replace: (state) => { item.source = state; },
        });
        continue;
      }
      if (item.overview) {
        states.push({
          itemId: item.item.id,
          state: item.overview,
          replace: (state) => { item.overview = state; },
        });
      }
      if (item.source) {
        states.push({
          itemId: item.item.id,
          state: item.source,
          replace: (state) => { item.source = state; },
        });
      }
      for (const child of item.children) {
        states.push({
          itemId: child.item.id,
          state: child.source,
          replace: (state) => { child.source = state; },
        });
      }
    }
  }
  const byPath = new Map<string, typeof states>();
  for (const entry of states) {
    if (entry.state.kind !== "ready" && entry.state.kind !== "moved") continue;
    const values = byPath.get(entry.state.resolvedPath) ?? [];
    values.push(entry);
    byPath.set(entry.state.resolvedPath, values);
  }
  for (const [resolvedPath, values] of byPath) {
    if (values.length < 2) continue;
    const conflictingItemIds = values.map(({ itemId }) => itemId).sort();
    for (const value of values) {
      value.replace({
        kind: "path-conflict",
        declaredPath: value.state.declaredPath,
        resolvedPath,
        conflictingItemIds,
        message: "More than one outline item currently resolves to this Markdown source.",
      });
    }
  }
}

function sumAcceptedSourceBytes(manuscripts: readonly ReconciledManuscript[]): number {
  let total = 0;
  const add = (state: ManuscriptSourceState | null) => {
    if (state?.kind === "ready" || state?.kind === "moved") total += state.bytes;
  };
  for (const manuscript of manuscripts) {
    for (const item of manuscript.items) {
      if (!("children" in item)) {
        add(item.source);
        continue;
      }
      add(item.overview);
      add(item.source);
      for (const child of item.children) add(child.source);
    }
  }
  return total;
}

function positiveLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("Manuscript source limits must be positive safe integers.");
  }
  return value;
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
