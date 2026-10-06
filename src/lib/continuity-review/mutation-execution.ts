import type { ContinuityReviewProjectLoadResult } from "./load";
import {
  planContinuityExceptionMutation,
  type ContinuityExceptionMutationPlan,
  type ContinuityExceptionMutationRequest,
} from "./mutation";

export interface ContinuityExceptionMutationIo {
  reload(): Promise<ContinuityReviewProjectLoadResult>;
  createNew(text: string): Promise<void>;
  replaceAtomic(expectedText: string, newText: string): Promise<void>;
  removeCreated(expectedText: string): Promise<void>;
}

export interface ContinuityExceptionMutationUndo {
  label: string;
  projectId: string;
  expectedText: string;
  expectedFingerprint: string;
  restoreText: string | null;
  restoreFingerprint: string | null;
}

export type ContinuityExceptionMutationExecutionResult =
  | {
      kind: "applied";
      project: Extract<ContinuityReviewProjectLoadResult, { kind: "ready" }>;
      undo: ContinuityExceptionMutationUndo;
    }
  | { kind: "failed"; message: string };

export async function executeContinuityExceptionMutation(
  frozenPlan: Extract<ContinuityExceptionMutationPlan, { kind: "ready" }>,
  request: ContinuityExceptionMutationRequest,
  io: ContinuityExceptionMutationIo,
): Promise<ContinuityExceptionMutationExecutionResult> {
  const current = await safeReload(io);
  if (current.kind === "failed") return current;
  const currentText = current.project.kind === "ready" ? current.project.text : null;
  if (frozenPlan.originalText === null) {
    if (current.project.kind !== "absent") {
      return failed("The intentional-exception file appeared after preview; nothing was overwritten.");
    }
  } else if (
    current.project.kind !== "ready" ||
    current.project.text !== frozenPlan.originalText ||
    current.project.fingerprint !== frozenPlan.originalFingerprint
  ) {
    return failed(
      "The intentional-exception file changed after preview; review a fresh preview before writing.",
    );
  }

  const freshPlan = planContinuityExceptionMutation(currentText, frozenPlan.projectId, request);
  if (freshPlan.kind !== "ready" || !equivalentPlan(frozenPlan, freshPlan)) {
    return failed(
      "The fresh intentional-exception plan no longer matches the reviewed preview. Nothing was written.",
    );
  }

  try {
    if (freshPlan.originalText === null) await io.createNew(freshPlan.updatedText);
    else await io.replaceAtomic(freshPlan.originalText, freshPlan.updatedText);
  } catch (cause) {
    return failed(`The intentional-exception change was not applied: ${formatError(cause)}`);
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
    return failed(
      "The intentional-exception write completed, but its exact reread did not match and needs review.",
    );
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

export async function undoContinuityExceptionMutation(
  undo: ContinuityExceptionMutationUndo,
  io: ContinuityExceptionMutationIo,
): Promise<
  | { kind: "undone"; project: ContinuityReviewProjectLoadResult }
  | { kind: "failed"; message: string }
> {
  const current = await safeReload(io);
  if (current.kind === "failed") return current;
  if (
    current.project.kind !== "ready" ||
    current.project.text !== undo.expectedText ||
    current.project.fingerprint !== undo.expectedFingerprint
  ) {
    return failed(
      "The intentional-exception file changed after the edit, so Undo will not overwrite or remove it.",
    );
  }

  try {
    if (undo.restoreText === null) await io.removeCreated(undo.expectedText);
    else await io.replaceAtomic(undo.expectedText, undo.restoreText);
  } catch (cause) {
    return failed(`The intentional-exception change could not be undone: ${formatError(cause)}`);
  }

  const reloaded = await safeReload(io);
  if (reloaded.kind === "failed") return reloaded;
  if (undo.restoreText === null) {
    return reloaded.project.kind === "absent"
      ? { kind: "undone", project: reloaded.project }
      : failed("Undo removed the created file, but the intentional-exception state did not become absent.");
  }
  if (
    reloaded.project.kind !== "ready" ||
    reloaded.project.text !== undo.restoreText ||
    reloaded.project.fingerprint !== undo.restoreFingerprint
  ) {
    return failed(
      "Undo completed, but the exact restored intentional-exception text could not be verified.",
    );
  }
  return { kind: "undone", project: reloaded.project };
}

function equivalentPlan(
  frozen: Extract<ContinuityExceptionMutationPlan, { kind: "ready" }>,
  fresh: Extract<ContinuityExceptionMutationPlan, { kind: "ready" }>,
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
  io: ContinuityExceptionMutationIo,
): Promise<
  | { kind: "ready"; project: ContinuityReviewProjectLoadResult }
  | { kind: "failed"; message: string }
> {
  try {
    return { kind: "ready", project: await io.reload() };
  } catch (cause) {
    return failed(`The intentional-exception file could not be reloaded safely: ${formatError(cause)}`);
  }
}

function failed(message: string): { kind: "failed"; message: string } {
  return { kind: "failed", message };
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
