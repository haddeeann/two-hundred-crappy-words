import type { FileTreeEntry } from "$lib/editor/file-tree";
import {
  WORLD_PROJECT_FOLDER_ROLES,
  type WorldProjectFolders,
} from "./manifest";

export interface StructuredNoteDestination {
  relativePath: string;
  label: string;
}

export async function discoverStructuredNoteDestinations({
  entries,
  folders,
  rootLabel,
  isUsableDirectory,
}: {
  entries: readonly FileTreeEntry[];
  folders: WorldProjectFolders;
  rootLabel: string;
  isUsableDirectory: (relativePath: string) => Promise<boolean>;
}): Promise<StructuredNoteDestination[]> {
  const destinations: StructuredNoteDestination[] = [
    { relativePath: "", label: `${rootLabel} (project root)` },
  ];
  const seen = new Set([""]);

  for (const role of WORLD_PROJECT_FOLDER_ROLES) {
    const relativePath = folders[role];
    if (
      !relativePath ||
      seen.has(relativePath) ||
      !(await isUsableDirectory(relativePath))
    ) {
      continue;
    }
    seen.add(relativePath);
    destinations.push({
      relativePath,
      label: `${formatRole(role)} · ${relativePath}`,
    });
  }

  for (const entry of entries) {
    if (
      !entry.isDirectory ||
      entry.isSymlink ||
      seen.has(entry.name)
    ) {
      continue;
    }
    seen.add(entry.name);
    destinations.push({ relativePath: entry.name, label: entry.name });
  }

  return destinations;
}

function formatRole(role: string): string {
  return `${role[0]?.toUpperCase() ?? ""}${role.slice(1)}`;
}
