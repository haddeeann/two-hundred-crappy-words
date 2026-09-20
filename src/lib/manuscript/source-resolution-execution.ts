import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult, ManuscriptSourceState } from "./source-reconciliation";
import type { ManuscriptRepairIo, ManuscriptRepairUndo } from "./repair-execution";
import {
  planCreateMissingManuscriptSource,
  planLocateMissingManuscriptSource,
  planRemoveMissingManuscriptScene,
  type ManuscriptSourceResolutionPlan,
} from "./source-resolution";

export interface ManuscriptSourceResolutionIo extends ManuscriptRepairIo {
  readVerifiedSource: (relativePath: string) => Promise<string>;
  createSource: (relativePath: string, text: string) => Promise<void>;
}

export type ManuscriptSourceResolutionExecutionResult =
  | {
      kind: "success";
      project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>;
      undo: ManuscriptRepairUndo | null;
    }
  | { kind: "failed"; message: string };

export async function executeManuscriptSourceResolution(
  plan: Exclude<ManuscriptSourceResolutionPlan, { kind: "unavailable" }>,
  io: ManuscriptSourceResolutionIo,
): Promise<ManuscriptSourceResolutionExecutionResult> {
  const current = await safelyReload(io);
  if (current.kind !== "ready") return current;
  if (
    current.project.fingerprint !== plan.target.structureFingerprint ||
    current.project.text !== plan.originalText
  ) {
    return failed("The manuscript structure changed after preview; nothing was written.");
  }

  if (plan.kind === "locate") return executeLocate(plan, current.project, io);
  if (plan.kind === "create") return executeCreate(plan, current.project, io);
  return executeRemove(plan, current.project, io);
}

async function executeLocate(
  plan: Extract<ManuscriptSourceResolutionPlan, { kind: "locate" }>,
  current: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  io: ManuscriptSourceResolutionIo,
): Promise<ManuscriptSourceResolutionExecutionResult> {
  let selectedText: string;
  try {
    selectedText = await io.readVerifiedSource(plan.selectedPath);
  } catch (cause) {
    return failed(`The selected Markdown source is no longer verified: ${formatError(cause)}`);
  }
  if (fingerprintContent(selectedText) !== plan.selectedFingerprint) {
    return failed("The selected Markdown source changed after preview; nothing was written.");
  }
  const refreshed = planLocateMissingManuscriptSource(
    current,
    plan.target.itemId,
    plan.selectedPath,
    selectedText,
  );
  if (
    refreshed.kind !== "locate" ||
    refreshed.updatedText !== plan.updatedText ||
    refreshed.selectedFingerprint !== plan.selectedFingerprint
  ) {
    return failed("The Locate preview is stale; review it again before writing.");
  }
  return replaceAndVerify(
    plan,
    io,
    `Undo located source for ${plan.target.itemTitle}`,
  );
}

async function executeRemove(
  plan: Extract<ManuscriptSourceResolutionPlan, { kind: "remove" }>,
  current: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  io: ManuscriptSourceResolutionIo,
): Promise<ManuscriptSourceResolutionExecutionResult> {
  const refreshed = planRemoveMissingManuscriptScene(current, plan.target.itemId);
  if (refreshed.kind !== "remove" || refreshed.updatedText !== plan.updatedText) {
    return failed("The removal preview is stale; review it again before writing.");
  }
  return replaceAndVerify(
    plan,
    io,
    `Undo removal of ${plan.target.itemTitle}`,
  );
}

async function executeCreate(
  plan: Extract<ManuscriptSourceResolutionPlan, { kind: "create" }>,
  current: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  io: ManuscriptSourceResolutionIo,
): Promise<ManuscriptSourceResolutionExecutionResult> {
  const refreshed = planCreateMissingManuscriptSource(current, plan.target.itemId);
  if (
    refreshed.kind !== "create" ||
    refreshed.sourceText !== plan.sourceText ||
    refreshed.target.declaredPath !== plan.target.declaredPath
  ) {
    return failed("The create-source preview is stale; review it again before writing.");
  }
  try {
    await io.createSource(plan.target.declaredPath, plan.sourceText);
  } catch (cause) {
    return failed(`The source was not created: ${formatError(cause)}`);
  }
  const reloaded = await safelyReload(io);
  if (reloaded.kind !== "ready") {
    return failed(`The source was created, but manuscript verification failed: ${reloaded.message}`);
  }
  const source = sourceStateForItem(reloaded.project, plan.target.itemId);
  if (
    source?.kind !== "ready" ||
    source.resolvedPath !== plan.target.declaredPath ||
    source.fingerprint !== plan.sourceFingerprint
  ) {
    return failed("The source was created, but its verified binding does not match the preview and needs review.");
  }
  return { kind: "success", project: reloaded.project, undo: null };
}

async function replaceAndVerify(
  plan: Extract<ManuscriptSourceResolutionPlan, { kind: "locate" | "remove" }>,
  io: ManuscriptSourceResolutionIo,
  undoLabel: string,
): Promise<ManuscriptSourceResolutionExecutionResult> {
  try {
    await io.replaceAtomic(plan.originalText, plan.updatedText);
  } catch (cause) {
    return failed(`The structure change was not confirmed: ${formatError(cause)}`);
  }
  const reloaded = await safelyReload(io);
  if (reloaded.kind !== "ready") {
    return failed(`The structure may have changed, but verification failed: ${reloaded.message}`);
  }
  if (
    reloaded.project.fingerprint !== plan.updatedFingerprint ||
    reloaded.project.text !== plan.updatedText
  ) {
    return failed("The structure changed, but the exact reread did not match and needs review.");
  }
  return {
    kind: "success",
    project: reloaded.project,
    undo: {
      label: undoLabel,
      expectedText: plan.updatedText,
      expectedFingerprint: plan.updatedFingerprint,
      restoreText: plan.originalText,
      restoreFingerprint: plan.target.structureFingerprint,
    },
  };
}

function sourceStateForItem(
  project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  itemId: string,
): ManuscriptSourceState | null {
  for (const manuscript of project.reconciled.manuscripts) {
    for (const item of manuscript.items) {
      if (item.item.id === itemId) return "children" in item ? item.source : item.source;
      if ("children" in item) {
        const child = item.children.find((candidate) => candidate.item.id === itemId);
        if (child) return child.source;
      }
    }
  }
  return null;
}

async function safelyReload(
  io: ManuscriptSourceResolutionIo,
): Promise<
  | { kind: "ready"; project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }> }
  | { kind: "failed"; message: string }
> {
  try {
    const project = await io.reload();
    return project.kind === "ready"
      ? { kind: "ready", project }
      : { kind: "failed", message: `The manuscript structure is ${project.kind} and cannot be resolved.` };
  } catch (cause) {
    return { kind: "failed", message: `The manuscript structure could not be reloaded: ${formatError(cause)}` };
  }
}

function failed(message: string): ManuscriptSourceResolutionExecutionResult {
  return { kind: "failed", message };
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
