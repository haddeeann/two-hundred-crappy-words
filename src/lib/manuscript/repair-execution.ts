import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  manuscriptSourceRepairCandidates,
  planManuscriptSourceRepair,
  type ManuscriptSourceRepairPlan,
} from "./repair";

export interface ManuscriptRepairIo {
  reload: () => Promise<ManuscriptProjectLoadResult>;
  replaceAtomic: (expectedText: string, newText: string) => Promise<void>;
}

export interface ManuscriptRepairUndo {
  label: string;
  expectedText: string;
  expectedFingerprint: string;
  restoreText: string;
  restoreFingerprint: string;
}

export type ManuscriptRepairExecutionResult =
  | { kind: "success"; project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>; undo: ManuscriptRepairUndo }
  | { kind: "failed"; message: string };

export async function executeManuscriptSourceRepair(
  plan: Extract<ManuscriptSourceRepairPlan, { kind: "ready" }>,
  io: ManuscriptRepairIo,
): Promise<ManuscriptRepairExecutionResult> {
  const current = await safelyReload(io);
  if (current.kind !== "ready") return current;
  if (
    current.project.fingerprint !== plan.candidate.structureFingerprint ||
    current.project.text !== plan.originalText
  ) {
    return failed("The manuscript structure changed after preview; nothing was written.");
  }
  const candidate = manuscriptSourceRepairCandidates(current.project).find(
    ({ key }) => key === plan.candidate.key,
  );
  if (
    !candidate ||
    candidate.oldPath !== plan.candidate.oldPath ||
    candidate.suggestedPath !== plan.candidate.suggestedPath ||
    candidate.noteId !== plan.candidate.noteId ||
    candidate.candidateFingerprint !== plan.candidate.candidateFingerprint
  ) {
    return failed("The moved Markdown candidate changed after preview; nothing was written.");
  }
  const refreshedPlan = planManuscriptSourceRepair(current.project, candidate.key);
  if (
    refreshedPlan.kind !== "ready" ||
    refreshedPlan.updatedText !== plan.updatedText ||
    refreshedPlan.jsonPath !== plan.jsonPath
  ) {
    return failed("The repair preview is stale; review it again before writing.");
  }

  try {
    await io.replaceAtomic(plan.originalText, plan.updatedText);
  } catch (cause) {
    return failed(`The structure repair was not confirmed: ${formatError(cause)}`);
  }
  const reloaded = await safelyReload(io);
  if (reloaded.kind !== "ready") {
    return failed(`The replacement may have completed, but verification failed: ${reloaded.message}`);
  }
  if (
    reloaded.project.fingerprint !== plan.updatedFingerprint ||
    reloaded.project.text !== plan.updatedText
  ) {
    return failed("The replacement completed, but the reread did not match and needs review.");
  }
  return {
    kind: "success",
    project: reloaded.project,
    undo: {
      label: `Undo path repair for ${plan.candidate.itemTitle}`,
      expectedText: plan.updatedText,
      expectedFingerprint: plan.updatedFingerprint,
      restoreText: plan.originalText,
      restoreFingerprint: plan.candidate.structureFingerprint,
    },
  };
}

export async function undoManuscriptSourceRepair(
  undo: ManuscriptRepairUndo,
  io: ManuscriptRepairIo,
): Promise<ManuscriptRepairExecutionResult> {
  const current = await safelyReload(io);
  if (current.kind !== "ready") return current;
  if (
    current.project.fingerprint !== undo.expectedFingerprint ||
    current.project.text !== undo.expectedText
  ) {
    return failed("Undo is no longer safe because the manuscript structure changed.");
  }
  try {
    await io.replaceAtomic(undo.expectedText, undo.restoreText);
  } catch (cause) {
    return failed(`Undo did not change the structure: ${formatError(cause)}`);
  }
  const reloaded = await safelyReload(io);
  if (reloaded.kind !== "ready") {
    return failed(`Undo may have completed, but verification failed: ${reloaded.message}`);
  }
  if (
    reloaded.project.fingerprint !== undo.restoreFingerprint ||
    reloaded.project.text !== undo.restoreText
  ) {
    return failed("Undo completed, but the reread did not match and needs review.");
  }
  return {
    kind: "success",
    project: reloaded.project,
    undo: {
      label: "Redo the last manuscript source-path repair",
      expectedText: undo.restoreText,
      expectedFingerprint: undo.restoreFingerprint,
      restoreText: undo.expectedText,
      restoreFingerprint: undo.expectedFingerprint,
    },
  };
}

async function safelyReload(
  io: ManuscriptRepairIo,
): Promise<
  | { kind: "ready"; project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }> }
  | { kind: "failed"; message: string }
> {
  try {
    const project = await io.reload();
    return project.kind === "ready"
      ? { kind: "ready", project }
      : { kind: "failed", message: `The manuscript structure is ${project.kind} and cannot be mutated.` };
  } catch (cause) {
    return { kind: "failed", message: `The manuscript structure could not be reloaded: ${formatError(cause)}` };
  }
}

function failed(message: string): ManuscriptRepairExecutionResult {
  return { kind: "failed", message };
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
