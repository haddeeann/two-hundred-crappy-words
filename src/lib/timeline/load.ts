import { fingerprintContent } from "$lib/editor/recovery";
import type { LoreScanBackend, LoreScanEntry } from "$lib/lore/scan";
import {
  MAX_TIMELINE_BYTES,
  TIMELINE_FILE,
  parseTimelineProject,
  type TimelineIssue,
  type TimelineProject,
} from "./format";

export type TimelineProjectLoadResult =
  | { kind: "absent" }
  | { kind: "unsafe" | "unreadable" | "unstable"; message: string }
  | { kind: "malformed"; message: string; fingerprint: string }
  | { kind: "invalid"; issues: TimelineIssue[]; fingerprint: string | null }
  | { kind: "unsupported-version"; version: number; fingerprint: string }
  | {
      kind: "manifest-unavailable";
      projectId: string;
      fingerprint: string;
      message: string;
    }
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
      timeline: TimelineProject;
    };

type StableReadResult =
  | { kind: "ready"; text: string; fingerprint: string }
  | { kind: "unreadable" | "unstable" | "oversized"; message: string };

export async function loadTimelineProject(
  rootPath: string,
  backend: LoreScanBackend,
  expectedProjectId: string | null,
): Promise<TimelineProjectLoadResult> {
  let entries: readonly LoreScanEntry[];
  try {
    entries = await backend.readDirectory(rootPath);
  } catch (cause) {
    return {
      kind: "unreadable",
      message: `Could not inspect the selected project for ${TIMELINE_FILE}: ${formatError(cause)}`,
    };
  }

  const entry = entries.find(({ name }) => name === TIMELINE_FILE);
  if (!entry) return { kind: "absent" };
  if (entry.isSymlink || !entry.isFile || entry.isDirectory) {
    return {
      kind: "unsafe",
      message: `${TIMELINE_FILE} must be a regular non-symbolic file.`,
    };
  }

  const absolutePath = await backend.join(rootPath, TIMELINE_FILE);
  const loaded = await readStableTimelineText(absolutePath, backend);
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

  const parsed = parseTimelineProject(loaded.text);
  if (parsed.kind === "malformed") {
    return { ...parsed, fingerprint: loaded.fingerprint };
  }
  if (parsed.kind === "invalid") {
    return { ...parsed, fingerprint: loaded.fingerprint };
  }
  if (parsed.kind === "unsupported-version") {
    return { ...parsed, fingerprint: loaded.fingerprint };
  }
  if (!expectedProjectId) {
    return {
      kind: "manifest-unavailable",
      projectId: parsed.timeline.projectId,
      fingerprint: loaded.fingerprint,
      message: `${TIMELINE_FILE} needs a valid world-project manifest before its calendars or tracks can be used. Gregorian timeline facts remain available.`,
    };
  }
  if (parsed.timeline.projectId !== expectedProjectId) {
    return {
      kind: "project-mismatch",
      projectId: parsed.timeline.projectId,
      expectedProjectId,
      fingerprint: loaded.fingerprint,
      message: `${TIMELINE_FILE} belongs to a different world project. Its calendars and tracks are disabled, and the file was not changed.`,
    };
  }

  return {
    kind: "ready",
    fingerprint: loaded.fingerprint,
    text: loaded.text,
    source: parsed.source,
    timeline: parsed.timeline,
  };
}

async function readStableTimelineText(
  absolutePath: string,
  backend: LoreScanBackend,
): Promise<StableReadResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const before = await backend.inspectFile(absolutePath);
      if (before.size > MAX_TIMELINE_BYTES) return oversized();
      const text = await backend.readText(absolutePath);
      const after = await backend.inspectFile(absolutePath);
      const bytes = new TextEncoder().encode(text).byteLength;
      if (bytes > MAX_TIMELINE_BYTES) return oversized();
      if (
        before.size === after.size &&
        before.revision === after.revision &&
        after.size === bytes
      ) {
        return { kind: "ready", text, fingerprint: fingerprintContent(text) };
      }
    } catch (cause) {
      return {
        kind: "unreadable",
        message: `Could not read ${TIMELINE_FILE}: ${formatError(cause)}`,
      };
    }
  }
  return {
    kind: "unstable",
    message: `${TIMELINE_FILE} kept changing while it was read.`,
  };
}

function oversized(): StableReadResult {
  return {
    kind: "oversized",
    message: `${TIMELINE_FILE} exceeds the ${MAX_TIMELINE_BYTES}-byte read limit.`,
  };
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
