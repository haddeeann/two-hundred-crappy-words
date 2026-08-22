import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import type {
  LoreFileRevision,
  LoreScanBackend,
  LoreScanEntry,
} from "$lib/lore/scan";
import {
  loadManuscriptProject,
  reconcileManuscriptStructure,
} from "./source-reconciliation";
import {
  MANUSCRIPT_STRUCTURE_FILE,
  parseManuscriptStructure,
  serializeManuscriptStructure,
  type ManuscriptStructure,
} from "./structure";

const ROOT = "/world";
const MANUSCRIPT_ID = "7339b0ee-5f87-493d-bcad-e56636d7cb26";
const CHAPTER_ID = "422b34ce-2d0f-4916-a557-553fc95db31b";
const OVERVIEW_ID = "2792befd-5380-4815-9a25-e2659aa9c79f";
const SCENE_ID = "6eea7c60-8e12-4b9a-9716-f31cd3450eb3";
const SCENE_NOTE_ID = "b94fc398-9156-46d2-a48b-93e3c40ee638";

type FileNode = {
  type: "file";
  text: string;
  revision?: string;
  inspections?: string[];
  unreadable?: boolean;
};
type DirectoryNode = {
  type: "directory";
  children: Record<string, TestNode>;
  unreadable?: boolean;
};
type TestNode = FileNode | DirectoryNode | { type: "symlink" };

function file(text: string, options: Omit<FileNode, "type" | "text"> = {}): FileNode {
  return { type: "file", text, ...options };
}

function directory(children: Record<string, TestNode>, unreadable = false): DirectoryNode {
  return { type: "directory", children, ...(unreadable ? { unreadable } : {}) };
}

function backend(root: DirectoryNode): LoreScanBackend {
  function nodeAt(path: string): TestNode {
    const relative = path === ROOT ? "" : path.slice(`${ROOT}/`.length);
    let current: TestNode = root;
    for (const segment of relative.split("/").filter(Boolean)) {
      if (current.type !== "directory") throw new Error(`Not a directory: ${path}`);
      const child: TestNode | undefined = current.children[segment];
      if (!child) throw new Error(`Missing: ${path}`);
      current = child;
    }
    return current;
  }

  return {
    async readDirectory(path): Promise<readonly LoreScanEntry[]> {
      const node = nodeAt(path);
      if (node.type !== "directory") throw new Error(`Not a directory: ${path}`);
      if (node.unreadable) throw new Error("permission denied");
      return Object.entries(node.children).map(([name, child]) => ({
        name,
        isFile: child.type === "file",
        isDirectory: child.type === "directory",
        isSymlink: child.type === "symlink",
      }));
    },
    async readText(path): Promise<string> {
      const node = nodeAt(path);
      if (node.type !== "file") throw new Error(`Not a file: ${path}`);
      if (node.unreadable) throw new Error("permission denied");
      return node.text;
    },
    async inspectFile(path): Promise<LoreFileRevision> {
      const node = nodeAt(path);
      if (node.type !== "file") throw new Error(`Not a file: ${path}`);
      const revision = node.inspections?.shift() ?? node.revision ?? "stable";
      return {
        size: new TextEncoder().encode(node.text).byteLength,
        revision,
      };
    },
    async join(parent, child) {
      return `${parent}/${child}`;
    },
  };
}

function markdown(id: string, title: string, body = "Prose."): string {
  return `---\nid: "${id}"\ntype: "scene"\ntitle: "${title}"\n---\n\n# ${title}\n\n${body}\n`;
}

function structure(
  scenePath = "Manuscript/01 Signals/01 antenna.md",
  sceneNoteId: string | undefined = SCENE_NOTE_ID,
): ManuscriptStructure {
  return {
    formatVersion: 1,
    manuscripts: [
      {
        id: MANUSCRIPT_ID,
        title: "The Patient Comet",
        items: [
          {
            id: CHAPTER_ID,
            kind: "chapter",
            title: "Signals",
            folder: "Manuscript/01 Signals",
            overview: {
              path: "Manuscript/01 Signals/chapter.md",
              noteId: OVERVIEW_ID,
            },
            children: [
              {
                id: SCENE_ID,
                kind: "scene",
                title: "The antenna",
                source: {
                  path: scenePath,
                  ...(sceneNoteId ? { noteId: sceneNoteId } : {}),
                },
                includeInCompile: true,
              },
            ],
            includeInCompile: true,
          },
        ],
      },
    ],
  };
}

function projectTree(
  structureText = serializeManuscriptStructure(structure()),
  sceneText = markdown(SCENE_NOTE_ID, "The antenna"),
): DirectoryNode {
  return directory({
    [MANUSCRIPT_STRUCTURE_FILE]: file(structureText),
    Manuscript: directory({
      "01 Signals": directory({
        "chapter.md": file(markdown(OVERVIEW_ID, "Signals", "Quick notes.")),
        "01 antenna.md": file(sceneText),
      }),
    }),
  });
}

function firstChapter(result: Awaited<ReturnType<typeof loadManuscriptProject>>) {
  if (result.kind !== "ready") throw new Error(`Expected ready, received ${result.kind}`);
  const chapter = result.reconciled.manuscripts[0]!.items[0]!;
  if (!("children" in chapter)) throw new Error("Expected chapter");
  return chapter;
}

describe("manuscript project source reconciliation", () => {
  it("treats a missing structure file as an unchanged ordinary project", async () => {
    await expect(
      loadManuscriptProject(ROOT, backend(directory({ Manuscript: directory({}) }))),
    ).resolves.toEqual({ kind: "absent" });
  });

  it("stable-reads a valid structure and preserves deterministic outline order", async () => {
    const tree = projectTree();
    const result = await loadManuscriptProject(ROOT, backend(tree));

    expect(result).toMatchObject({
      kind: "ready",
      fingerprint: expect.stringMatching(/^\d+:/),
      reconciled: {
        acceptedSourceBytes: expect.any(Number),
        manuscripts: [
          {
            manuscript: { title: "The Patient Comet" },
            items: [
              {
                folder: { kind: "ready", path: "Manuscript/01 Signals" },
                overview: { kind: "ready", noteId: OVERVIEW_ID },
                children: [{ source: { kind: "ready", noteId: SCENE_NOTE_ID } }],
              },
            ],
          },
        ],
      },
    });
    expect(result.kind === "ready" && result.reconciled.acceptedSourceBytes).toBeGreaterThan(0);
  });

  it("separates malformed, invalid, unsupported, unsafe, and unreadable structures", async () => {
    await expect(
      loadManuscriptProject(
        ROOT,
        backend(directory({ [MANUSCRIPT_STRUCTURE_FILE]: file("{") })),
      ),
    ).resolves.toMatchObject({ kind: "malformed", fingerprint: expect.any(String) });
    await expect(
      loadManuscriptProject(
        ROOT,
        backend(directory({ [MANUSCRIPT_STRUCTURE_FILE]: file('{"formatVersion":1}') })),
      ),
    ).resolves.toMatchObject({ kind: "invalid", issues: [{ path: "$.manuscripts" }] });
    await expect(
      loadManuscriptProject(
        ROOT,
        backend(directory({ [MANUSCRIPT_STRUCTURE_FILE]: file('{"formatVersion":2}') })),
      ),
    ).resolves.toMatchObject({ kind: "unsupported-version", version: 2 });
    await expect(
      loadManuscriptProject(
        ROOT,
        backend(directory({ [MANUSCRIPT_STRUCTURE_FILE]: { type: "symlink" } })),
      ),
    ).resolves.toMatchObject({ kind: "unsafe", message: expect.stringContaining("Symbolic") });
    await expect(
      loadManuscriptProject(ROOT, backend(directory({}, true))),
    ).resolves.toMatchObject({ kind: "unreadable", message: expect.stringContaining("permission") });
  });

  it("reports a structure that keeps changing during its stable read", async () => {
    const root = projectTree();
    const structureNode = root.children[MANUSCRIPT_STRUCTURE_FILE];
    if (structureNode?.type !== "file") throw new Error("fixture");
    structureNode.inspections = ["a", "b", "c", "d"];

    await expect(loadManuscriptProject(ROOT, backend(root))).resolves.toMatchObject({
      kind: "unstable",
      message: expect.stringContaining("kept changing"),
    });
  });

  it("keeps missing, unsafe, unreadable, and non-directory entries visible", async () => {
    const parsed = parseManuscriptStructure(serializeManuscriptStructure(structure()));
    if (parsed.kind !== "valid") throw new Error("fixture");
    const root = directory({
      Manuscript: directory({
        "01 Signals": file("not a directory"),
      }),
    });
    const reconciled = await reconcileManuscriptStructure(
      ROOT,
      parsed.structure,
      backend(root),
    );
    const chapter = reconciled.manuscripts[0]!.items[0]!;
    if (!("children" in chapter)) throw new Error("fixture");

    expect(chapter.folder).toMatchObject({ kind: "not-directory" });
    expect(chapter.overview).toMatchObject({ kind: "missing" });
    expect(chapter.children[0]!.source).toMatchObject({ kind: "missing" });

    const symlinkRoot = directory({
      Manuscript: directory({ "01 Signals": { type: "symlink" } }),
    });
    const unsafe = await reconcileManuscriptStructure(
      ROOT,
      parsed.structure,
      backend(symlinkRoot),
    );
    const unsafeChapter = unsafe.manuscripts[0]!.items[0]!;
    if (!("children" in unsafeChapter)) throw new Error("fixture");
    expect(unsafeChapter.folder).toMatchObject({ kind: "unsafe" });
    expect(unsafeChapter.overview).toMatchObject({ kind: "unsafe" });
    expect(unsafeChapter.children[0]!.source).toMatchObject({ kind: "unsafe" });
  });

  it("offers but never applies one verified stable-ID move", async () => {
    const movedPath = "Manuscript/01 Signals/02 moved.md";
    const model = structure("Manuscript/01 Signals/01 old.md");
    const root = directory({
      Manuscript: directory({
        "01 Signals": directory({
          "chapter.md": file(markdown(OVERVIEW_ID, "Signals")),
          "02 moved.md": file(markdown(SCENE_NOTE_ID, "Moved")),
        }),
      }),
    });
    const index = buildLoreProjectIndex([
      { path: movedPath, text: markdown(SCENE_NOTE_ID, "Moved") },
      { path: "Manuscript/01 Signals/chapter.md", text: markdown(OVERVIEW_ID, "Signals") },
    ]);
    const reconciled = await reconcileManuscriptStructure(ROOT, model, backend(root), {
      loreIndex: index,
    });
    const chapter = reconciled.manuscripts[0]!.items[0]!;
    if (!("children" in chapter)) throw new Error("fixture");

    expect(chapter.children[0]!.source).toMatchObject({
      kind: "moved",
      declaredPath: "Manuscript/01 Signals/01 old.md",
      resolvedPath: movedPath,
      suggestedPath: movedPath,
      declaredPathOccupied: false,
      noteId: SCENE_NOTE_ID,
    });
    expect(model.manuscripts[0]!.items[0]).toMatchObject({
      children: [{ source: { path: "Manuscript/01 Signals/01 old.md" } }],
    });
  });

  it("refuses duplicate note IDs and verifies the current file identity", async () => {
    const path = "Manuscript/01 Signals/01 antenna.md";
    const duplicateIndex = buildLoreProjectIndex([
      { path, text: markdown(SCENE_NOTE_ID, "One") },
      { path: "Manuscript/other.md", text: markdown(SCENE_NOTE_ID, "Two") },
    ]);
    const ambiguous = await loadManuscriptProject(
      ROOT,
      backend(projectTree()),
      { loreIndex: duplicateIndex },
    );
    expect(firstChapter(ambiguous).children[0]!.source).toMatchObject({
      kind: "ambiguous-id",
      candidatePaths: [path, "Manuscript/other.md"],
    });

    const staleIndex = buildLoreProjectIndex([
      { path, text: markdown(SCENE_NOTE_ID, "Original") },
    ]);
    const changed = await loadManuscriptProject(
      ROOT,
      backend(projectTree(undefined, markdown("1764b313-98bd-4ddc-85be-af3248edf7fe", "Replacement"))),
      { loreIndex: staleIndex },
    );
    expect(firstChapter(changed).children[0]!.source).toMatchObject({
      kind: "identity-mismatch",
      noteId: SCENE_NOTE_ID,
      actualNoteId: "1764b313-98bd-4ddc-85be-af3248edf7fe",
    });
  });

  it("bounds individual and aggregate reads and reports unstable sources", async () => {
    const root = projectTree();
    const manuscript = root.children.Manuscript;
    if (manuscript?.type !== "directory") throw new Error("fixture");
    const chapter = manuscript.children["01 Signals"];
    if (chapter?.type !== "directory") throw new Error("fixture");
    const scene = chapter.children["01 antenna.md"];
    if (scene?.type !== "file") throw new Error("fixture");

    const oversized = await loadManuscriptProject(ROOT, backend(root), {
      maxSourceBytes: 10,
    });
    expect(firstChapter(oversized).children[0]!.source).toMatchObject({ kind: "oversized" });

    const limited = await loadManuscriptProject(ROOT, backend(projectTree()), {
      maxTotalSourceBytes: 100,
    });
    expect(firstChapter(limited).children[0]!.source.kind).toBe("limit");

    scene.inspections = ["a", "b", "c", "d"];
    const unstable = await loadManuscriptProject(ROOT, backend(root));
    expect(firstChapter(unstable).children[0]!.source).toMatchObject({ kind: "unstable" });
  });

  it("marks two outline entries that converge on one moved source", async () => {
    const movedPath = "Manuscript/shared.md";
    const secondSceneId = "f089040d-18e9-449b-97bd-f3a869cb33e0";
    const model = structure("Manuscript/old.md");
    const chapter = model.manuscripts[0]!.items[0];
    if (chapter?.kind !== "chapter") throw new Error("fixture");
    chapter.children.push({
      id: secondSceneId,
      kind: "scene",
      title: "Second binding",
      source: { path: movedPath },
      includeInCompile: true,
    });
    const root = directory({
      Manuscript: directory({
        shared: file("unused"),
        "shared.md": file(markdown(SCENE_NOTE_ID, "Shared")),
      }),
    });
    const index = buildLoreProjectIndex([
      { path: movedPath, text: markdown(SCENE_NOTE_ID, "Shared") },
    ]);
    const reconciled = await reconcileManuscriptStructure(ROOT, model, backend(root), {
      loreIndex: index,
    });
    const resultChapter = reconciled.manuscripts[0]!.items[0]!;
    if (!("children" in resultChapter)) throw new Error("fixture");

    expect(resultChapter.children.map(({ source }) => source.kind)).toEqual([
      "path-conflict",
      "path-conflict",
    ]);
    expect(resultChapter.children[0]!.source).toMatchObject({
      conflictingItemIds: [SCENE_ID, secondSceneId].sort(),
      resolvedPath: movedPath,
    });
  });

  it("rejects invalid limit configuration", async () => {
    await expect(
      loadManuscriptProject(ROOT, backend(projectTree()), { maxSourceBytes: 0 }),
    ).rejects.toThrow(/positive safe integers/);
  });
});
