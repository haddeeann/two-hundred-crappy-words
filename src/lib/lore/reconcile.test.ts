import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "./index";
import {
  collapseLoreChangePaths,
  reconcileLoreChanges,
} from "./reconcile";
import type { LoreScanBackend, LoreScanEntry } from "./scan";

interface FakeNode {
  type: "file" | "directory" | "symlink";
  text?: string;
  revision?: string;
  error?: string;
}

function backend(nodes: Record<string, FakeNode>): LoreScanBackend {
  return {
    async readDirectory(path) {
      const node = nodes[path];
      if (node?.error) throw new Error(node.error);
      if (!node || node.type !== "directory") throw new Error("not a directory");
      return Object.entries(nodes)
        .filter(([candidate]) => candidate.startsWith(`${path}/`))
        .filter(([candidate]) => !candidate.slice(path.length + 1).includes("/"))
        .map(([candidate, child]): LoreScanEntry => ({
          name: candidate.slice(path.length + 1),
          isFile: child.type === "file",
          isDirectory: child.type === "directory",
          isSymlink: child.type === "symlink",
        }));
    },
    async readText(path) {
      const node = nodes[path];
      if (!node || node.error) throw new Error(node?.error ?? "missing");
      return node.text ?? "";
    },
    async inspectFile(path) {
      const node = nodes[path];
      if (!node || node.error) throw new Error(node?.error ?? "missing");
      const size = new TextEncoder().encode(node.text ?? "").byteLength;
      return { size, revision: node.revision ?? `r:${size}` };
    },
    async join(parent, child) {
      return `${parent}/${child}`;
    },
  };
}

describe("incremental lore reconciliation", () => {
  it("collapses duplicate and descendant watcher paths safely", () => {
    expect(
      collapseLoreChangePaths([
        "Lore/People/mara.md",
        "Lore",
        "Lore/People",
        "chapter.md",
        "chapter.md",
        "../outside",
      ]),
    ).toEqual(["Lore", "chapter.md"]);
    expect(collapseLoreChangePaths(["", "Lore/mara.md"])).toEqual([""]);
  });

  it("reconciles external create, edit, and removal as one safe batch", async () => {
    const currentIndex = buildLoreProjectIndex([
      { path: "chapter.md", text: "[[Mara]] [[New Moon]]" },
      { path: "Lore/mara.md", text: "# Mara" },
      { path: "removed.md", text: "# Removed" },
    ]);
    const nodes: Record<string, FakeNode> = {
      "/world": { type: "directory" },
      "/world/chapter.md": { type: "file", text: "[[Mara Prime]] [[New Moon]]" },
      "/world/Lore": { type: "directory" },
      "/world/Lore/mara.md": { type: "file", text: "# Mara Prime" },
      "/world/new.md": { type: "file", text: "# New Moon" },
    };

    const result = await reconcileLoreChanges({
      rootPath: "/world",
      relativePaths: ["chapter.md", "Lore/mara.md", "new.md", "removed.md"],
      currentIndex,
      backend: backend(nodes),
    });

    expect(result.stale).toBe(false);
    expect(Object.fromEntries(result.changes)).toEqual({
      "Lore/mara.md": "# Mara Prime",
      "chapter.md": "[[Mara Prime]] [[New Moon]]",
      "new.md": "# New Moon",
      "removed.md": null,
    });
  });

  it("rescans only a changed directory subtree and removes moved-away records", async () => {
    const currentIndex = buildLoreProjectIndex([
      { path: "Lore/old.md", text: "# Old" },
      { path: "Manuscript/chapter.md", text: "# Chapter" },
    ]);
    const nodes: Record<string, FakeNode> = {
      "/world": { type: "directory" },
      "/world/Lore": { type: "directory" },
      "/world/Lore/new.md": { type: "file", text: "# New" },
    };

    const result = await reconcileLoreChanges({
      rootPath: "/world",
      relativePaths: ["Lore"],
      currentIndex,
      backend: backend(nodes),
    });

    expect([...result.changes]).toEqual([
      ["Lore/old.md", null],
      ["Lore/new.md", "# New"],
    ]);
    expect(result.changes.has("Manuscript/chapter.md")).toBe(false);
  });

  it("removes newly excluded or symlinked records without following them", async () => {
    const currentIndex = buildLoreProjectIndex([
      { path: "Lore/mara.md", text: "# Mara" },
      { path: "Generated/result.md", text: "# Result" },
    ]);
    const nodes: Record<string, FakeNode> = {
      "/world": { type: "directory" },
      "/world/Lore": { type: "directory" },
      "/world/Lore/mara.md": { type: "symlink" },
      "/world/Generated": { type: "directory" },
    };

    const result = await reconcileLoreChanges({
      rootPath: "/world",
      relativePaths: ["Lore/mara.md", "Generated"],
      currentIndex,
      backend: backend(nodes),
      options: { generatedPaths: ["Generated"] },
    });

    expect([...result.changes]).toEqual([
      ["Generated/result.md", null],
      ["Lore/mara.md", null],
    ]);
    expect(result.issues.map(({ kind }) => kind).sort()).toEqual([
      "generated-path",
      "symbolic-link",
    ]);
  });

  it("keeps the known-good record and marks stale when a path is unreadable", async () => {
    const currentIndex = buildLoreProjectIndex([
      { path: "Lore/mara.md", text: "# Mara" },
    ]);
    const nodes: Record<string, FakeNode> = {
      "/world": { type: "directory" },
      "/world/Lore": { type: "directory", error: "permission denied" },
      "/world/Lore/mara.md": { type: "file", text: "# Changed" },
    };

    const result = await reconcileLoreChanges({
      rootPath: "/world",
      relativePaths: ["Lore/mara.md"],
      currentIndex,
      backend: backend(nodes),
    });

    expect(result).toMatchObject({ stale: true });
    expect(result.changes.size).toBe(0);
    expect(result.issues[0]?.kind).toBe("unreadable-directory");
  });

  it("refuses a batch that would exceed whole-project limits", async () => {
    const currentIndex = buildLoreProjectIndex([
      { path: "one.md", text: "# One" },
    ]);
    const nodes: Record<string, FakeNode> = {
      "/world": { type: "directory" },
      "/world/two.md": { type: "file", text: "# Two" },
    };
    const result = await reconcileLoreChanges({
      rootPath: "/world",
      relativePaths: ["two.md"],
      currentIndex,
      backend: backend(nodes),
      options: { maxFiles: 1 },
    });

    expect(result.stale).toBe(true);
    expect(result.changes.size).toBe(0);
    expect(result.issues.at(-1)?.kind).toBe("scan-limit");
  });
});
