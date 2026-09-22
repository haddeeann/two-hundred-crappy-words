import {
  ExternalFileChangeError,
  SourceFileUnavailableError,
  guardedWriteText,
} from "$lib/editor/guarded-write";
import {
  planContinuityMutation,
  type ContinuityMutationPlan,
  type ContinuityMutationRequest,
} from "./continuity-mutation";

export interface ContinuityMutationIo {
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
}

export interface ContinuityMutationUndo {
  path: string;
  noteId: string;
  factId: string | null;
  originalText: string;
  updatedText: string;
  label: string;
}

export type ContinuityExecutionResult =
  | { kind: "applied"; plan: ContinuityMutationPlan; undo: ContinuityMutationUndo }
  | { kind: "failed"; message: string };

export async function executeContinuityMutation(
  path: string,
  frozenPlan: ContinuityMutationPlan,
  request: ContinuityMutationRequest,
  io: ContinuityMutationIo,
): Promise<ContinuityExecutionResult> {
  let currentText: string;
  try {
    currentText = await io.read(path);
  } catch {
    return failed("The note can no longer be read. Nothing was written.");
  }
  if (currentText !== frozenPlan.originalText) {
    return failed("The note changed after this preview. Review a fresh preview before writing.");
  }

  const freshPlan = planContinuityMutation(currentText, request);
  if (freshPlan.kind === "unavailable") {
    return failed(`The fresh continuity plan is unavailable: ${freshPlan.reason}`);
  }
  if (!equivalentPlan(frozenPlan, freshPlan)) {
    return failed("The fresh continuity plan no longer matches the reviewed preview. Nothing was written.");
  }

  try {
    await guardedWriteText(
      {
        path,
        content: freshPlan.updatedText,
        expectedContent: freshPlan.originalText,
      },
      io,
    );
  } catch (cause) {
    return failed(writeFailureMessage(cause));
  }

  return {
    kind: "applied",
    plan: freshPlan,
    undo: {
      path,
      noteId: freshPlan.noteId,
      factId: freshPlan.factId,
      originalText: freshPlan.originalText,
      updatedText: freshPlan.updatedText,
      label: `Undo ${freshPlan.summary.replace(/\.$/u, "").toLocaleLowerCase()}`,
    },
  };
}

export async function undoContinuityMutation(
  undo: ContinuityMutationUndo,
  io: ContinuityMutationIo,
): Promise<{ kind: "undone" } | { kind: "failed"; message: string }> {
  try {
    await guardedWriteText(
      {
        path: undo.path,
        content: undo.originalText,
        expectedContent: undo.updatedText,
      },
      io,
    );
    return { kind: "undone" };
  } catch (cause) {
    return failed(
      cause instanceof ExternalFileChangeError
        ? "The note changed after the continuity edit, so Undo will not overwrite it."
        : cause instanceof SourceFileUnavailableError
          ? "The edited note can no longer be read, so Undo is unavailable."
          : `Undo could not write the note: ${formatCause(cause)}`,
    );
  }
}

function equivalentPlan(
  frozen: ContinuityMutationPlan,
  fresh: ContinuityMutationPlan,
): boolean {
  return frozen.operation === fresh.operation &&
    frozen.noteId === fresh.noteId &&
    frozen.factId === fresh.factId &&
    frozen.originalFingerprint === fresh.originalFingerprint &&
    frozen.updatedFingerprint === fresh.updatedFingerprint &&
    frozen.originalText === fresh.originalText &&
    frozen.updatedText === fresh.updatedText;
}

function writeFailureMessage(cause: unknown): string {
  if (cause instanceof ExternalFileChangeError) {
    return "The note changed while the continuity edit was being written. Nothing was overwritten.";
  }
  if (cause instanceof SourceFileUnavailableError) {
    return "The note became unavailable while the continuity edit was being written. Nothing was recreated.";
  }
  return `The continuity edit could not be written: ${formatCause(cause)}`;
}

function formatCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function failed(message: string): { kind: "failed"; message: string } {
  return { kind: "failed", message };
}
