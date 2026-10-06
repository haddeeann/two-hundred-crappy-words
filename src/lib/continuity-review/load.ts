import { fingerprintContent } from "$lib/editor/recovery";
import type { LoreScanBackend, LoreScanEntry } from "$lib/lore/scan";
import {
  CONTINUITY_REVIEW_FILE,
  MAX_CONTINUITY_REVIEW_BYTES,
  parseContinuityReviewProject,
  type ContinuityReviewFormatIssue,
  type ContinuityReviewProject,
} from "./format";

export type ContinuityReviewProjectLoadResult =
  | { kind: "absent" }
  | { kind: "unsafe" | "unreadable" | "unstable"; message: string }
  | { kind: "malformed"; message: string; fingerprint: string }
  | { kind: "invalid"; issues: ContinuityReviewFormatIssue[]; fingerprint: string | null }
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
      continuityReviewProject: ContinuityReviewProject;
    };

type StableReadResult =
  | { kind: "ready"; text: string; fingerprint: string }
  | { kind: "unreadable" | "unstable" | "oversized"; message: string };

export async function loadContinuityReviewProject(
  rootPath: string,
  backend: LoreScanBackend,
  expectedProjectId: string | null,
): Promise<ContinuityReviewProjectLoadResult> {
  let entries: readonly LoreScanEntry[];
  try {
    entries = await backend.readDirectory(rootPath);
  } catch (cause) {
    return {
      kind: "unreadable",
      message: `Could not inspect the selected project for ${CONTINUITY_REVIEW_FILE}: ${formatError(cause)}`,
    };
  }

  const matchingEntries = entries.filter(({ name }) => name === CONTINUITY_REVIEW_FILE);
  if (matchingEntries.length === 0) return { kind: "absent" };
  if (matchingEntries.length !== 1) {
    return {
      kind: "unsafe",
      message: `${CONTINUITY_REVIEW_FILE} must resolve to exactly one root entry.`,
    };
  }
  const entry = matchingEntries[0]!;
  if (entry.isSymlink || !entry.isFile || entry.isDirectory) {
    return {
      kind: "unsafe",
      message: `${CONTINUITY_REVIEW_FILE} must be a regular non-symbolic file.`,
    };
  }

  const absolutePath = await backend.join(rootPath, CONTINUITY_REVIEW_FILE);
  const loaded = await readStableContinuityReviewText(absolutePath, backend);
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

  const parsed = parseContinuityReviewProject(loaded.text);
  if (parsed.kind !== "valid") return { ...parsed, fingerprint: loaded.fingerprint };
  if (!expectedProjectId) {
    return {
      kind: "manifest-unavailable",
      projectId: parsed.continuityReviewProject.projectId,
      fingerprint: loaded.fingerprint,
      message: `${CONTINUITY_REVIEW_FILE} needs a valid world-project manifest before its exceptions can be used. The file was not changed.`,
    };
  }
  if (parsed.continuityReviewProject.projectId !== expectedProjectId) {
    return {
      kind: "project-mismatch",
      projectId: parsed.continuityReviewProject.projectId,
      expectedProjectId,
      fingerprint: loaded.fingerprint,
      message: `${CONTINUITY_REVIEW_FILE} belongs to a different world project. Its exceptions are disabled, and the file was not changed.`,
    };
  }

  return {
    kind: "ready",
    fingerprint: loaded.fingerprint,
    text: loaded.text,
    source: parsed.source,
    continuityReviewProject: parsed.continuityReviewProject,
  };
}

async function readStableContinuityReviewText(
  absolutePath: string,
  backend: LoreScanBackend,
): Promise<StableReadResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const before = await backend.inspectFile(absolutePath);
      if (before.size > MAX_CONTINUITY_REVIEW_BYTES) return oversized();
      const text = await backend.readText(absolutePath);
      const after = await backend.inspectFile(absolutePath);
      const bytes = new TextEncoder().encode(text).byteLength;
      if (bytes > MAX_CONTINUITY_REVIEW_BYTES) return oversized();
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
        message: `Could not read ${CONTINUITY_REVIEW_FILE}: ${formatError(cause)}`,
      };
    }
  }
  return {
    kind: "unstable",
    message: `${CONTINUITY_REVIEW_FILE} kept changing while it was read.`,
  };
}

function oversized(): StableReadResult {
  return {
    kind: "oversized",
    message: `${CONTINUITY_REVIEW_FILE} exceeds the ${MAX_CONTINUITY_REVIEW_BYTES}-byte read limit.`,
  };
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
