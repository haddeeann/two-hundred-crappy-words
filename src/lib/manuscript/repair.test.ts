import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import type { LoreFileRevision, LoreScanBackend, LoreScanEntry } from "$lib/lore/scan";
import { loadManuscriptProject } from "./source-reconciliation";
import {
  manuscriptSourceRepairCandidates,
  planManuscriptSourceRepair,
} from "./repair";
import { MANUSCRIPT_STRUCTURE_FILE, parseManuscriptStructure } from "./structure";

const ROOT = "/world";
const MANUSCRIPT_ID = "7339b0ee-5f87-493d-bcad-e56636d7cb26";
const SCENE_ID = "6eea7c60-8e12-4b9a-9716-f31cd3450eb3";
const NOTE_ID = "b94fc398-9156-46d2-a48b-93e3c40ee638";

type TestNode =
  | { type: "file"; text: string }
  | { type: "directory"; children: Record<string, TestNode> }
  | { type: "symlink" };

function file(text: string): TestNode {
  return { type: "file", text };
}

function directory(children: Record<string, TestNode>): TestNode {
  return { type: "directory", children };
}

function backend(root: TestNode): LoreScanBackend {
  function nodeAt(path: string): TestNode {
    const relative = path === ROOT ? "" : path.slice(`${ROOT}/`.length);
    let node = root;
    for (const segment of relative.split("/").filter(Boolean)) {
      if (node.type !== "directory") throw new Error("not a directory");
      const child: TestNode | undefined = node.children[segment];
      if (!child) throw new Error("missing");
      node = child;
    }
    return node;
  }
  return {
    async readDirectory(path): Promise<readonly LoreScanEntry[]> {
      const node = nodeAt(path);
      if (node.type !== "directory") throw new Error("not a directory");
      return Object.entries(node.children).map(([name, child]) => ({
        name,
        isFile: child.type === "file",
        isDirectory: child.type === "directory",
        isSymlink: child.type === "symlink",
      }));
    },
    async readText(path) {
      const node = nodeAt(path);
      if (node.type !== "file") throw new Error("not a file");
      return node.text;
    },
    async inspectFile(path): Promise<LoreFileRevision> {
      const node = nodeAt(path);
      if (node.type !== "file") throw new Error("not a file");
      return { size: new TextEncoder().encode(node.text).byteLength, revision: "stable" };
    },
    async join(parent, child) {
      return `${parent}/${child}`;
    },
  };
}

function markdown(id: string, title: string): string {
  return `---\nid: "${id}"\ntitle: "${title}"\n---\n\n# ${title}\n`;
}

function structureText(noteId: string | null = NOTE_ID): string {
  return `${JSON.stringify({
    formatVersion: 1,
    futureFile: { retained: true },
    manuscripts: [{
      id: MANUSCRIPT_ID,
      title: "Book",
      futureBook: "keep",
      items: [{
        id: SCENE_ID,
        kind: "scene",
        title: "Signal",
        futureItem: [1, 2, 3],
        source: {
          path: "Manuscript/old.md",
          ...(noteId ? { noteId } : {}),
          futureBinding: "keep too",
        },
      }],
    }],
  }, null, 2)}\n`;
}

async function movedFixture(options: { occupied?: boolean; duplicate?: boolean; pathOnly?: boolean } = {}) {
  const moved = markdown(NOTE_ID, "Signal");
  const structure = structureText(options.pathOnly ? null : NOTE_ID);
  const manuscriptChildren: Record<string, TestNode> = {
    "moved.md": file(moved),
    ...(options.occupied
      ? { "old.md": file(markdown("2792befd-5380-4815-9a25-e2659aa9c79f", "Other")) }
      : {}),
  };
  const root = directory({
    [MANUSCRIPT_STRUCTURE_FILE]: file(structure),
    Manuscript: directory(manuscriptChildren),
    ...(options.duplicate
      ? { Lore: directory({ "duplicate.md": file(markdown(NOTE_ID, "Duplicate")) }) }
      : {}),
  });
  const loreSources = [
    { path: "Manuscript/moved.md", text: moved },
    ...(options.duplicate
      ? [{ path: "Lore/duplicate.md", text: markdown(NOTE_ID, "Duplicate") }]
      : []),
  ];
  const result = await loadManuscriptProject(ROOT, backend(root), {
    loreIndex: buildLoreProjectIndex(loreSources, 1),
  });
  return { result, structure };
}

describe("manuscript moved-source repair planning", () => {
  it("previews exactly one path change while retaining unknown supported fields", async () => {
    const { result, structure } = await movedFixture();
    const candidates = manuscriptSourceRepairCandidates(result);
    expect(candidates).toEqual([expect.objectContaining({
      key: `${SCENE_ID}:source`,
      itemTitle: "Signal",
      oldPath: "Manuscript/old.md",
      suggestedPath: "Manuscript/moved.md",
      noteId: NOTE_ID,
    })]);

    const plan = planManuscriptSourceRepair(result, candidates[0]!.key);
    expect(plan).toMatchObject({
      kind: "ready",
      jsonPath: "manuscripts[0].items[0].source.path",
      originalText: structure,
    });
    if (plan.kind !== "ready") throw new Error(plan.reason);
    expect(parseManuscriptStructure(plan.updatedText)).toMatchObject({ kind: "valid" });

    const before = JSON.parse(plan.originalText);
    const after = JSON.parse(plan.updatedText);
    expect(after).toEqual({
      ...before,
      manuscripts: [{
        ...before.manuscripts[0],
        items: [{
          ...before.manuscripts[0].items[0],
          source: {
            ...before.manuscripts[0].items[0].source,
            path: "Manuscript/moved.md",
          },
        }],
      }],
    });
  });

  it("does not offer repair when the old path is occupied", async () => {
    const { result } = await movedFixture({ occupied: true });
    expect(manuscriptSourceRepairCandidates(result)).toEqual([]);
    expect(planManuscriptSourceRepair(result, `${SCENE_ID}:source`)).toMatchObject({
      kind: "unavailable",
    });
  });

  it("does not offer repair for path-only missing or duplicate-ID sources", async () => {
    const pathOnly = await movedFixture({ pathOnly: true });
    expect(manuscriptSourceRepairCandidates(pathOnly.result)).toEqual([]);

    const duplicate = await movedFixture({ duplicate: true });
    expect(manuscriptSourceRepairCandidates(duplicate.result)).toEqual([]);
  });

  it("rejects unknown or stale candidate keys", async () => {
    const { result } = await movedFixture();
    expect(planManuscriptSourceRepair(result, "missing:source")).toEqual({
      kind: "unavailable",
      reason: "This binding is not a unique, verified moved-source repair candidate.",
    });
    expect(planManuscriptSourceRepair({ kind: "absent" }, `${SCENE_ID}:source`)).toMatchObject({
      kind: "unavailable",
    });
  });
});
