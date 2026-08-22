import { describe, expect, it, vi } from "vitest";

import type { FileTreeEntry } from "$lib/editor/file-tree";
import {
  executeNewWorldProject,
  planNewWorldProject,
} from "./new-project";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";

function entry(name: string): FileTreeEntry {
  return {
    name,
    isDirectory: true,
    isFile: false,
    isSymlink: false,
    path: `/parent/${name}`,
    expanded: false,
    children: null,
  };
}

function plan(parentEntries: FileTreeEntry[] = []) {
  return planNewWorldProject({
    parentEntries,
    projectId: PROJECT_ID,
    name: "A Quiet Red Planet",
    folderName: "quiet-red-planet",
    selectedRoles: ["manuscript", "locations"],
  });
}

describe("new world project planning", () => {
  it("validates the root name and plans selected content", () => {
    expect(plan()).toMatchObject({
      kind: "ready",
      folderName: "quiet-red-planet",
      manifest: { name: "A Quiet Red Planet" },
      directoriesToCreate: ["Manuscript", "Locations"],
    });
  });

  it.each(["", "../world", "world.", "NUL"])(
    "rejects the non-portable folder name %j",
    (folderName) => {
      expect(() =>
        planNewWorldProject({
          parentEntries: [],
          projectId: PROJECT_ID,
          name: "World",
          folderName,
          selectedRoles: [],
        }),
      ).toThrow(RangeError);
    },
  );

  it("blocks a case-insensitive root collision before writing", () => {
    expect(plan([entry("Quiet-Red-Planet")])).toEqual({
      kind: "blocked",
      folderName: "quiet-red-planet",
    });
  });
});

describe("new world project execution", () => {
  it("creates the root, directories, and manifest in order", async () => {
    const ready = plan();
    if (ready.kind !== "ready") throw new Error("expected ready plan");
    const events: string[] = [];

    await expect(
      executeNewWorldProject(ready, {
        createRoot: async () => {
          events.push("root");
        },
        createDirectory: async (path) => {
          events.push(`directory:${path}`);
        },
        createManifest: async () => {
          events.push("manifest");
        },
      }),
    ).resolves.toMatchObject({ kind: "complete" });
    expect(events).toEqual([
      "root",
      "directory:Manuscript",
      "directory:Locations",
      "manifest",
    ]);
  });

  it("reports a root race without attempting child writes", async () => {
    const ready = plan();
    if (ready.kind !== "ready") throw new Error("expected ready plan");
    const createDirectory = vi.fn<() => Promise<void>>();
    const createManifest = vi.fn<() => Promise<void>>();

    await expect(
      executeNewWorldProject(ready, {
        createRoot: async () => {
          throw new Error("already exists");
        },
        createDirectory,
        createManifest,
      }),
    ).resolves.toEqual({
      kind: "partial",
      createdRoot: false,
      createdDirectories: [],
      failedAt: "quiet-red-planet",
      message: "already exists",
    });
    expect(createDirectory).not.toHaveBeenCalled();
    expect(createManifest).not.toHaveBeenCalled();
  });

  it("reports recoverable partial content after the root exists", async () => {
    const ready = plan();
    if (ready.kind !== "ready") throw new Error("expected ready plan");

    await expect(
      executeNewWorldProject(ready, {
        createRoot: async () => {},
        createDirectory: async (path) => {
          if (path === "Locations") throw new Error("permission denied");
        },
        createManifest: async () => {},
      }),
    ).resolves.toEqual({
      kind: "partial",
      createdRoot: true,
      createdDirectories: ["Manuscript"],
      failedAt: "Locations",
      message: "permission denied",
    });
  });
});
