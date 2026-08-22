import type { FileTreeEntry } from "$lib/editor/file-tree";
import { validateFolderName } from "$lib/editor/file-tree";
import {
  executeWorldProjectAdoption,
  planWorldProjectAdoption,
  type WorldProjectAdoptionResult,
} from "./adoption";
import type {
  WorldProjectFolderRole,
  WorldProjectManifest,
} from "./manifest";

export type NewWorldProjectPlan =
  | { kind: "blocked"; folderName: string }
  | {
      kind: "ready";
      folderName: string;
      manifest: WorldProjectManifest;
      manifestText: string;
      directoriesToCreate: string[];
    };

export type NewWorldProjectResult =
  | {
      kind: "complete";
      createdRoot: true;
      createdDirectories: string[];
    }
  | {
      kind: "partial";
      createdRoot: boolean;
      createdDirectories: string[];
      failedAt: string;
      message: string;
    };

export function planNewWorldProject({
  parentEntries,
  projectId,
  name,
  folderName,
  selectedRoles,
}: {
  parentEntries: readonly FileTreeEntry[];
  projectId: string;
  name: string;
  folderName: string;
  selectedRoles: readonly WorldProjectFolderRole[];
}): NewWorldProjectPlan {
  const normalizedFolderName = folderName.trim();
  const folderNameIssue = validateFolderName(normalizedFolderName);
  if (folderNameIssue) throw new RangeError(folderNameIssue);

  if (
    parentEntries.some(
      (entry) =>
        entry.name.localeCompare(normalizedFolderName, undefined, {
          sensitivity: "base",
        }) === 0,
    )
  ) {
    return { kind: "blocked", folderName: normalizedFolderName };
  }

  const adoption = planWorldProjectAdoption({
    entries: [],
    projectId,
    name,
    selectedRoles,
  });
  if (adoption.kind === "blocked") {
    throw new Error("An empty new project unexpectedly failed preflight.");
  }

  return {
    kind: "ready",
    folderName: normalizedFolderName,
    manifest: adoption.manifest,
    manifestText: adoption.manifestText,
    directoriesToCreate: adoption.directoriesToCreate,
  };
}

export async function executeNewWorldProject(
  plan: Extract<NewWorldProjectPlan, { kind: "ready" }>,
  operations: {
    createRoot: () => Promise<void>;
    createDirectory: (relativePath: string) => Promise<void>;
    createManifest: (text: string) => Promise<void>;
  },
): Promise<NewWorldProjectResult> {
  try {
    await operations.createRoot();
  } catch (cause) {
    return {
      kind: "partial",
      createdRoot: false,
      createdDirectories: [],
      failedAt: plan.folderName,
      message: formatError(cause),
    };
  }

  const result: WorldProjectAdoptionResult =
    await executeWorldProjectAdoption(
      {
        kind: "ready",
        manifest: plan.manifest,
        manifestText: plan.manifestText,
        directoriesToCreate: plan.directoriesToCreate,
        reusedDirectories: [],
      },
      {
        createDirectory: operations.createDirectory,
        createManifest: operations.createManifest,
      },
    );

  if (result.kind === "partial") {
    return {
      kind: "partial",
      createdRoot: true,
      createdDirectories: result.createdDirectories,
      failedAt: result.failedAt,
      message: result.message,
    };
  }

  return {
    kind: "complete",
    createdRoot: true,
    createdDirectories: result.createdDirectories,
  };
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
