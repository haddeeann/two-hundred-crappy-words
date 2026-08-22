import { describe, expect, it, vi } from "vitest";

import type { FileTreeEntry } from "$lib/editor/file-tree";
import { inspectWorldProjectFolder } from "./folder-project";
import {
  WORLD_PROJECT_FORMAT,
  WORLD_PROJECT_MANIFEST_FILE,
} from "./manifest";

const FOLDER = "/world/andromeda";
const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";

function entry(
  name: string,
  overrides: Partial<FileTreeEntry> = {},
): FileTreeEntry {
  return {
    name,
    isDirectory: false,
    isFile: true,
    isSymlink: false,
    path: `${FOLDER}/${name}`,
    expanded: false,
    children: null,
    ...overrides,
  };
}

function manifest(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: WORLD_PROJECT_FORMAT,
    formatVersion: 1,
    projectId: PROJECT_ID,
    name: "Andromeda",
    folders: {},
    ...overrides,
  });
}

describe("world project folder inspection", () => {
  it("leaves a folder without a manifest ordinary and performs no read", async () => {
    const readText = vi.fn<(path: string) => Promise<string>>();

    await expect(
      inspectWorldProjectFolder({
        folderPath: FOLDER,
        entries: [entry("chapter.md")],
        readText,
      }),
    ).resolves.toEqual({ kind: "ordinary", storageKey: FOLDER });
    expect(readText).not.toHaveBeenCalled();
  });

  it("recognizes a valid manifest and returns its stable storage key", async () => {
    const result = await inspectWorldProjectFolder({
      folderPath: FOLDER,
      entries: [entry(WORLD_PROJECT_MANIFEST_FILE)],
      readText: async () => manifest(),
    });

    expect(result).toMatchObject({
      kind: "world-project",
      storageKey: `project:${PROJECT_ID}`,
      manifest: { projectId: PROJECT_ID, name: "Andromeda" },
    });
  });

  it.each([
    ["{", "malformed"],
    [manifest({ projectId: "bad" }), "invalid"],
    [manifest({ formatVersion: 2 }), "newer-version"],
  ] as const)("fails open for a problem manifest", async (text, problem) => {
    const result = await inspectWorldProjectFolder({
      folderPath: FOLDER,
      entries: [entry(WORLD_PROJECT_MANIFEST_FILE)],
      readText: async () => text,
    });

    expect(result).toMatchObject({
      kind: "manifest-problem",
      storageKey: FOLDER,
      problem,
    });
  });

  it("rejects a directory or symlink at the manifest path without reading", async () => {
    const readText = vi.fn<(path: string) => Promise<string>>();
    const result = await inspectWorldProjectFolder({
      folderPath: FOLDER,
      entries: [
        entry(WORLD_PROJECT_MANIFEST_FILE, {
          isFile: false,
          isDirectory: true,
          isSymlink: true,
        }),
      ],
      readText,
    });

    expect(result).toMatchObject({
      kind: "manifest-problem",
      storageKey: FOLDER,
      problem: "not-a-file",
    });
    expect(readText).not.toHaveBeenCalled();
  });

  it("keeps the folder ordinary when the manifest cannot be read", async () => {
    const result = await inspectWorldProjectFolder({
      folderPath: FOLDER,
      entries: [entry(WORLD_PROJECT_MANIFEST_FILE)],
      readText: async () => {
        throw new Error("permission denied");
      },
    });

    expect(result).toMatchObject({
      kind: "manifest-problem",
      storageKey: FOLDER,
      problem: "unreadable",
      message: expect.stringContaining("permission denied"),
    });
  });
});
