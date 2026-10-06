import type { FileTreeEntry } from "$lib/editor/file-tree";

export const DAILY_DRAFT_DIRECTORY = "Daily";

export type DailyDraftPlan =
  | {
      kind: "ready";
      dateKey: string;
      directoryName: typeof DAILY_DRAFT_DIRECTORY;
      fileName: string;
      relativePath: string;
      directoryExists: boolean;
      knownFile: "present" | "absent" | "unknown";
    }
  | { kind: "unavailable"; reason: string };

export function planDailyDraft(
  rootEntries: readonly FileTreeEntry[],
  dateKey: string,
): DailyDraftPlan {
  if (!isLocalDateKey(dateKey)) {
    return { kind: "unavailable", reason: "The current local date is invalid." };
  }

  const fileName = `${dateKey}.md`;
  const relativePath = `${DAILY_DRAFT_DIRECTORY}/${fileName}`;
  const directory = rootEntries.find(
    ({ name }) => name === DAILY_DRAFT_DIRECTORY,
  );
  if (!directory) {
    return {
      kind: "ready",
      dateKey,
      directoryName: DAILY_DRAFT_DIRECTORY,
      fileName,
      relativePath,
      directoryExists: false,
      knownFile: "absent",
    };
  }
  if (directory.isSymlink) {
    return {
      kind: "unavailable",
      reason: "Daily is a symbolic link. Choose a regular project folder for daily drafts.",
    };
  }
  if (!directory.isDirectory) {
    return {
      kind: "unavailable",
      reason: "A file named Daily already exists at the project root.",
    };
  }
  if (directory.children === null) {
    return {
      kind: "ready",
      dateKey,
      directoryName: DAILY_DRAFT_DIRECTORY,
      fileName,
      relativePath,
      directoryExists: true,
      knownFile: "unknown",
    };
  }

  const file = directory.children.find(({ name }) => name === fileName);
  if (file?.isSymlink) {
    return {
      kind: "unavailable",
      reason: `${relativePath} is a symbolic link and cannot be used as today's draft.`,
    };
  }
  if (file?.isDirectory) {
    return {
      kind: "unavailable",
      reason: `A folder named ${fileName} already exists in Daily.`,
    };
  }

  return {
    kind: "ready",
    dateKey,
    directoryName: DAILY_DRAFT_DIRECTORY,
    fileName,
    relativePath,
    directoryExists: true,
    knownFile: file ? "present" : "absent",
  };
}

function isLocalDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(year, month - 1, day, 12);
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  );
}
