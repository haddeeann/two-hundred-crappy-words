import { describe, expect, it } from "vitest";
import {
  findTreeEntry,
  reconcileTreeEntries,
  sortTreeEntries,
  updateTreeEntry,
  validateFileName,
  type FileTreeEntry,
} from "./file-tree";

function entry(
  name: string,
  isDirectory = false,
  children: FileTreeEntry[] | null = null,
): FileTreeEntry {
  return {
    name,
    isDirectory,
    isFile: !isDirectory,
    isSymlink: false,
    path: `/world/${name}`,
    expanded: false,
    children,
  };
}

describe("file tree", () => {
  it("sorts directories first and names naturally", () => {
    const sorted = sortTreeEntries([
      entry("chapter10.md"),
      entry("Zulu", true),
      entry("chapter2.md"),
      entry("archive", true),
    ]);

    expect(sorted.map(({ name }) => name)).toEqual([
      "archive",
      "Zulu",
      "chapter2.md",
      "chapter10.md",
    ]);
  });

  it("preserves expansion and loaded children during refresh", () => {
    const previous = { ...entry("Lore", true, [entry("planet.md")]), expanded: true };
    const refreshed = reconcileTreeEntries([entry("Lore", true)], [previous]);

    expect(refreshed[0]).toMatchObject({ expanded: true });
    expect(refreshed[0]?.children?.[0]?.name).toBe("planet.md");
  });

  it("finds and immutably updates a nested directory", () => {
    const lore = entry("Lore", true, [entry("planet.md")]);
    const tree = [lore];
    const updated = updateTreeEntry(tree, lore.path, (current) => ({
      ...current,
      expanded: true,
    }));

    expect(updated).not.toBe(tree);
    expect(findTreeEntry(updated, lore.path)?.expanded).toBe(true);
  });

  it.each(["", ".", "..", "a/b", "a\\b", "bad:name", "trail.", "CON.txt"])(
    "rejects invalid or non-portable name %j",
    (name) => expect(validateFileName(name)).not.toBeNull(),
  );

  it("accepts ordinary text and Markdown names", () => {
    expect(validateFileName("Chapter 1.md")).toBeNull();
    expect(validateFileName("notes.txt")).toBeNull();
  });
});
