import {
  findTreeEntry,
  updateTreeEntry,
  type FileTreeEntry,
} from "$lib/editor/file-tree";
import {
  isSafeProjectRelativePath,
  projectRelativePath,
  type ProjectNavigationState,
} from "./workspace";

export interface NavigationRestoreDependencies {
  joinPath(rootPath: string, ...segments: string[]): Promise<string>;
  readEntries(
    path: string,
    previous?: readonly FileTreeEntry[],
  ): Promise<FileTreeEntry[]>;
}

export interface RestoredProjectNavigation {
  entries: FileTreeEntry[];
  selectedDirectoryPath: string;
  activeFileEntry: FileTreeEntry | null;
}

export function collectExpandedProjectDirectories(
  entries: readonly FileTreeEntry[],
  rootPath: string,
): string[] {
  const collected: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory || entry.isSymlink) continue;
    if (entry.expanded) {
      const relative = projectRelativePath(rootPath, entry.path);
      if (relative) collected.push(relative);
    }
    if (entry.children) {
      collected.push(...collectExpandedProjectDirectories(entry.children, rootPath));
    }
  }
  return collected;
}

export async function restoreProjectNavigation(
  rootPath: string,
  initialEntries: readonly FileTreeEntry[],
  state: ProjectNavigationState | null,
  dependencies: NavigationRestoreDependencies,
): Promise<RestoredProjectNavigation> {
  if (!state) {
    return {
      entries: [...initialEntries],
      selectedDirectoryPath: rootPath,
      activeFileEntry: null,
    };
  }

  let entries = [...initialEntries];
  for (const relativePath of state.expandedDirectories) {
    const path = await containedPath(rootPath, relativePath, dependencies.joinPath);
    if (!path) continue;
    const directory = findTreeEntry(entries, path);
    if (!directory?.isDirectory || directory.isSymlink) continue;
    try {
      const children = await dependencies.readEntries(
        path,
        directory.children ?? [],
      );
      entries = updateTreeEntry(entries, path, (entry) => ({
        ...entry,
        expanded: true,
        children,
      }));
    } catch {
      // A missing or unreadable branch should not prevent the project opening.
    }
  }

  let selectedDirectoryPath = rootPath;
  if (state.selectedDirectory) {
    const selectedPath = await containedPath(
      rootPath,
      state.selectedDirectory,
      dependencies.joinPath,
    );
    const selectedEntry = selectedPath
      ? findTreeEntry(entries, selectedPath)
      : null;
    if (selectedEntry?.isDirectory && !selectedEntry.isSymlink) {
      selectedDirectoryPath = selectedEntry.path;
    }
  }

  let activeFileEntry: FileTreeEntry | null = null;
  if (state.activeFile) {
    const filePath = await containedPath(
      rootPath,
      state.activeFile,
      dependencies.joinPath,
    );
    const candidate = filePath ? findTreeEntry(entries, filePath) : null;
    if (candidate?.isFile && !candidate.isSymlink) activeFileEntry = candidate;
  }

  return { entries, selectedDirectoryPath, activeFileEntry };
}

async function containedPath(
  rootPath: string,
  relativePath: string,
  joinPath: NavigationRestoreDependencies["joinPath"],
): Promise<string | null> {
  if (!isSafeProjectRelativePath(relativePath, false)) return null;
  const path = await joinPath(rootPath, ...relativePath.split("/"));
  return projectRelativePath(rootPath, path) === relativePath ? path : null;
}
