import { describe, expect, it, vi } from "vitest";

import type { FileTreeEntry } from "$lib/editor/file-tree";
import { discoverStructuredNoteDestinations } from "./note-destination";

function entry(
  name: string,
  overrides: Partial<FileTreeEntry> = {},
): FileTreeEntry {
  return {
    name,
    isDirectory: true,
    isFile: false,
    isSymlink: false,
    path: `/world/${name}`,
    expanded: false,
    children: null,
    ...overrides,
  };
}

describe("structured note destinations", () => {
  it("lists the root, usable semantic paths, and other real top-level folders", async () => {
    const isUsableDirectory = vi.fn(async (path: string) => path !== "Missing");

    await expect(
      discoverStructuredNoteDestinations({
        entries: [
          entry("Characters"),
          entry("Scratch"),
          entry("Shortcut", { isSymlink: true }),
          entry("not-a-folder.txt", { isDirectory: false, isFile: true }),
        ],
        folders: {
          manuscript: "Missing",
          characters: "Characters",
          locations: "Lore/Places",
        },
        rootLabel: "Andromeda",
        isUsableDirectory,
      }),
    ).resolves.toEqual([
      { relativePath: "", label: "Andromeda (project root)" },
      { relativePath: "Characters", label: "Characters · Characters" },
      { relativePath: "Lore/Places", label: "Locations · Lore/Places" },
      { relativePath: "Scratch", label: "Scratch" },
    ]);
    expect(isUsableDirectory).toHaveBeenCalledWith("Missing");
  });

  it("deduplicates two roles and a top-level entry that share a path", async () => {
    await expect(
      discoverStructuredNoteDestinations({
        entries: [entry("Lore")],
        folders: { characters: "Lore", locations: "Lore" },
        rootLabel: "World",
        isUsableDirectory: async () => true,
      }),
    ).resolves.toEqual([
      { relativePath: "", label: "World (project root)" },
      { relativePath: "Lore", label: "Characters · Lore" },
    ]);
  });
});
