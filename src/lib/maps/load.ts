import { fingerprintContent } from "$lib/editor/recovery";
import type { LoreScanBackend, LoreScanEntry } from "$lib/lore/scan";
import {
  MAPS_FILE,
  MAX_MAPS_BYTES,
  parseMapsProject,
  type MapIssue,
  type MapsProject,
} from "./format";

export type MapsProjectLoadResult =
  | { kind: "absent" }
  | { kind: "unsafe" | "unreadable" | "unstable"; message: string }
  | { kind: "malformed"; message: string; fingerprint: string }
  | { kind: "invalid"; issues: MapIssue[]; fingerprint: string | null }
  | { kind: "unsupported-version"; version: number; fingerprint: string }
  | { kind: "manifest-unavailable"; projectId: string; fingerprint: string; message: string }
  | {
      kind: "project-mismatch";
      projectId: string;
      expectedProjectId: string;
      fingerprint: string;
      message: string;
    }
  | {
      kind: "ready";
      fingerprint: string;
      text: string;
      source: Record<string, unknown>;
      mapsProject: MapsProject;
    };

type StableReadResult =
  | { kind: "ready"; text: string; fingerprint: string }
  | { kind: "unreadable" | "unstable" | "oversized"; message: string };

export async function loadMapsProject(
  rootPath: string,
  backend: LoreScanBackend,
  expectedProjectId: string | null,
): Promise<MapsProjectLoadResult> {
  let entries: readonly LoreScanEntry[];
  try {
    entries = await backend.readDirectory(rootPath);
  } catch (cause) {
    return {
      kind: "unreadable",
      message: `Could not inspect the selected project for ${MAPS_FILE}: ${formatError(cause)}`,
    };
  }

  const entry = entries.find(({ name }) => name === MAPS_FILE);
  if (!entry) return { kind: "absent" };
  if (entry.isSymlink || !entry.isFile || entry.isDirectory) {
    return { kind: "unsafe", message: `${MAPS_FILE} must be a regular non-symbolic file.` };
  }

  const absolutePath = await backend.join(rootPath, MAPS_FILE);
  const loaded = await readStableMapsText(absolutePath, backend);
  if (loaded.kind !== "ready") {
    if (loaded.kind === "oversized") {
      return {
        kind: "invalid",
        issues: [{ path: "$", message: loaded.message }],
        fingerprint: null,
      };
    }
    return { kind: loaded.kind, message: loaded.message };
  }

  const parsed = parseMapsProject(loaded.text);
  if (parsed.kind !== "valid") return { ...parsed, fingerprint: loaded.fingerprint };
  if (!expectedProjectId) {
    return {
      kind: "manifest-unavailable",
      projectId: parsed.mapsProject.projectId,
      fingerprint: loaded.fingerprint,
      message: `${MAPS_FILE} needs a valid world-project manifest before its maps can be used. The file was not changed.`,
    };
  }
  if (parsed.mapsProject.projectId !== expectedProjectId) {
    return {
      kind: "project-mismatch",
      projectId: parsed.mapsProject.projectId,
      expectedProjectId,
      fingerprint: loaded.fingerprint,
      message: `${MAPS_FILE} belongs to a different world project. Its maps are disabled, and the file was not changed.`,
    };
  }

  return {
    kind: "ready",
    fingerprint: loaded.fingerprint,
    text: loaded.text,
    source: parsed.source,
    mapsProject: parsed.mapsProject,
  };
}

async function readStableMapsText(
  absolutePath: string,
  backend: LoreScanBackend,
): Promise<StableReadResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const before = await backend.inspectFile(absolutePath);
      if (before.size > MAX_MAPS_BYTES) return oversized();
      const text = await backend.readText(absolutePath);
      const after = await backend.inspectFile(absolutePath);
      const bytes = new TextEncoder().encode(text).byteLength;
      if (bytes > MAX_MAPS_BYTES) return oversized();
      if (before.size === after.size && before.revision === after.revision && after.size === bytes) {
        return { kind: "ready", text, fingerprint: fingerprintContent(text) };
      }
    } catch (cause) {
      return { kind: "unreadable", message: `Could not read ${MAPS_FILE}: ${formatError(cause)}` };
    }
  }
  return { kind: "unstable", message: `${MAPS_FILE} kept changing while it was read.` };
}

function oversized(): StableReadResult {
  return { kind: "oversized", message: `${MAPS_FILE} exceeds the ${MAX_MAPS_BYTES}-byte read limit.` };
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
