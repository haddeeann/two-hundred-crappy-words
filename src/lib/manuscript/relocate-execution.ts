import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  planManuscriptSceneMove,
  type ManuscriptSceneMovePlan,
} from "./relocate";
import type {
  ManuscriptRepairExecutionResult,
  ManuscriptRepairIo,
  ManuscriptRepairUndo,
} from "./repair-execution";

export async function executeManuscriptSceneMove(
  plan: Extract<ManuscriptSceneMovePlan, { kind: "ready" }>,
  io: ManuscriptRepairIo,
): Promise<ManuscriptRepairExecutionResult> {
  const current = await safelyReload(io);
  if (current.kind !== "ready") return current;
  if (
    current.project.fingerprint !== plan.target.structureFingerprint ||
    current.project.text !== plan.originalText
  ) {
    return failed("The manuscript structure changed after preview; nothing was written.");
  }
  const refreshed = planManuscriptSceneMove(
    current.project,
    plan.target.sceneId,
    plan.target.destinationKey,
    plan.target.destinationIndex,
  );
  if (
    refreshed.kind !== "ready" ||
    refreshed.updatedText !== plan.updatedText ||
    refreshed.target.sourceArrayJsonPath !== plan.target.sourceArrayJsonPath ||
    refreshed.target.destinationArrayJsonPath !== plan.target.destinationArrayJsonPath ||
    refreshed.target.oldPosition !== plan.target.oldPosition ||
    refreshed.target.newPosition !== plan.target.newPosition
  ) {
    return failed("The scene-move preview is stale; review it again before writing.");
  }

  try {
    await io.replaceAtomic(plan.originalText, plan.updatedText);
  } catch (cause) {
    return failed(`The scene move was not confirmed: ${formatError(cause)}`);
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
  const undo: ManuscriptRepairUndo = {
    label: `Undo container move for ${plan.target.sceneTitle}`,
    expectedText: plan.updatedText,
    expectedFingerprint: plan.updatedFingerprint,
    restoreText: plan.originalText,
    restoreFingerprint: plan.target.structureFingerprint,
  };
  return { kind: "success", project: reloaded.project, undo };
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
