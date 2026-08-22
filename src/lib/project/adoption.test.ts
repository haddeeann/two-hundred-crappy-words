import { describe, expect, it, vi } from "vitest";

import type { FileTreeEntry } from "$lib/editor/file-tree";
import {
  executeWorldProjectAdoption,
  planWorldProjectAdoption,
} from "./adoption";
import {
  WORLD_PROJECT_MANIFEST_FILE,
  type WorldProjectFolderRole,
} from "./manifest";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";

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

function plan(
  entries: FileTreeEntry[] = [],
  selectedRoles: WorldProjectFolderRole[] = ["manuscript", "characters"],
) {
  return planWorldProjectAdoption({
    entries,
    selectedRoles,
    projectId: PROJECT_ID,
    name: "Andromeda",
  });
}

describe("world project adoption planning", () => {
  it("plans every absent selected directory before the manifest", () => {
    expect(plan()).toMatchObject({
      kind: "ready",
      manifest: {
        name: "Andromeda",
        folders: {
          manuscript: "Manuscript",
          characters: "Characters",
        },
      },
      directoriesToCreate: ["Manuscript", "Characters"],
      reusedDirectories: [],
    });
  });

  it("reuses real directories and records their actual casing", () => {
    expect(plan([entry("characters")])).toMatchObject({
      kind: "ready",
      manifest: { folders: { characters: "characters" } },
      directoriesToCreate: ["Manuscript"],
      reusedDirectories: ["characters"],
    });
  });

  it.each([
    [
      entry(WORLD_PROJECT_MANIFEST_FILE, { isDirectory: false, isFile: true }),
      "manifest-exists",
    ],
    [entry("Characters", { isDirectory: false, isFile: true }), "not-a-directory"],
    [entry("Characters", { isSymlink: true }), "symbolic-link"],
  ] as const)("blocks all writes on a preflight collision", (existing, reason) => {
    expect(plan([existing])).toMatchObject({
      kind: "blocked",
      collisions: [expect.objectContaining({ reason })],
    });
  });

  it("treats case-only manifest collisions as existing paths", () => {
    expect(
      plan([
        entry(WORLD_PROJECT_MANIFEST_FILE.toUpperCase(), {
          isDirectory: false,
          isFile: true,
        }),
      ]),
    ).toMatchObject({
      kind: "blocked",
      collisions: [{ reason: "manifest-exists" }],
    });
  });

  it("allows an experienced writer to omit every suggested folder", () => {
    expect(plan([], [])).toMatchObject({
      kind: "ready",
      manifest: { folders: {} },
      directoriesToCreate: [],
    });
  });
});

describe("world project adoption execution", () => {
  it("creates planned directories in order and writes the manifest last", async () => {
    const ready = plan();
    if (ready.kind !== "ready") throw new Error("expected ready plan");
    const events: string[] = [];

    await expect(
      executeWorldProjectAdoption(ready, {
        createDirectory: async (path) => {
          events.push(`directory:${path}`);
        },
        createManifest: async () => {
          events.push("manifest");
        },
      }),
    ).resolves.toMatchObject({ kind: "complete" });
    expect(events).toEqual([
      "directory:Manuscript",
      "directory:Characters",
      "manifest",
    ]);
  });

  it("stops after a directory failure and reports exactly what was created", async () => {
    const ready = plan();
    if (ready.kind !== "ready") throw new Error("expected ready plan");
    const createManifest = vi.fn<() => Promise<void>>();

    const result = await executeWorldProjectAdoption(ready, {
      createDirectory: async (path) => {
        if (path === "Characters") throw new Error("permission denied");
      },
      createManifest,
    });

    expect(result).toEqual({
      kind: "partial",
      createdDirectories: ["Manuscript"],
      reusedDirectories: [],
      failedAt: "Characters",
      message: "permission denied",
    });
    expect(createManifest).not.toHaveBeenCalled();
  });

  it("reports a manifest race without removing newly created directories", async () => {
    const ready = plan([], ["manuscript"]);
    if (ready.kind !== "ready") throw new Error("expected ready plan");

    await expect(
      executeWorldProjectAdoption(ready, {
        createDirectory: async () => {},
        createManifest: async () => {
          throw new Error("already exists");
        },
      }),
    ).resolves.toEqual({
      kind: "partial",
      createdDirectories: ["Manuscript"],
      reusedDirectories: [],
      failedAt: WORLD_PROJECT_MANIFEST_FILE,
      message: "already exists",
    });
  });
});
