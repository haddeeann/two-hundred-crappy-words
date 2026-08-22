import { describe, expect, it } from "vitest";

import { scanProjectLore, type LoreScanBackend, type LoreScanEntry } from "./scan";

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

describe("bounded project lore scan", () => {
  it("accepts only ordinary contained Markdown and records exclusion reasons", async () => {
    const nodes: Record<string, FakeNode> = {
      "/world": { type: "directory" },
      "/world/Lore": { type: "directory" },
      "/world/Lore/planet.MARKDOWN": { type: "file", text: "# Planet" },
      "/world/Lore/image.png": { type: "file", text: "binary" },
      "/world/.git": { type: "directory" },
      "/world/.git/private.md": { type: "file", text: "hidden" },
      "/world/node_modules": { type: "directory" },
      "/world/node_modules/package.md": { type: "file", text: "dependency" },
      "/world/Excluded": { type: "directory" },
      "/world/Excluded/note.md": { type: "file", text: "excluded" },
      "/world/Generated": { type: "directory" },
      "/world/Generated/result.md": { type: "file", text: "generated" },
      "/world/linked.md": { type: "symlink" },
    };

    const result = await scanProjectLore("/world", backend(nodes), {
      excludedPaths: ["Excluded"],
      generatedPaths: ["Generated"],
    });

    expect(result.sources).toEqual([{ path: "Lore/planet.MARKDOWN", text: "# Planet" }]);
    expect(result.issues.map(({ kind, path }) => ({ kind, path }))).toEqual([
      { kind: "hidden-path", path: ".git" },
      { kind: "configured-exclusion", path: "Excluded" },
      { kind: "generated-path", path: "Generated" },
      { kind: "symbolic-link", path: "linked.md" },
      { kind: "default-exclusion", path: "node_modules" },
    ]);
  });

  it("skips oversized and unreadable files without blocking safe notes", async () => {
    const nodes: Record<string, FakeNode> = {
      "/world": { type: "directory" },
      "/world/a.md": { type: "file", text: "123456" },
      "/world/b.md": { type: "file", error: "permission denied" },
      "/world/c.md": { type: "file", text: "safe" },
    };
    const result = await scanProjectLore("/world", backend(nodes), { maxFileBytes: 5 });

    expect(result.sources).toEqual([{ path: "c.md", text: "safe" }]);
    expect(result.issues.map(({ kind }) => kind)).toEqual(["oversized-file", "unreadable-file"]);
  });

  it("stops at configured file and total-byte safety limits", async () => {
    const nodes: Record<string, FakeNode> = {
      "/world": { type: "directory" },
      "/world/a.md": { type: "file", text: "1234" },
      "/world/b.md": { type: "file", text: "5678" },
      "/world/c.md": { type: "file", text: "9012" },
    };

    const fileLimited = await scanProjectLore("/world", backend(nodes), { maxFiles: 1 });
    expect(fileLimited).toMatchObject({ truncated: true, acceptedBytes: 4 });
    expect(fileLimited.sources).toHaveLength(1);
    expect(fileLimited.issues.at(-1)?.kind).toBe("scan-limit");

    const byteLimited = await scanProjectLore("/world", backend(nodes), { maxTotalBytes: 6 });
    expect(byteLimited).toMatchObject({ truncated: true, acceptedBytes: 4 });
    expect(byteLimited.sources).toHaveLength(1);
  });

  it("rejects unsafe app-local exclusion paths", async () => {
    await expect(
      scanProjectLore("/world", backend({ "/world": { type: "directory" } }), {
        excludedPaths: ["../outside"],
      }),
    ).rejects.toThrow(/safe project-relative paths/);
  });
});
