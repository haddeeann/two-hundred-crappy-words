import { describe, expect, it } from "vitest";

import type {
  LoreFileRevision,
  LoreScanBackend,
  LoreScanEntry,
} from "$lib/lore/scan";
import {
  MAX_TIMELINE_BYTES,
  TIMELINE_FILE,
  TIMELINE_FORMAT,
  type TimelineProject,
} from "./format";
import { loadTimelineProject } from "./load";

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
    const name = path.slice(`${ROOT}/`.length);
    const node = children[name];
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

function timeline(projectId = PROJECT_ID): TimelineProject {
  return {
    format: TIMELINE_FORMAT,
    formatVersion: 1,
    projectId,
    calendars: [],
    tracks: [],
  };
}

function source(projectId = PROJECT_ID): string {
  return `${JSON.stringify(timeline(projectId), null, 2)}\n`;
}

describe("timeline project loading", () => {
  it("keeps an absent optional file separate from errors", async () => {
    await expect(loadTimelineProject(ROOT, backend({}), PROJECT_ID)).resolves.toEqual({
      kind: "absent",
    });
  });

  it("stable-reads a matching project without changing its source", async () => {
    const text = source();
    await expect(
      loadTimelineProject(ROOT, backend({ [TIMELINE_FILE]: file(text) }), PROJECT_ID),
    ).resolves.toMatchObject({
      kind: "ready",
      text,
      fingerprint: expect.stringMatching(/^\d+:/),
      source: { projectId: PROJECT_ID },
      timeline: timeline(),
    });
  });

  it("requires a valid manifest identity before enabling shared semantics", async () => {
    await expect(
      loadTimelineProject(ROOT, backend({ [TIMELINE_FILE]: file(source()) }), null),
    ).resolves.toMatchObject({
      kind: "manifest-unavailable",
      projectId: PROJECT_ID,
      message: expect.stringContaining("Gregorian"),
    });
  });

  it("explains a project mismatch without repairing either identity", async () => {
    await expect(
      loadTimelineProject(
        ROOT,
        backend({ [TIMELINE_FILE]: file(source(OTHER_PROJECT_ID)) }),
        PROJECT_ID,
      ),
    ).resolves.toMatchObject({
      kind: "project-mismatch",
      projectId: OTHER_PROJECT_ID,
      expectedProjectId: PROJECT_ID,
      message: expect.stringContaining("different world project"),
    });
  });

  it("separates malformed, invalid, and newer source", async () => {
    await expect(
      loadTimelineProject(ROOT, backend({ [TIMELINE_FILE]: file("{") }), PROJECT_ID),
    ).resolves.toMatchObject({ kind: "malformed", fingerprint: expect.any(String) });
    await expect(
      loadTimelineProject(
        ROOT,
        backend({ [TIMELINE_FILE]: file(JSON.stringify({ formatVersion: 1 })) }),
        PROJECT_ID,
      ),
    ).resolves.toMatchObject({ kind: "invalid", fingerprint: expect.any(String) });
    await expect(
      loadTimelineProject(
        ROOT,
        backend({ [TIMELINE_FILE]: file(JSON.stringify({ formatVersion: 2 })) }),
        PROJECT_ID,
      ),
    ).resolves.toMatchObject({
      kind: "unsupported-version",
      version: 2,
      fingerprint: expect.any(String),
    });
  });

  it("rejects symbolic links and non-files before reading", async () => {
    await expect(
      loadTimelineProject(
        ROOT,
        backend({ [TIMELINE_FILE]: { type: "symlink" } }),
        PROJECT_ID,
      ),
    ).resolves.toMatchObject({ kind: "unsafe", message: expect.stringContaining("non-symbolic") });
    await expect(
      loadTimelineProject(
        ROOT,
        backend({ [TIMELINE_FILE]: { type: "directory" } }),
        PROJECT_ID,
      ),
    ).resolves.toMatchObject({ kind: "unsafe" });
  });

  it("reports unreadable roots and files without throwing", async () => {
    await expect(
      loadTimelineProject(ROOT, backend({}, { unreadableRoot: true }), PROJECT_ID),
    ).resolves.toMatchObject({ kind: "unreadable", message: expect.stringContaining("permission") });
    await expect(
      loadTimelineProject(
        ROOT,
        backend({ [TIMELINE_FILE]: file(source(), { unreadable: true }) }),
        PROJECT_ID,
      ),
    ).resolves.toMatchObject({ kind: "unreadable", message: expect.stringContaining("permission") });
  });

  it("separates an oversized file from an unstable read", async () => {
    await expect(
      loadTimelineProject(
        ROOT,
        backend({ [TIMELINE_FILE]: file(source(), { reportedSize: MAX_TIMELINE_BYTES + 1 }) }),
        PROJECT_ID,
      ),
    ).resolves.toMatchObject({
      kind: "invalid",
      fingerprint: null,
      issues: [{ message: expect.stringContaining("read limit") }],
    });
    await expect(
      loadTimelineProject(
        ROOT,
        backend({
          [TIMELINE_FILE]: file(source(), { inspections: ["a", "b", "c", "d"] }),
        }),
        PROJECT_ID,
      ),
    ).resolves.toMatchObject({ kind: "unstable", message: expect.stringContaining("kept changing") });
  });
});
