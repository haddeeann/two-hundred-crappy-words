import type { FileTreeEntry } from "$lib/editor/file-tree";
import {
  createWorldProjectManifest,
  serializeWorldProjectManifest,
  WORLD_PROJECT_FOLDER_ROLES,
  WORLD_PROJECT_MANIFEST_FILE,
  type WorldProjectFolderRole,
  type WorldProjectManifest,
} from "./manifest";

export const SUGGESTED_WORLD_PROJECT_FOLDERS: Readonly<
  Record<WorldProjectFolderRole, string>
> = {
  manuscript: "Manuscript",
  characters: "Characters",
  locations: "Locations",
  factions: "Factions",
  species: "Species",
  technology: "Technology",
  timeline: "Timeline",
  research: "Research",
  inbox: "Inbox",
};

export interface AdoptionCollision {
  path: string;
  reason: "manifest-exists" | "not-a-directory" | "symbolic-link";
}

export type WorldProjectAdoptionPlan =
  | { kind: "blocked"; collisions: AdoptionCollision[] }
  | {
      kind: "ready";
      manifest: WorldProjectManifest;
      manifestText: string;
      directoriesToCreate: string[];
      reusedDirectories: string[];
    };

export type WorldProjectAdoptionResult =
  | {
      kind: "complete";
      createdDirectories: string[];
      reusedDirectories: string[];
    }
  | {
      kind: "partial";
      createdDirectories: string[];
      reusedDirectories: string[];
      failedAt: string;
      message: string;
    };

export function planWorldProjectAdoption({
  entries,
  projectId,
  name,
  selectedRoles,
}: {
  entries: readonly FileTreeEntry[];
  projectId: string;
  name: string;
  selectedRoles: readonly WorldProjectFolderRole[];
}): WorldProjectAdoptionPlan {
  const selected = new Set(selectedRoles);
  if (selected.size !== selectedRoles.length) {
    throw new RangeError("Each suggested folder role may be selected once.");
  }
  if (
    selectedRoles.some(
      (role) => !(WORLD_PROJECT_FOLDER_ROLES as readonly string[]).includes(role),
    )
  ) {
    throw new RangeError("The adoption plan contains an unknown folder role.");
  }

  const collisions: AdoptionCollision[] = [];
  if (findPortableEntry(entries, WORLD_PROJECT_MANIFEST_FILE)) {
    collisions.push({
      path: WORLD_PROJECT_MANIFEST_FILE,
      reason: "manifest-exists",
    });
  }

  const directoriesToCreate: string[] = [];
  const reusedDirectories: string[] = [];
  const folders: Partial<Record<WorldProjectFolderRole, string>> = {};
  for (const role of WORLD_PROJECT_FOLDER_ROLES) {
    if (!selected.has(role)) continue;
    const suggestedPath = SUGGESTED_WORLD_PROJECT_FOLDERS[role];
    const existing = findPortableEntry(entries, suggestedPath);
    if (!existing) {
      folders[role] = suggestedPath;
      directoriesToCreate.push(suggestedPath);
      continue;
    }

    folders[role] = existing.name;
    if (existing.isSymlink) {
      collisions.push({ path: existing.name, reason: "symbolic-link" });
    } else if (!existing.isDirectory) {
      collisions.push({ path: existing.name, reason: "not-a-directory" });
    } else {
      reusedDirectories.push(existing.name);
    }
  }

  if (collisions.length > 0) return { kind: "blocked", collisions };

  const manifest = createWorldProjectManifest({ projectId, name, folders });
  return {
    kind: "ready",
    manifest,
    manifestText: serializeWorldProjectManifest(manifest),
    directoriesToCreate,
    reusedDirectories,
  };
}

export async function executeWorldProjectAdoption(
  plan: Extract<WorldProjectAdoptionPlan, { kind: "ready" }>,
  operations: {
    createDirectory: (relativePath: string) => Promise<void>;
    createManifest: (text: string) => Promise<void>;
  },
): Promise<WorldProjectAdoptionResult> {
  const createdDirectories: string[] = [];
  for (const path of plan.directoriesToCreate) {
    try {
      await operations.createDirectory(path);
      createdDirectories.push(path);
    } catch (cause) {
      return {
        kind: "partial",
        createdDirectories,
        reusedDirectories: plan.reusedDirectories,
        failedAt: path,
        message: formatError(cause),
      };
    }
  }

  try {
    await operations.createManifest(plan.manifestText);
  } catch (cause) {
    return {
      kind: "partial",
      createdDirectories,
      reusedDirectories: plan.reusedDirectories,
      failedAt: WORLD_PROJECT_MANIFEST_FILE,
      message: formatError(cause),
    };
  }

  return {
    kind: "complete",
    createdDirectories,
    reusedDirectories: plan.reusedDirectories,
  };
}

function findPortableEntry(
  entries: readonly FileTreeEntry[],
  name: string,
): FileTreeEntry | undefined {
  return entries.find(
    (entry) => entry.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0,
  );
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
