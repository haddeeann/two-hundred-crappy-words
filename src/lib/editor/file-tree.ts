export interface FileTreeEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  path: string;
  expanded: boolean;
  children: FileTreeEntry[] | null;
}

const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function sortTreeEntries<T extends Pick<FileTreeEntry, "name" | "isDirectory">>(
  entries: readonly T[],
): T[] {
  return [...entries].sort((first, second) => {
    if (first.isDirectory !== second.isDirectory) {
      return first.isDirectory ? -1 : 1;
    }

    return (
      nameCollator.compare(first.name, second.name) ||
      first.name.localeCompare(second.name)
    );
  });
}

export function reconcileTreeEntries(
  discovered: readonly FileTreeEntry[],
  existing: readonly FileTreeEntry[] = [],
): FileTreeEntry[] {
  const existingByPath = new Map(existing.map((entry) => [entry.path, entry]));
  return sortTreeEntries(
    discovered.map((entry) => {
      const previous = existingByPath.get(entry.path);
      if (!previous || previous.isDirectory !== entry.isDirectory) return entry;
      return {
        ...entry,
        expanded: previous.expanded,
        children: previous.children,
      };
    }),
  );
}

export function findTreeEntry(
  entries: readonly FileTreeEntry[],
  path: string,
): FileTreeEntry | null {
  for (const entry of entries) {
    if (entry.path === path) return entry;
    if (entry.children) {
      const child = findTreeEntry(entry.children, path);
      if (child) return child;
    }
  }
  return null;
}

export function updateTreeEntry(
  entries: readonly FileTreeEntry[],
  path: string,
  update: (entry: FileTreeEntry) => FileTreeEntry,
): FileTreeEntry[] {
  let changed = false;
  const updated = entries.map((entry) => {
    if (entry.path === path) {
      changed = true;
      return update(entry);
    }
    if (!entry.children) return entry;

    const children = updateTreeEntry(entry.children, path, update);
    if (children === entry.children) return entry;
    changed = true;
    return { ...entry, children };
  });
  return changed ? updated : (entries as FileTreeEntry[]);
}

export function validateFileName(name: string): string | null {
  return validatePortableEntryName(name, "file");
}

export function validateFolderName(name: string): string | null {
  return validatePortableEntryName(name, "folder");
}

function validatePortableEntryName(
  name: string,
  kind: "file" | "folder",
): string | null {
  if (!name) return `Enter a ${kind} name.`;
  if (name === "." || name === "..") {
    return `Choose a regular ${kind} name.`;
  }
  if (/[\\/]/.test(name)) return "Enter a name, not a folder path.";
  if (/[\0-\x1f<>:\"|?*]/.test(name)) {
    return "The name contains a character that is not portable across systems.";
  }
  if (/[ .]$/.test(name)) {
    return `A ${kind} name cannot end with a space or period.`;
  }

  const baseName = name.split(".")[0]?.toUpperCase();
  if (
    baseName &&
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(baseName)
  ) {
    return "That name is reserved by the operating system.";
  }
  return null;
}
