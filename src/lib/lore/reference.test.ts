import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "./index";
import {
  loadLoreReferenceSource,
  LoreReferenceRequestCoordinator,
} from "./reference";
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
      return {
        size: new TextEncoder().encode(node.text ?? "").byteLength,
        revision: node.revision ?? "stable",
      };
    },
    async join(parent, child) {
      return `${parent}/${child}`;
    },
  };
}

describe("verified lore reference loading", () => {
  it("returns a stable contained source and its current derived title", async () => {
    const index = buildLoreProjectIndex([
      { path: "Lore/mara.md", text: "# Mara before" },
    ]);
    const result = await loadLoreReferenceSource({
      rootPath: "/world",
      relativePath: "Lore/mara.md",
      currentIndex: index,
      backend: backend({
        "/world": { type: "directory" },
        "/world/Lore": { type: "directory" },
        "/world/Lore/mara.md": { type: "file", text: "# Mara now\n\nVerified." },
      }),
    });

    expect(result).toMatchObject({
      kind: "ready",
      path: "Lore/mara.md",
      title: "Mara now",
      text: "# Mara now\n\nVerified.",
    });
    expect(result.changes.get("Lore/mara.md")).toBe("# Mara now\n\nVerified.");
  });

  it("refuses missing, symlinked, oversized, and unreadable sources", async () => {
    const index = buildLoreProjectIndex([
      { path: "missing.md", text: "# Missing" },
      { path: "linked.md", text: "# Linked" },
      { path: "large.md", text: "# Large" },
      { path: "private/note.md", text: "# Private" },
    ]);
    const nodes: Record<string, FakeNode> = {
      "/world": { type: "directory" },
      "/world/linked.md": { type: "symlink" },
      "/world/large.md": { type: "file", text: "too large" },
      "/world/private": { type: "directory", error: "permission denied" },
      "/world/private/note.md": { type: "file", text: "# Private" },
    };

    await expect(loadLoreReferenceSource({
      rootPath: "/world",
      relativePath: "missing.md",
      currentIndex: index,
      backend: backend(nodes),
    })).resolves.toMatchObject({ kind: "unavailable" });
    await expect(loadLoreReferenceSource({
      rootPath: "/world",
      relativePath: "linked.md",
      currentIndex: index,
      backend: backend(nodes),
    })).resolves.toMatchObject({ kind: "unavailable", issues: [{ kind: "symbolic-link" }] });
    await expect(loadLoreReferenceSource({
      rootPath: "/world",
      relativePath: "large.md",
      currentIndex: index,
      backend: backend(nodes),
      options: { maxFileBytes: 4 },
    })).resolves.toMatchObject({ kind: "unavailable", issues: [{ kind: "oversized-file" }] });
    await expect(loadLoreReferenceSource({
      rootPath: "/world",
      relativePath: "private/note.md",
      currentIndex: index,
      backend: backend(nodes),
    })).resolves.toMatchObject({ kind: "stale", issues: [{ kind: "unreadable-directory" }] });
  });

  it("rejects out-of-order async results after a new request or close", () => {
    const coordinator = new LoreReferenceRequestCoordinator();
    const first = coordinator.begin("one.md");
    const second = coordinator.begin("two.md");
    expect(coordinator.isCurrent(first)).toBe(false);
    expect(coordinator.isCurrent(second)).toBe(true);
    coordinator.invalidate();
    expect(coordinator.isCurrent(second)).toBe(false);
  });
});
