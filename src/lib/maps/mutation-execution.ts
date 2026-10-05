import type { MapsProjectLoadResult } from "./load";
import {
  planMapsMutation,
  type MapsMutationPlan,
  type MapsMutationRequest,
} from "./mutation";

export interface MapsMutationIo {
  reload(): Promise<MapsProjectLoadResult>;
  createNew(text: string): Promise<void>;
  replaceAtomic(expectedText: string, newText: string): Promise<void>;
  removeCreated(expectedText: string): Promise<void>;
}

export interface MapsMutationUndo {
  label: string;
  projectId: string;
  expectedText: string;
  expectedFingerprint: string;
  restoreText: string | null;
  restoreFingerprint: string | null;
}

export type MapsMutationExecutionResult =
  | {
      kind: "applied";
      project: Extract<MapsProjectLoadResult, { kind: "ready" }>;
      undo: MapsMutationUndo;
    }
  | { kind: "failed"; message: string };

export async function executeMapsMutation(
  frozenPlan: Extract<MapsMutationPlan, { kind: "ready" }>,
  request: MapsMutationRequest,
  io: MapsMutationIo,
): Promise<MapsMutationExecutionResult> {
  const current = await safeReload(io);
  if (current.kind === "failed") return current;
  const currentText = current.project.kind === "ready" ? current.project.text : null;
  if (frozenPlan.originalText === null) {
    if (current.project.kind !== "absent") {
      return failed("The maps file appeared after preview; nothing was overwritten.");
    }
  } else if (
    current.project.kind !== "ready" ||
    current.project.text !== frozenPlan.originalText ||
    current.project.fingerprint !== frozenPlan.originalFingerprint
  ) {
    return failed("The maps file changed after preview; review a fresh preview before writing.");
  }

  const freshPlan = planMapsMutation(currentText, frozenPlan.projectId, request);
  if (freshPlan.kind !== "ready" || !equivalentPlan(frozenPlan, freshPlan)) {
    return failed("The fresh maps plan no longer matches the reviewed preview. Nothing was written.");
  }

  try {
    if (freshPlan.originalText === null) await io.createNew(freshPlan.updatedText);
    else await io.replaceAtomic(freshPlan.originalText, freshPlan.updatedText);
  } catch (cause) {
    return failed(`The maps change was not applied: ${formatError(cause)}`);
  }

  const reloaded = await safeReload(io);
  if (reloaded.kind === "failed") {
    return failed(`The write may have completed, but verification failed: ${reloaded.message}`);
  }
  if (
    reloaded.project.kind !== "ready" ||
    reloaded.project.text !== freshPlan.updatedText ||
    reloaded.project.fingerprint !== freshPlan.updatedFingerprint
  ) {
    return failed("The maps write completed, but its exact reread did not match and needs review.");
  }

  return {
    kind: "applied",
    project: reloaded.project,
    undo: {
      label: `Undo ${freshPlan.summary.replace(/\.$/u, "").toLocaleLowerCase()}`,
      projectId: freshPlan.projectId,
      expectedText: freshPlan.updatedText,
      expectedFingerprint: freshPlan.updatedFingerprint,
      restoreText: freshPlan.originalText,
      restoreFingerprint: freshPlan.originalFingerprint,
    },
  };
}

export async function undoMapsMutation(
  undo: MapsMutationUndo,
  io: MapsMutationIo,
): Promise<
  | { kind: "undone"; project: MapsProjectLoadResult }
  | { kind: "failed"; message: string }
> {
  const current = await safeReload(io);
  if (current.kind === "failed") return current;
  if (
    current.project.kind !== "ready" ||
    current.project.text !== undo.expectedText ||
    current.project.fingerprint !== undo.expectedFingerprint
  ) {
    return failed("The maps file changed after the edit, so Undo will not overwrite or remove it.");
  }

  try {
    if (undo.restoreText === null) await io.removeCreated(undo.expectedText);
    else await io.replaceAtomic(undo.expectedText, undo.restoreText);
  } catch (cause) {
    return failed(`The maps change could not be undone: ${formatError(cause)}`);
  }

  const reloaded = await safeReload(io);
  if (reloaded.kind === "failed") return reloaded;
  if (undo.restoreText === null) {
    return reloaded.project.kind === "absent"
      ? { kind: "undone", project: reloaded.project }
      : failed("Undo removed the created file, but the maps state did not become absent.");
  }
  if (
    reloaded.project.kind !== "ready" ||
    reloaded.project.text !== undo.restoreText ||
    reloaded.project.fingerprint !== undo.restoreFingerprint
  ) {
    return failed("Undo completed, but the exact restored maps text could not be verified.");
  }
  return { kind: "undone", project: reloaded.project };
}

function equivalentPlan(
  frozen: Extract<MapsMutationPlan, { kind: "ready" }>,
  fresh: Extract<MapsMutationPlan, { kind: "ready" }>,
): boolean {
  return frozen.operation === fresh.operation &&
    JSON.stringify(frozen.request) === JSON.stringify(fresh.request) &&
    frozen.projectId === fresh.projectId &&
    frozen.summary === fresh.summary &&
    frozen.originalText === fresh.originalText &&
    frozen.originalFingerprint === fresh.originalFingerprint &&
    frozen.updatedText === fresh.updatedText &&
    frozen.updatedFingerprint === fresh.updatedFingerprint;
}

async function safeReload(
  io: MapsMutationIo,
): Promise<{ kind: "ready"; project: MapsProjectLoadResult } | { kind: "failed"; message: string }> {
  try {
    return { kind: "ready", project: await io.reload() };
  } catch (cause) {
    return failed(`The maps file could not be reloaded safely: ${formatError(cause)}`);
  }
}

function failed(message: string): { kind: "failed"; message: string } {
  return { kind: "failed", message };
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
