import { describe, expect, it, vi } from "vitest";

import { type FileTreeEntry } from "$lib/editor/file-tree";
import {
  collectExpandedProjectDirectories,
  restoreProjectNavigation,
} from "./navigation-restore";
import { createProjectNavigationState } from "./workspace";

function entry(
  path: string,
  kind: "directory" | "file" = "file",
  children: FileTreeEntry[] | null = null,
  expanded = false,
  isSymlink = false,
): FileTreeEntry {
  return {
    name: path.split("/").at(-1) ?? path,
    path,
    isDirectory: kind === "directory",
    isFile: kind === "file",
    isSymlink,
    expanded,
    children,
  };
}

const state = createProjectNavigationState({
  projectKey: "project:one",
  selectedDirectory: "Lore/Planets",
  activeFile: "Lore/Planets/mars.md",
  expandedDirectories: ["Lore", "Lore/Planets"],
  now: new Date("2026-08-22T12:00:00.000Z"),
});

const joinPath = async (root: string, ...segments: string[]) =>
  [root.replace(/\/$/, ""), ...segments].join("/");

describe("project navigation restoration", () => {
  it("loads parent-first branches and restores an existing directory and file", async () => {
    const readEntries = vi.fn(async (path: string) => {
      if (path === "/world/Lore") {
        return [entry("/world/Lore/Planets", "directory")];
      }
      if (path === "/world/Lore/Planets") {
        return [entry("/world/Lore/Planets/mars.md")];
      }
      return [];
    });

    const restored = await restoreProjectNavigation(
      "/world",
      [entry("/world/Lore", "directory")],
      state,
      { joinPath, readEntries },
    );

    expect(readEntries.mock.calls.map(([path]) => path)).toEqual([
      "/world/Lore",
      "/world/Lore/Planets",
    ]);
    expect(restored.selectedDirectoryPath).toBe("/world/Lore/Planets");
    expect(restored.activeFileEntry?.path).toBe(
      "/world/Lore/Planets/mars.md",
    );
    expect(collectExpandedProjectDirectories(restored.entries, "/world")).toEqual([
      "Lore",
      "Lore/Planets",
    ]);
  });

  it("falls back safely when remembered paths disappeared or became symlinks", async () => {
    const restored = await restoreProjectNavigation(
      "/moved-world",
      [entry("/moved-world/Lore", "directory", null, false, true)],
      state,
      { joinPath, readEntries: vi.fn() },
    );

    expect(restored.entries[0]?.expanded).toBe(false);
    expect(restored.selectedDirectoryPath).toBe("/moved-world");
    expect(restored.activeFileEntry).toBeNull();
  });

  it("does not let a joining implementation escape the opened root", async () => {
    const restored = await restoreProjectNavigation(
      "/world",
      [entry("/world/Lore", "directory")],
      state,
      {
        joinPath: async () => "/outside/Lore",
        readEntries: vi.fn(),
      },
    );

    expect(restored.selectedDirectoryPath).toBe("/world");
    expect(restored.activeFileEntry).toBeNull();
  });
});
