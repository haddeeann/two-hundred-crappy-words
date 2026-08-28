import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import { planManuscriptSceneMerge, type ManuscriptSceneMergePlan } from "./merge";

export interface SceneMergeAtomicRequest {
  leftRelative: string;
  rightRelative: string;
  retiredRelative: string;
  expectedLeftText: string;
  expectedRightText: string;
  insertedBoundary: string;
  mergedLeftText: string;
  expectedStructureText: string;
  newStructureText: string;
}

export interface SceneMergeUndoAtomicRequest {
  leftRelative: string;
  rightRelative: string;
  retiredRelative: string;
  expectedMergedLeftText: string;
  restoredLeftText: string;
  restoredRightText: string;
  insertedBoundary: string;
  expectedStructureText: string;
  restoredStructureText: string;
}

export interface SceneMergeTransactionOutcome {
  cleanupWarnings: string[];
}

export interface ManuscriptSceneMergeIo {
  reload: () => Promise<ManuscriptProjectLoadResult>;
  readSource: (relativePath: string) => Promise<string>;
  sourceExists: (relativePath: string) => Promise<boolean>;
  mergeAtomic: (request: SceneMergeAtomicRequest) => Promise<SceneMergeTransactionOutcome>;
  undoAtomic: (request: SceneMergeUndoAtomicRequest) => Promise<SceneMergeTransactionOutcome>;
}

export interface ManuscriptSceneMergeUndo {
  label: string;
  leftPath: string;
  rightPath: string;
  retiredPath: string;
  expectedMergedLeftText: string;
  expectedMergedLeftFingerprint: string;
  restoredLeftText: string;
  restoredLeftFingerprint: string;
  restoredRightText: string;
  restoredRightFingerprint: string;
  insertedBoundary: string;
  expectedStructureText: string;
  expectedStructureFingerprint: string;
  restoredStructureText: string;
  restoredStructureFingerprint: string;
}

export type ManuscriptSceneMergeExecutionResult =
  | {
      kind: "success";
      project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>;
      undo: ManuscriptSceneMergeUndo;
      cleanupWarnings: string[];
    }
  | { kind: "failed"; message: string };

export type ManuscriptSceneMergeUndoResult =
  | {
      kind: "success";
      project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>;
      cleanupWarnings: string[];
    }
  | { kind: "failed"; message: string };

export async function executeManuscriptSceneMerge(
  plan: Extract<ManuscriptSceneMergePlan, { kind: "ready" }>,
  io: ManuscriptSceneMergeIo,
): Promise<ManuscriptSceneMergeExecutionResult> {
  const current = await safelyReload(io);
  if (current.kind !== "ready") return current;
  if (
    current.project.fingerprint !== plan.target.structureFingerprint ||
    current.project.text !== plan.originalStructureText
  ) {
    return failed("The manuscript structure changed after preview; nothing was written.");
  }
  const left = await safelyReadSource(io, plan.target.leftSourcePath);
  const right = await safelyReadSource(io, plan.target.rightSourcePath);
  if (left.kind === "failed" || right.kind === "failed") {
    return failed("One of the adjacent scene sources is unavailable; nothing was written.");
  }
  if (
    left.text !== plan.originalLeftSourceText ||
    fingerprintContent(left.text) !== plan.target.leftSourceFingerprint ||
    right.text !== plan.originalRightSourceText ||
    fingerprintContent(right.text) !== plan.target.rightSourceFingerprint
  ) {
    return failed("One of the adjacent scenes changed after preview; nothing was written.");
  }
  if (await safelyExists(io, plan.target.retiredSourcePath)) {
    return failed("The retired-source destination now exists; nothing was written.");
  }

  const refreshed = planManuscriptSceneMerge(current.project, {
    leftSceneId: plan.target.leftSceneId,
    leftSourceText: left.text,
    leftSourceFingerprint: plan.target.leftSourceFingerprint,
    rightSourceText: right.text,
    rightSourceFingerprint: plan.target.rightSourceFingerprint,
    join: plan.target.join,
    retiredSourcePath: plan.target.retiredSourcePath,
  });
  if (!samePlan(refreshed, plan)) {
    return failed("The scene-merge preview is stale; review it again before writing.");
  }

  let outcome: SceneMergeTransactionOutcome;
  try {
    outcome = await io.mergeAtomic({
      leftRelative: plan.target.leftSourcePath,
      rightRelative: plan.target.rightSourcePath,
      retiredRelative: plan.target.retiredSourcePath,
      expectedLeftText: plan.originalLeftSourceText,
      expectedRightText: plan.originalRightSourceText,
      insertedBoundary: plan.target.insertedBoundary,
      mergedLeftText: plan.mergedSourceText,
      expectedStructureText: plan.originalStructureText,
      newStructureText: plan.updatedStructureText,
    });
  } catch (cause) {
    return failed(`The scene merge was not confirmed: ${formatError(cause)}`);
  }

  const verified = await verifyAppliedMerge(plan, io);
  if (verified.kind === "failed") return verified;
  return {
    kind: "success",
    project: verified.project,
    cleanupWarnings: outcome.cleanupWarnings,
    undo: {
      label: `Undo merge of ${plan.target.leftSceneTitle} and ${plan.target.rightSceneTitle}`,
      leftPath: plan.target.leftSourcePath,
      rightPath: plan.target.rightSourcePath,
      retiredPath: plan.target.retiredSourcePath,
      expectedMergedLeftText: plan.mergedSourceText,
      expectedMergedLeftFingerprint: plan.mergedSourceFingerprint,
      restoredLeftText: plan.originalLeftSourceText,
      restoredLeftFingerprint: plan.target.leftSourceFingerprint,
      restoredRightText: plan.originalRightSourceText,
      restoredRightFingerprint: plan.target.rightSourceFingerprint,
      insertedBoundary: plan.target.insertedBoundary,
      expectedStructureText: plan.updatedStructureText,
      expectedStructureFingerprint: plan.updatedStructureFingerprint,
      restoredStructureText: plan.originalStructureText,
      restoredStructureFingerprint: plan.target.structureFingerprint,
    },
  };
}

export async function undoManuscriptSceneMerge(
  undo: ManuscriptSceneMergeUndo,
  io: ManuscriptSceneMergeIo,
): Promise<ManuscriptSceneMergeUndoResult> {
  const current = await safelyReload(io);
  if (current.kind !== "ready") return current;
  if (
    current.project.text !== undo.expectedStructureText ||
    current.project.fingerprint !== undo.expectedStructureFingerprint
  ) {
    return failed("Undo is no longer safe because the manuscript structure changed.");
  }
  const left = await safelyReadSource(io, undo.leftPath);
  const retired = await safelyReadSource(io, undo.retiredPath);
  if (
    left.kind === "failed" ||
    left.text !== undo.expectedMergedLeftText ||
    fingerprintContent(left.text) !== undo.expectedMergedLeftFingerprint
  ) {
    return failed("Undo is no longer safe because the merged scene changed.");
  }
  if (
    retired.kind === "failed" ||
    retired.text !== undo.restoredRightText ||
    fingerprintContent(retired.text) !== undo.restoredRightFingerprint
  ) {
    return failed("Undo is no longer safe because the retired scene source changed.");
  }
  if (await safelyExists(io, undo.rightPath)) {
    return failed("Undo is no longer safe because the original right-scene path is occupied.");
  }

  let outcome: SceneMergeTransactionOutcome;
  try {
    outcome = await io.undoAtomic({
      leftRelative: undo.leftPath,
      rightRelative: undo.rightPath,
      retiredRelative: undo.retiredPath,
      expectedMergedLeftText: undo.expectedMergedLeftText,
      restoredLeftText: undo.restoredLeftText,
      restoredRightText: undo.restoredRightText,
      insertedBoundary: undo.insertedBoundary,
      expectedStructureText: undo.expectedStructureText,
      restoredStructureText: undo.restoredStructureText,
    });
  } catch (cause) {
    return failed(`The scene-merge Undo was not confirmed: ${formatError(cause)}`);
  }

  const restored = await safelyReload(io);
  const restoredLeft = await safelyReadSource(io, undo.leftPath);
  const restoredRight = await safelyReadSource(io, undo.rightPath);
  if (
    restored.kind !== "ready" ||
    restoredLeft.kind === "failed" ||
    restoredRight.kind === "failed" ||
    restored.project.text !== undo.restoredStructureText ||
    restored.project.fingerprint !== undo.restoredStructureFingerprint ||
    restoredLeft.text !== undo.restoredLeftText ||
    fingerprintContent(restoredLeft.text) !== undo.restoredLeftFingerprint ||
    restoredRight.text !== undo.restoredRightText ||
    fingerprintContent(restoredRight.text) !== undo.restoredRightFingerprint ||
    await safelyExists(io, undo.retiredPath)
  ) {
    return failed("Undo completed, but the exact reread did not match and needs review.");
  }
  return { kind: "success", project: restored.project, cleanupWarnings: outcome.cleanupWarnings };
}

async function verifyAppliedMerge(
  plan: Extract<ManuscriptSceneMergePlan, { kind: "ready" }>,
  io: ManuscriptSceneMergeIo,
): Promise<
  | { kind: "ready"; project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }> }
  | { kind: "failed"; message: string }
> {
  const reloaded = await safelyReload(io);
  const left = await safelyReadSource(io, plan.target.leftSourcePath);
  const retired = await safelyReadSource(io, plan.target.retiredSourcePath);
  if (
    reloaded.kind !== "ready" ||
    left.kind === "failed" ||
    retired.kind === "failed" ||
    reloaded.project.text !== plan.updatedStructureText ||
    reloaded.project.fingerprint !== plan.updatedStructureFingerprint ||
    left.text !== plan.mergedSourceText ||
    fingerprintContent(left.text) !== plan.mergedSourceFingerprint ||
    retired.text !== plan.originalRightSourceText ||
    fingerprintContent(retired.text) !== plan.target.rightSourceFingerprint ||
    await safelyExists(io, plan.target.rightSourcePath)
  ) {
    return failed("The merge completed, but the exact reread did not match and needs review.");
  }
  return reloaded;
}

function samePlan(
  refreshed: ManuscriptSceneMergePlan,
  approved: Extract<ManuscriptSceneMergePlan, { kind: "ready" }>,
): refreshed is Extract<ManuscriptSceneMergePlan, { kind: "ready" }> {
  return refreshed.kind === "ready" &&
    refreshed.updatedStructureText === approved.updatedStructureText &&
    refreshed.mergedSourceText === approved.mergedSourceText &&
    refreshed.target.leftSceneId === approved.target.leftSceneId &&
    refreshed.target.rightSceneId === approved.target.rightSceneId &&
    refreshed.target.arrayJsonPath === approved.target.arrayJsonPath &&
    refreshed.target.retiredSourcePath === approved.target.retiredSourcePath &&
    refreshed.target.insertedBoundary === approved.target.insertedBoundary;
}

async function safelyReload(
  io: ManuscriptSceneMergeIo,
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
  io: ManuscriptSceneMergeIo,
  relativePath: string,
): Promise<{ kind: "ready"; text: string } | { kind: "failed"; message: string }> {
  try {
    return { kind: "ready", text: await io.readSource(relativePath) };
  } catch (cause) {
    return failed(`The scene source could not be read: ${formatError(cause)}`);
  }
}

async function safelyExists(io: ManuscriptSceneMergeIo, relativePath: string): Promise<boolean> {
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
