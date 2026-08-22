import { guardedWriteText } from "$lib/editor/guarded-write";
import type { LoreRenameFileEdit, LoreRenamePlan } from "./rename";

export interface LoreRenameIo {
  readText: (relativePath: string) => Promise<string>;
  writeText: (relativePath: string, text: string) => Promise<void>;
  renameNoClobber: (sourcePath: string, targetPath: string) => Promise<void>;
}

export type LoreRenameExecutionResult =
  | { kind: "success" }
  | {
      kind: "failed";
      message: string;
      rollbackComplete: boolean;
    };

export async function executeLoreRename(
  plan: Extract<LoreRenamePlan, { kind: "ready" }>,
  io: LoreRenameIo,
): Promise<LoreRenameExecutionResult> {
  const expectedByPath = new Map<string, string>([
    [plan.sourcePath, plan.sourceText],
    ...plan.fileEdits.map(({ path, originalText }) => [path, originalText] as const),
  ]);
  for (const [path, expected] of expectedByPath) {
    let current: string;
    try {
      current = await io.readText(path);
    } catch (cause) {
      return failed(`The rename stopped before writing because ${path} could not be read: ${formatError(cause)}`);
    }
    if (current !== expected) {
      return failed(`The rename stopped before writing because ${path} changed after the preview.`);
    }
  }

  const written: LoreRenameFileEdit[] = [];
  for (const edit of plan.fileEdits) {
    try {
      await guardedWriteText(
        {
          path: edit.path,
          content: edit.updatedText,
          expectedContent: edit.originalText,
        },
        {
          read: io.readText,
          write: io.writeText,
        },
      );
      written.push(edit);
    } catch (cause) {
      const rollback = await rollbackEdits(written, io);
      return {
        kind: "failed",
        message: rollback.complete
          ? `Link updates stopped at ${edit.path}; completed edits were rolled back: ${formatError(cause)}`
          : `Link updates stopped at ${edit.path}, and rollback needs review: ${formatError(cause)} ${rollback.message}`,
        rollbackComplete: rollback.complete,
      };
    }
  }

  try {
    await io.renameNoClobber(plan.sourcePath, plan.targetPath);
  } catch (cause) {
    const rollback = await rollbackEdits(written, io);
    return {
      kind: "failed",
      message: rollback.complete
        ? `The note was not moved; previewed link edits were rolled back: ${formatError(cause)}`
        : `The note move failed, and link rollback needs review: ${formatError(cause)} ${rollback.message}`,
      rollbackComplete: rollback.complete,
    };
  }
  return { kind: "success" };
}

export function mapOffsetThroughLoreRename(
  offset: number,
  edit: LoreRenameFileEdit | undefined,
): number {
  if (!edit) return offset;
  let mapped = offset;
  for (const replacement of edit.replacements) {
    const delta = replacement.after.length - replacement.before.length;
    if (offset <= replacement.range.start) continue;
    if (offset >= replacement.range.end) {
      mapped += delta;
    } else {
      mapped += replacement.after.length - (offset - replacement.range.start);
    }
  }
  return Math.max(0, mapped);
}

async function rollbackEdits(
  edits: readonly LoreRenameFileEdit[],
  io: LoreRenameIo,
): Promise<{ complete: boolean; message: string }> {
  const failures: string[] = [];
  for (const edit of [...edits].reverse()) {
    try {
      await guardedWriteText(
        {
          path: edit.path,
          content: edit.originalText,
          expectedContent: edit.updatedText,
        },
        {
          read: io.readText,
          write: io.writeText,
        },
      );
    } catch (cause) {
      failures.push(`${edit.path}: ${formatError(cause)}`);
    }
  }
  return {
    complete: failures.length === 0,
    message: failures.length === 0 ? "" : `Rollback failures: ${failures.join("; ")}`,
  };
}

function failed(message: string): LoreRenameExecutionResult {
  return { kind: "failed", message, rollbackComplete: true };
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
