import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  planManuscriptSceneSplit,
  type ManuscriptSceneSplitPlan,
} from "./split";

export interface SceneSplitAtomicRequest {
  sourceRelative: string;
  destinationRelative: string;
  expectedSourceText: string;
  leftSourceText: string;
  rightSourceText: string;
  expectedStructureText: string;
  newStructureText: string;
}

export interface SceneSplitUndoAtomicRequest {
  sourceRelative: string;
  destinationRelative: string;
  expectedLeftSourceText: string;
  expectedRightSourceText: string;
  restoredSourceText: string;
  expectedStructureText: string;
  restoredStructureText: string;
}

export interface SceneSplitTransactionOutcome {
  cleanupWarnings: string[];
}

export interface ManuscriptSceneSplitIo {
  reload: () => Promise<ManuscriptProjectLoadResult>;
  readSource: (relativePath: string) => Promise<string>;
  sourceExists: (relativePath: string) => Promise<boolean>;
  splitAtomic: (request: SceneSplitAtomicRequest) => Promise<SceneSplitTransactionOutcome>;
  undoAtomic: (request: SceneSplitUndoAtomicRequest) => Promise<SceneSplitTransactionOutcome>;
}

export interface ManuscriptSceneSplitUndo {
  label: string;
  sourcePath: string;
  destinationPath: string;
  expectedLeftSourceText: string;
  expectedLeftSourceFingerprint: string;
  expectedRightSourceText: string;
  expectedRightSourceFingerprint: string;
  restoredSourceText: string;
  restoredSourceFingerprint: string;
  expectedStructureText: string;
  expectedStructureFingerprint: string;
  restoredStructureText: string;
  restoredStructureFingerprint: string;
}

export type ManuscriptSceneSplitExecutionResult =
  | {
      kind: "success";
      project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>;
      undo: ManuscriptSceneSplitUndo;
      cleanupWarnings: string[];
    }
  | { kind: "failed"; message: string };

export type ManuscriptSceneSplitUndoResult =
  | {
      kind: "success";
      project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>;
      cleanupWarnings: string[];
    }
  | { kind: "failed"; message: string };

export async function executeManuscriptSceneSplit(
  plan: Extract<ManuscriptSceneSplitPlan, { kind: "ready" }>,
  io: ManuscriptSceneSplitIo,
): Promise<ManuscriptSceneSplitExecutionResult> {
  const current = await safelyReload(io);
  if (current.kind !== "ready") return current;
  if (
    current.project.fingerprint !== plan.target.structureFingerprint ||
    current.project.text !== plan.originalStructureText
  ) {
    return failed("The manuscript structure changed after preview; nothing was written.");
  }
  const currentSource = await safelyReadSource(io, plan.target.sourcePath);
  if (currentSource.kind === "failed") return currentSource;
  if (
    currentSource.text !== plan.originalSourceText ||
    fingerprintContent(currentSource.text) !== plan.target.sourceFingerprint
  ) {
    return failed("The scene changed after preview; nothing was written.");
  }
  if (await safelyExists(io, plan.target.newSourcePath)) {
    return failed("The new scene destination now exists; nothing was written.");
  }

  const refreshed = planManuscriptSceneSplit(current.project, {
    sourcePath: plan.target.sourcePath,
    sourceText: currentSource.text,
    sourceFingerprint: plan.target.sourceFingerprint,
    caretOffset: plan.target.caretOffset,
    newSceneId: plan.target.newSceneId,
    newSceneTitle: plan.target.newSceneTitle,
    newSourcePath: plan.target.newSourcePath,
  });
  if (!samePlan(refreshed, plan)) {
    return failed("The scene-split preview is stale; review it again before writing.");
  }

  let outcome: SceneSplitTransactionOutcome;
  try {
    outcome = await io.splitAtomic({
      sourceRelative: plan.target.sourcePath,
      destinationRelative: plan.target.newSourcePath,
      expectedSourceText: plan.originalSourceText,
      leftSourceText: plan.leftSourceText,
      rightSourceText: plan.rightSourceText,
      expectedStructureText: plan.originalStructureText,
      newStructureText: plan.updatedStructureText,
    });
  } catch (cause) {
    return failed(`The scene split was not confirmed: ${formatError(cause)}`);
  }

  const verified = await verifyAppliedSplit(plan, io);
  if (verified.kind === "failed") return verified;
  return {
    kind: "success",
    project: verified.project,
    cleanupWarnings: outcome.cleanupWarnings,
    undo: {
      label: `Undo split of ${plan.target.sceneTitle}`,
      sourcePath: plan.target.sourcePath,
      destinationPath: plan.target.newSourcePath,
      expectedLeftSourceText: plan.leftSourceText,
      expectedLeftSourceFingerprint: plan.leftSourceFingerprint,
      expectedRightSourceText: plan.rightSourceText,
      expectedRightSourceFingerprint: plan.rightSourceFingerprint,
      restoredSourceText: plan.originalSourceText,
      restoredSourceFingerprint: plan.target.sourceFingerprint,
      expectedStructureText: plan.updatedStructureText,
      expectedStructureFingerprint: plan.updatedStructureFingerprint,
      restoredStructureText: plan.originalStructureText,
      restoredStructureFingerprint: plan.target.structureFingerprint,
    },
  };
}

export async function undoManuscriptSceneSplit(
  undo: ManuscriptSceneSplitUndo,
  io: ManuscriptSceneSplitIo,
): Promise<ManuscriptSceneSplitUndoResult> {
  const current = await safelyReload(io);
  if (current.kind !== "ready") return current;
  if (
    current.project.text !== undo.expectedStructureText ||
    current.project.fingerprint !== undo.expectedStructureFingerprint
  ) {
    return failed("Undo is no longer safe because the manuscript structure changed.");
  }
  const left = await safelyReadSource(io, undo.sourcePath);
  if (left.kind === "failed") return failed("Undo is no longer safe because the left scene is unavailable.");
  const right = await safelyReadSource(io, undo.destinationPath);
  if (right.kind === "failed") return failed("Undo is no longer safe because the right scene is unavailable.");
  if (
    left.text !== undo.expectedLeftSourceText ||
    fingerprintContent(left.text) !== undo.expectedLeftSourceFingerprint
  ) {
    return failed("Undo is no longer safe because the left scene changed.");
  }
  if (
    right.text !== undo.expectedRightSourceText ||
    fingerprintContent(right.text) !== undo.expectedRightSourceFingerprint
  ) {
    return failed("Undo is no longer safe because the right scene changed.");
  }

  let outcome: SceneSplitTransactionOutcome;
  try {
    outcome = await io.undoAtomic({
      sourceRelative: undo.sourcePath,
      destinationRelative: undo.destinationPath,
      expectedLeftSourceText: undo.expectedLeftSourceText,
      expectedRightSourceText: undo.expectedRightSourceText,
      restoredSourceText: undo.restoredSourceText,
      expectedStructureText: undo.expectedStructureText,
      restoredStructureText: undo.restoredStructureText,
    });
  } catch (cause) {
    return failed(`The scene-split Undo was not confirmed: ${formatError(cause)}`);
  }

  const restored = await safelyReload(io);
  if (restored.kind !== "ready") {
    return failed(`Undo may have completed, but verification failed: ${restored.message}`);
  }
  const source = await safelyReadSource(io, undo.sourcePath);
  if (
    source.kind === "failed" ||
    source.text !== undo.restoredSourceText ||
    fingerprintContent(source.text) !== undo.restoredSourceFingerprint ||
    restored.project.text !== undo.restoredStructureText ||
    restored.project.fingerprint !== undo.restoredStructureFingerprint ||
    (await safelyExists(io, undo.destinationPath))
  ) {
    return failed("Undo completed, but the exact reread did not match and needs review.");
  }
  return { kind: "success", project: restored.project, cleanupWarnings: outcome.cleanupWarnings };
}

async function verifyAppliedSplit(
  plan: Extract<ManuscriptSceneSplitPlan, { kind: "ready" }>,
  io: ManuscriptSceneSplitIo,
): Promise<
  | { kind: "ready"; project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }> }
  | { kind: "failed"; message: string }
> {
  const reloaded = await safelyReload(io);
  if (reloaded.kind !== "ready") {
    return failed(`The split may have completed, but verification failed: ${reloaded.message}`);
  }
  const left = await safelyReadSource(io, plan.target.sourcePath);
  const right = await safelyReadSource(io, plan.target.newSourcePath);
  if (
    left.kind === "failed" ||
    right.kind === "failed" ||
    reloaded.project.text !== plan.updatedStructureText ||
    reloaded.project.fingerprint !== plan.updatedStructureFingerprint ||
    left.text !== plan.leftSourceText ||
    fingerprintContent(left.text) !== plan.leftSourceFingerprint ||
    right.text !== plan.rightSourceText ||
    fingerprintContent(right.text) !== plan.rightSourceFingerprint
  ) {
    return failed("The split completed, but the exact reread did not match and needs review.");
  }
  return reloaded;
}

function samePlan(
  refreshed: ManuscriptSceneSplitPlan,
  approved: Extract<ManuscriptSceneSplitPlan, { kind: "ready" }>,
): refreshed is Extract<ManuscriptSceneSplitPlan, { kind: "ready" }> {
  return refreshed.kind === "ready" &&
    refreshed.updatedStructureText === approved.updatedStructureText &&
    refreshed.leftSourceText === approved.leftSourceText &&
    refreshed.rightSourceText === approved.rightSourceText &&
    refreshed.target.sceneId === approved.target.sceneId &&
    refreshed.target.arrayJsonPath === approved.target.arrayJsonPath &&
    refreshed.target.newSceneId === approved.target.newSceneId &&
    refreshed.target.newSourcePath === approved.target.newSourcePath;
}

async function safelyReload(
  io: ManuscriptSceneSplitIo,
): Promise<
  | { kind: "ready"; project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }> }
  | { kind: "failed"; message: string }
> {
  try {
    const project = await io.reload();
    return project.kind === "ready"
      ? { kind: "ready", project }
      : failed(`The manuscript structure is ${project.kind} and cannot be changed.`);
  } catch (cause) {
    return failed(`The manuscript structure could not be reloaded: ${formatError(cause)}`);
  }
}

async function safelyReadSource(
  io: ManuscriptSceneSplitIo,
  relativePath: string,
): Promise<{ kind: "ready"; text: string } | { kind: "failed"; message: string }> {
  try {
    return { kind: "ready", text: await io.readSource(relativePath) };
  } catch (cause) {
    return failed(`The scene source could not be read: ${formatError(cause)}`);
  }
}

async function safelyExists(io: ManuscriptSceneSplitIo, relativePath: string): Promise<boolean> {
  try {
    return await io.sourceExists(relativePath);
  } catch {
    return true;
  }
}

function failed(message: string): { kind: "failed"; message: string } {
  return { kind: "failed", message };
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
