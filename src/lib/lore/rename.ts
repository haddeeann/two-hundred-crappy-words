import { validateFileName, validateFolderName } from "$lib/editor/file-tree";
import { buildLoreProjectIndex } from "./index";
import { isMarkdownPath, normalizeLoreName } from "./normalize";
import type {
  IndexedWikiLink,
  LoreDocumentRecord,
  LoreProjectIndex,
  SourceRange,
} from "./types";

export interface LoreRenameReplacement {
  range: SourceRange;
  before: string;
  after: string;
  context: string;
}

export interface LoreRenameFileEdit {
  path: string;
  fingerprint: string;
  originalText: string;
  updatedText: string;
  replacements: LoreRenameReplacement[];
}

export type LoreRenamePlan =
  | {
      kind: "ready";
      sourcePath: string;
      targetPath: string;
      noteId: string;
      title: string;
      sourceFingerprint: string;
      sourceText: string;
      fileEdits: LoreRenameFileEdit[];
      unchangedLinkCount: number;
      signature: string;
    }
  | {
      kind: "unavailable";
      reason: string;
    };

export function planLoreRename(
  index: LoreProjectIndex,
  sourcePath: string,
  requestedPath: string,
): LoreRenamePlan {
  const source = index.documents.get(sourcePath);
  if (!source) return unavailable("The note is no longer in the current lore index.");
  if (!source.id) {
    return unavailable("Only a note with one valid stable frontmatter ID can be renamed safely.");
  }
  if (
    index.issues.some(
      ({ kind, paths }) => kind === "duplicate-note-id" && paths.includes(sourcePath),
    )
  ) {
    return unavailable("This note ID is duplicated, so the intended file cannot be identified safely.");
  }
  if (
    source.parseIssues.some(({ kind }) =>
      kind === "frontmatter-malformed" ||
      kind === "frontmatter-field" ||
      kind === "duplicate-metadata",
    )
  ) {
    return unavailable("This note has unsupported or ambiguous frontmatter that must be corrected before rename.");
  }

  const path = validateRenamePath(requestedPath);
  if (path.kind === "unavailable") return path;
  if (path.path === sourcePath) return unavailable("Choose a different project-relative path.");
  const normalizedTarget = normalizeLoreName(path.path);
  const collision = [...index.documents.keys()].find(
    (candidate) =>
      candidate !== sourcePath && normalizeLoreName(candidate) === normalizedTarget,
  );
  if (collision) {
    return unavailable(`The indexed note ${collision} already uses that path.`);
  }
  if (normalizeLoreName(sourcePath) === normalizedTarget) {
    return unavailable("Case-only path changes are not supported safely in this version.");
  }

  const simulated = buildLoreProjectIndex(
    [...index.documents.values()].map((document) => ({
      path: document.path === sourcePath ? path.path : document.path,
      text: document.searchText,
    })),
    index.generation + 1,
  );
  const replacementsByPath = new Map<string, LoreRenameReplacement[]>();
  let unchangedLinkCount = 0;
  for (const document of index.documents.values()) {
    const simulatedPath = document.path === sourcePath ? path.path : document.path;
    const simulatedDocument = simulated.documents.get(simulatedPath);
    if (!simulatedDocument) {
      return unavailable(`The rename preview could not re-index ${document.path}.`);
    }
    for (let ordinal = 0; ordinal < document.outgoing.length; ordinal += 1) {
      const outgoing = document.outgoing[ordinal]!;
      if (
        outgoing.resolution.kind !== "resolved" ||
        outgoing.resolution.targetPath !== sourcePath
      ) {
        continue;
      }
      const next = simulatedDocument.outgoing[ordinal];
      if (
        next?.resolution.kind === "resolved" &&
        next.resolution.targetPath === path.path
      ) {
        unchangedLinkCount += 1;
        continue;
      }
      if (!outgoing.link.noteTarget || outgoing.link.noteRange.end <= outgoing.link.noteRange.start) {
        return unavailable(`A link in ${document.path} could not be updated without guessing.`);
      }
      const replacement = replacementFor(outgoing, document, path.path);
      const values = replacementsByPath.get(document.path) ?? [];
      values.push(replacement);
      replacementsByPath.set(document.path, values);
    }
  }

  const fileEdits = [...replacementsByPath.entries()]
    .map(([editPath, replacements]) => {
      const document = index.documents.get(editPath)!;
      const ordered = [...replacements].sort(
        (first, second) => second.range.start - first.range.start,
      );
      let updatedText = document.searchText;
      for (const replacement of ordered) {
        if (updatedText.slice(replacement.range.start, replacement.range.end) !== replacement.before) {
          throw new RangeError(`Indexed link range changed in ${editPath}.`);
        }
        updatedText =
          updatedText.slice(0, replacement.range.start) +
          replacement.after +
          updatedText.slice(replacement.range.end);
      }
      return {
        path: editPath,
        fingerprint: document.fingerprint,
        originalText: document.searchText,
        updatedText,
        replacements: ordered.reverse(),
      };
    })
    .sort((first, second) => first.path.localeCompare(second.path));

  const signature = [
    sourcePath,
    path.path,
    source.fingerprint,
    ...fileEdits.map(({ path: editPath, fingerprint, updatedText }) =>
      `${editPath}\u0000${fingerprint}\u0000${updatedText}`,
    ),
  ].join("\u0001");
  return {
    kind: "ready",
    sourcePath,
    targetPath: path.path,
    noteId: source.id,
    title: source.title,
    sourceFingerprint: source.fingerprint,
    sourceText: source.searchText,
    fileEdits,
    unchangedLinkCount,
    signature,
  };
}

function validateRenamePath(
  requestedPath: string,
): { kind: "ready"; path: string } | { kind: "unavailable"; reason: string } {
  const path = requestedPath.trim().replace(/^\/+|\/+$/gu, "");
  if (!path || !isMarkdownPath(path)) {
    return unavailable("The destination must be a project-relative .md or .markdown path.");
  }
  const segments = path.split("/");
  for (const directory of segments.slice(0, -1)) {
    const issue = validateFolderName(directory);
    if (issue) return unavailable(issue);
    if (directory.startsWith(".") || /^(?:node_modules|target)$/iu.test(directory)) {
      return unavailable("Hidden, dependency, and build-output folders cannot contain an indexed note.");
    }
  }
  const fileName = segments.at(-1)!;
  const issue = validateFileName(fileName);
  if (issue) return unavailable(issue);
  if (fileName.startsWith(".")) {
    return unavailable("A hidden file cannot become an indexed lore note.");
  }
  return { kind: "ready", path: segments.join("/") };
}

function replacementFor(
  outgoing: IndexedWikiLink,
  source: LoreDocumentRecord,
  targetPath: string,
): LoreRenameReplacement {
  const { noteRange } = outgoing.link;
  return {
    range: noteRange,
    before: source.searchText.slice(noteRange.start, noteRange.end),
    after: escapeWikiDestination(targetPath),
    context: outgoing.context,
  };
}

function escapeWikiDestination(value: string): string {
  return value.replace(/[\\|#\]]/gu, (character) => `\\${character}`);
}

function unavailable(reason: string): { kind: "unavailable"; reason: string } {
  return { kind: "unavailable", reason };
}
