import type { FileTreeEntry } from "$lib/editor/file-tree";
import {
  parseWorldProjectManifest,
  WORLD_PROJECT_MANIFEST_FILE,
  worldProjectStorageKey,
  type WorldProjectManifest,
} from "./manifest";

export type WorldProjectFolderInspection =
  | { kind: "ordinary"; storageKey: string }
  | {
      kind: "world-project";
      storageKey: string;
      manifest: WorldProjectManifest;
    }
  | {
      kind: "manifest-problem";
      storageKey: string;
      problem: "not-a-file" | "unreadable" | "malformed" | "invalid" | "newer-version";
      message: string;
    };

export async function inspectWorldProjectFolder({
  folderPath,
  entries,
  readText,
}: {
  folderPath: string;
  entries: readonly FileTreeEntry[];
  readText: (path: string) => Promise<string>;
}): Promise<WorldProjectFolderInspection> {
  const manifestEntry = entries.find(
    (entry) => entry.name === WORLD_PROJECT_MANIFEST_FILE,
  );
  if (!manifestEntry) return { kind: "ordinary", storageKey: folderPath };

  if (!manifestEntry.isFile || manifestEntry.isSymlink) {
    return {
      kind: "manifest-problem",
      storageKey: folderPath,
      problem: "not-a-file",
      message: `${WORLD_PROJECT_MANIFEST_FILE} must be a regular file. This folder is open as an ordinary folder; its writing files are unchanged.`,
    };
  }

  let text: string;
  try {
    text = await readText(manifestEntry.path);
  } catch (cause) {
    return {
      kind: "manifest-problem",
      storageKey: folderPath,
      problem: "unreadable",
      message: `The world-project manifest could not be read: ${formatError(cause)}. This folder is open as an ordinary folder; its writing files are unchanged.`,
    };
  }

  const result = parseWorldProjectManifest(text);
  if (result.kind === "valid") {
    return {
      kind: "world-project",
      storageKey: worldProjectStorageKey(result.manifest.projectId),
      manifest: result.manifest,
    };
  }
  if (result.kind === "unsupported-version") {
    return {
      kind: "manifest-problem",
      storageKey: folderPath,
      problem: "newer-version",
      message: `This world project uses format version ${result.version}, which is newer than this app supports. The folder is open for ordinary text editing, and the manifest was not changed.`,
    };
  }
  if (result.kind === "malformed") {
    return {
      kind: "manifest-problem",
      storageKey: folderPath,
      problem: "malformed",
      message: `The world-project manifest is not valid JSON. This folder is open as an ordinary folder, and the manifest was not changed.`,
    };
  }
  return {
    kind: "manifest-problem",
    storageKey: folderPath,
    problem: "invalid",
    message: `The world-project manifest is invalid: ${result.issues.join(" ")} This folder is open as an ordinary folder, and the manifest was not changed.`,
  };
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
