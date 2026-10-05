import { describe, expect, it } from "vitest";

import type { LoreFileRevision, LoreScanBackend, LoreScanEntry } from "$lib/lore/scan";
import { MAPS_FILE, MAPS_FORMAT, MAX_MAPS_BYTES, type MapsProject } from "./format";
import { loadMapsProject } from "./load";

const ROOT = "/world";
const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const OTHER_PROJECT_ID = "aef84aa7-fd7d-42de-9c94-6df548a6471f";

type FileNode = {
  type: "file";
  text: string;
  reportedSize?: number;
  revision?: string;
  inspections?: string[];
  unreadable?: boolean;
};
type TestNode = FileNode | { type: "directory" } | { type: "symlink" };

function file(text: string, options: Omit<FileNode, "type" | "text"> = {}): FileNode {
  return { type: "file", text, ...options };
}

function backend(
  children: Record<string, TestNode>,
  options: { unreadableRoot?: boolean } = {},
): LoreScanBackend {
  function nodeAt(path: string): TestNode {
    const node = children[path.slice(`${ROOT}/`.length)];
    if (!node) throw new Error(`Missing: ${path}`);
    return node;
  }
  return {
    async readDirectory(path): Promise<readonly LoreScanEntry[]> {
      if (path !== ROOT) throw new Error(`Not a directory: ${path}`);
      if (options.unreadableRoot) throw new Error("permission denied");
      return Object.entries(children).map(([name, node]) => ({
        name,
        isFile: node.type === "file",
        isDirectory: node.type === "directory",
        isSymlink: node.type === "symlink",
      }));
    },
    async readText(path): Promise<string> {
      const node = nodeAt(path);
      if (node.type !== "file") throw new Error("Not a file");
      if (node.unreadable) throw new Error("permission denied");
      return node.text;
    },
    async inspectFile(path): Promise<LoreFileRevision> {
      const node = nodeAt(path);
      if (node.type !== "file") throw new Error("Not a file");
      return {
        size: node.reportedSize ?? new TextEncoder().encode(node.text).byteLength,
        revision: node.inspections?.shift() ?? node.revision ?? "stable",
      };
    },
    async join(parent, child) {
      return `${parent}/${child}`;
    },
  };
}

function mapsProject(projectId = PROJECT_ID): MapsProject {
  return { format: MAPS_FORMAT, formatVersion: 1, projectId, maps: [] };
}

function source(projectId = PROJECT_ID): string {
  return `${JSON.stringify(mapsProject(projectId), null, 2)}\n`;
}

describe("maps project loading", () => {
  it("keeps an absent optional file separate from errors", async () => {
    await expect(loadMapsProject(ROOT, backend({}), PROJECT_ID)).resolves.toEqual({ kind: "absent" });
  });

  it("stable-reads a matching project without changing its source", async () => {
    const text = source();
    await expect(loadMapsProject(ROOT, backend({ [MAPS_FILE]: file(text) }), PROJECT_ID)).resolves.toMatchObject({
      kind: "ready",
      text,
      fingerprint: expect.stringMatching(/^\d+:/),
      source: { projectId: PROJECT_ID },
      mapsProject: mapsProject(),
    });
  });

  it("requires a matching valid world-project identity", async () => {
    await expect(loadMapsProject(ROOT, backend({ [MAPS_FILE]: file(source()) }), null)).resolves.toMatchObject({
      kind: "manifest-unavailable",
      message: expect.stringContaining("valid world-project manifest"),
    });
    await expect(
      loadMapsProject(ROOT, backend({ [MAPS_FILE]: file(source(OTHER_PROJECT_ID)) }), PROJECT_ID),
    ).resolves.toMatchObject({
      kind: "project-mismatch",
      projectId: OTHER_PROJECT_ID,
      expectedProjectId: PROJECT_ID,
    });
  });

  it("separates malformed, invalid, and newer source", async () => {
    await expect(loadMapsProject(ROOT, backend({ [MAPS_FILE]: file("{") }), PROJECT_ID)).resolves.toMatchObject({ kind: "malformed" });
    await expect(loadMapsProject(ROOT, backend({ [MAPS_FILE]: file(JSON.stringify({ formatVersion: 1 })) }), PROJECT_ID)).resolves.toMatchObject({ kind: "invalid" });
    await expect(loadMapsProject(ROOT, backend({ [MAPS_FILE]: file(JSON.stringify({ formatVersion: 2 })) }), PROJECT_ID)).resolves.toMatchObject({ kind: "unsupported-version", version: 2 });
  });

  it("rejects links and non-files before reading", async () => {
    await expect(loadMapsProject(ROOT, backend({ [MAPS_FILE]: { type: "symlink" } }), PROJECT_ID)).resolves.toMatchObject({ kind: "unsafe" });
    await expect(loadMapsProject(ROOT, backend({ [MAPS_FILE]: { type: "directory" } }), PROJECT_ID)).resolves.toMatchObject({ kind: "unsafe" });
  });

  it("reports unreadable, oversized, and unstable sources without throwing", async () => {
    await expect(loadMapsProject(ROOT, backend({}, { unreadableRoot: true }), PROJECT_ID)).resolves.toMatchObject({ kind: "unreadable" });
    await expect(loadMapsProject(ROOT, backend({ [MAPS_FILE]: file(source(), { unreadable: true }) }), PROJECT_ID)).resolves.toMatchObject({ kind: "unreadable" });
    await expect(loadMapsProject(ROOT, backend({ [MAPS_FILE]: file(source(), { reportedSize: MAX_MAPS_BYTES + 1 }) }), PROJECT_ID)).resolves.toMatchObject({ kind: "invalid", fingerprint: null });
    await expect(loadMapsProject(ROOT, backend({ [MAPS_FILE]: file(source(), { inspections: ["a", "b", "c", "d"] }) }), PROJECT_ID)).resolves.toMatchObject({ kind: "unstable" });
  });
});
