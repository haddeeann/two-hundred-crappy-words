import { fingerprintContent } from "$lib/editor/recovery";
import {
  createStructuredNote,
  type StructuredNoteType,
} from "$lib/project/structured-note";

export const MAX_REMEMBER_SELECTION_LENGTH = 2_000;
export const MAX_REMEMBER_SUMMARY_LENGTH = 2_000;
export const MAX_REMEMBER_CONSISTENCY_LENGTH = 1_000;

export interface RememberSelectionSnapshot {
  sourcePath: string;
  sourceFingerprint: string;
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
}

export type RememberSelectionCapture =
  | { kind: "ready"; snapshot: RememberSelectionSnapshot }
  | { kind: "refused"; reason: string };

export function captureRememberSelection({
  sourcePath,
  content,
  selectionStart,
  selectionEnd,
}: {
  sourcePath: string;
  content: string;
  selectionStart: number;
  selectionEnd: number;
}): RememberSelectionCapture {
  if (!sourcePath) {
    return { kind: "refused", reason: "Open a project file before remembering a detail." };
  }
  if (
    !Number.isInteger(selectionStart) ||
    !Number.isInteger(selectionEnd) ||
    selectionStart < 0 ||
    selectionEnd <= selectionStart ||
    selectionEnd > content.length
  ) {
    return { kind: "refused", reason: "Select the exact words you want to remember." };
  }

  const selectedText = content.slice(selectionStart, selectionEnd);
  if (!selectedText.trim()) {
    return { kind: "refused", reason: "The selected words cannot be blank." };
  }
  if (selectedText.length > MAX_REMEMBER_SELECTION_LENGTH) {
    return {
      kind: "refused",
      reason: `Select no more than ${MAX_REMEMBER_SELECTION_LENGTH.toLocaleString()} characters at a time.`,
    };
  }

  return {
    kind: "ready",
    snapshot: {
      sourcePath,
      sourceFingerprint: fingerprintContent(content),
      selectionStart,
      selectionEnd,
      selectedText,
    },
  };
}

export function validateRememberSelectionSnapshot(
  snapshot: RememberSelectionSnapshot,
  current: { sourcePath: string; content: string },
): string | null {
  if (current.sourcePath !== snapshot.sourcePath) {
    return "The source file changed. Nothing was written; select the words again.";
  }
  if (fingerprintContent(current.content) !== snapshot.sourceFingerprint) {
    return "The source text changed. Nothing was written; review and select the words again.";
  }
  if (
    current.content.slice(snapshot.selectionStart, snapshot.selectionEnd) !==
    snapshot.selectedText
  ) {
    return "The selected words changed. Nothing was written; select them again.";
  }
  return null;
}

export function createRememberedStructuredNote({
  id,
  type,
  title,
  summary,
  consistency,
}: {
  id: string;
  type: StructuredNoteType;
  title: string;
  summary: string;
  consistency: string;
}): string {
  if (summary.length > MAX_REMEMBER_SUMMARY_LENGTH) {
    throw new RangeError(`Summary must be ${MAX_REMEMBER_SUMMARY_LENGTH.toLocaleString()} characters or fewer.`);
  }
  if (consistency.length > MAX_REMEMBER_CONSISTENCY_LENGTH) {
    throw new RangeError(
      `Consistency note must be ${MAX_REMEMBER_CONSISTENCY_LENGTH.toLocaleString()} characters or fewer.`,
    );
  }

  const trimmedSummary = summary.trim();
  const trimmedConsistency = consistency.trim();
  const sectionContent: Record<string, string> = {};
  if (trimmedSummary) sectionContent.Summary = trimmedSummary;
  if (trimmedConsistency) {
    sectionContent.Notes = `### Keep consistent\n\n${trimmedConsistency}`;
  }

  return createStructuredNote({ id, type, title, sectionContent });
}
