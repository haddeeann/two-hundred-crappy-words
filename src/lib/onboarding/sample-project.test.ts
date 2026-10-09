import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FileTreeEntry } from "$lib/editor/file-tree";
import { parseManuscriptStructure } from "$lib/manuscript/structure";
import { parseWorldProjectManifest } from "$lib/project/manifest";
import { executeSampleProject, planSampleProject } from "./sample-project";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";

function entry(name: string): FileTreeEntry {
  return { name, path: `/parent/${name}`, isDirectory: true, isFile: false, isSymlink: false, expanded: false, children: null };
}

function readyPlan() {
  const plan = planSampleProject({ parentEntries: [], projectId: PROJECT_ID });
  if (plan.kind !== "ready") throw new Error("expected a ready plan");
  return plan;
}

describe("sample project planning", () => {
  it("builds a bounded valid project and manuscript with the manifest last", () => {
    const plan = readyPlan();
    expect(plan.paths).toHaveLength(16);
    expect(plan.paths.at(-1)).toBe("200-crappy-words.project.json");
    expect(parseWorldProjectManifest(plan.manifestText)).toMatchObject({ kind: "valid" });
    const structure = plan.files.find(({ path }) => path === "200-crappy-words.manuscripts.json");
    expect(structure).toBeDefined();
    expect(parseManuscriptStructure(structure!.text)).toMatchObject({ kind: "valid" });
    expect(plan.files.find(({ path }) => path === "Characters/Mara Venn.md")?.text).toContain("facts:");
  });

  it("blocks a case-insensitive destination collision before writing", () => {
    expect(planSampleProject({ parentEntries: [entry("the quiet signal sample")], projectId: PROJECT_ID })).toEqual({
      kind: "blocked",
      folderName: "The Quiet Signal Sample",
    });
  });
});

describe("sample project execution", () => {
  it("creates directories and ordinary files before publishing the manifest", async () => {
    const events: string[] = [];
    await expect(executeSampleProject(readyPlan(), {
      createRoot: async () => { events.push("root"); },
      createDirectory: async (path) => { events.push(`directory:${path}`); },
      createFile: async (path) => { events.push(`file:${path}`); },
      createManifest: async () => { events.push("manifest"); },
      removeFile: vi.fn(), removeDirectory: vi.fn(), removeRoot: vi.fn(),
    })).resolves.toEqual({ kind: "complete" });
    expect(events[0]).toBe("root");
    expect(events.at(-1)).toBe("manifest");
  });

  it("creates a loadable sample tree with real no-clobber filesystem writes", async () => {
    const parent = await mkdtemp(join(tmpdir(), "200cw-sample-test-"));
    const plan = readyPlan();
    const root = join(parent, plan.folderName);
    try {
      await expect(executeSampleProject(plan, {
        createRoot: () => mkdir(root),
        createDirectory: (path) => mkdir(join(root, path)),
        createFile: (path, text) => writeFile(join(root, path), text, { flag: "wx" }),
        createManifest: (text) => writeFile(join(root, "200-crappy-words.project.json"), text, { flag: "wx" }),
        removeFile: (path) => rm(join(root, path)),
        removeDirectory: (path) => rmdir(join(root, path)),
        removeRoot: () => rmdir(root),
      })).resolves.toEqual({ kind: "complete" });
      expect(parseWorldProjectManifest(await readFile(join(root, "200-crappy-words.project.json"), "utf8"))).toMatchObject({ kind: "valid" });
      expect(parseManuscriptStructure(await readFile(join(root, "200-crappy-words.manuscripts.json"), "utf8"))).toMatchObject({ kind: "valid" });
      expect(await readFile(join(root, "Manuscript/01 Arrival/01 the-signal.md"), "utf8")).toContain("[[Quiet Station]]");
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("rolls back only paths created by a failed attempt in reverse order", async () => {
    const removed: string[] = [];
    const result = await executeSampleProject(readyPlan(), {
      createRoot: async () => {},
      createDirectory: async () => {},
      createFile: async (path) => {
        if (path === "Manuscript/01 Arrival/chapter.md") throw new Error("disk full");
      },
      createManifest: vi.fn(),
      removeFile: async (path) => { removed.push(`file:${path}`); },
      removeDirectory: async (path) => { removed.push(`directory:${path}`); },
      removeRoot: async () => { removed.push("root"); },
    });
    expect(result).toMatchObject({ kind: "failed", failedAt: "Manuscript/01 Arrival/chapter.md", retainedPaths: [], rollbackIssues: [] });
    expect(removed.at(-1)).toBe("root");
    expect(removed[0]).toBe("file:Daily/Start here.md");
  });

  it("reports retained paths when an empty-directory rollback is refused", async () => {
    const result = await executeSampleProject(readyPlan(), {
      createRoot: async () => {},
      createDirectory: async () => {},
      createFile: async () => { throw new Error("stopped"); },
      createManifest: vi.fn(), removeFile: vi.fn(),
      removeDirectory: async (path) => { if (path === "Characters") throw new Error("not empty"); },
      removeRoot: async () => { throw new Error("not empty"); },
    });
    expect(result).toMatchObject({ kind: "failed", retainedPaths: ["Characters/", "The Quiet Signal Sample/"] });
  });
});
