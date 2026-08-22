import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import type { LoreFileRevision, LoreScanBackend, LoreScanEntry } from "$lib/lore/scan";
import {
  planManuscriptCreation,
  retitleManuscriptCreationPlan,
  verifyManuscriptCreationPlan,
} from "./creation";
import { MANUSCRIPT_STRUCTURE_FILE, parseManuscriptStructure } from "./structure";

const ROOT = "/world";
const NOTE_ONE = "b94fc398-9156-46d2-a48b-93e3c40ee638";
const NOTE_TWO = "2792befd-5380-4815-9a25-e2659aa9c79f";

type FileNode = { type: "file"; text: string; inspections?: string[] };
type DirectoryNode = { type: "directory"; children: Record<string, TestNode>; unreadable?: boolean };
type TestNode = FileNode | DirectoryNode | { type: "symlink" };

function file(text: string): FileNode {
  return { type: "file", text };
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
      return node.text;
    },
    async inspectFile(path): Promise<LoreFileRevision> {
      const node = nodeAt(path);
      if (node.type !== "file") throw new Error(`Not a file: ${path}`);
      return {
        size: new TextEncoder().encode(node.text).byteLength,
        revision: node.inspections?.shift() ?? `stable:${node.text.length}`,
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

function ids() {
  let value = 1;
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

describe("manuscript structure creation planning", () => {
  it("plans and verifies an empty create-new structure without touching Markdown", async () => {
    const root = directory({ "notes.txt": file("Leave me alone.") });
    const plan = await planManuscriptCreation({
      rootPath: ROOT,
      importDirectory: "",
      title: "The Patient Comet",
      mode: "empty",
      backend: backend(root),
      createId: ids(),
    });

    expect(plan).toMatchObject({
      kind: "ready",
      mode: "empty",
      structure: {
        formatVersion: 1,
        manuscripts: [{ title: "The Patient Comet", items: [] }],
      },
      sourceFingerprints: {},
    });
    if (plan.kind !== "ready") throw new Error("Expected ready plan");
    expect(parseManuscriptStructure(plan.text)).toMatchObject({ kind: "valid" });
    await expect(
      verifyManuscriptCreationPlan(ROOT, plan, backend(root)),
    ).resolves.toEqual({ kind: "ready", text: plan.text });
  });

  it("imports folders as chapters, chapter.md as notes, and Markdown in natural order", async () => {
    const overview = markdown(NOTE_TWO, "Signals overview", "Quick notes.");
    const first = markdown(NOTE_ONE, "The buried antenna");
    const loose = "# Before the chapters\n";
    const root = directory({
      Manuscript: directory({
        "10 Signals": directory({
          "chapter.md": file(overview),
          "10 answer.md": file("# The answer\n"),
          "2 antenna.md": file(first),
          Assets: directory({ "map.png": file("not really an image") }),
          "draft.txt": file("Not prose for this importer."),
        }),
        "01 prelude.md": file(loose),
      }),
    });
    const loreIndex = buildLoreProjectIndex([
      { path: "Manuscript/10 Signals/chapter.md", text: overview },
      { path: "Manuscript/10 Signals/2 antenna.md", text: first },
      { path: "Manuscript/10 Signals/10 answer.md", text: "# The answer\n" },
      { path: "Manuscript/01 prelude.md", text: loose },
    ], 1);
    const plan = await planManuscriptCreation({
      rootPath: ROOT,
      importDirectory: "Manuscript",
      title: "The Patient Comet",
      mode: "import",
      backend: backend(root),
      loreIndex,
      createId: ids(),
    });

    expect(plan).toMatchObject({
      kind: "ready",
      structure: {
        manuscripts: [{
          items: [
            {
              kind: "scene",
              title: "Before the chapters",
              source: { path: "Manuscript/01 prelude.md" },
            },
            {
              kind: "chapter",
              title: "Signals",
              folder: "Manuscript/10 Signals",
              overview: {
                path: "Manuscript/10 Signals/chapter.md",
                noteId: NOTE_TWO,
              },
              children: [
                {
                  title: "The buried antenna",
                  source: {
                    path: "Manuscript/10 Signals/2 antenna.md",
                    noteId: NOTE_ONE,
                  },
                },
                { title: "The answer", source: { path: "Manuscript/10 Signals/10 answer.md" } },
              ],
            },
          ],
        }],
      },
      skipped: [
        { path: "Manuscript/10 Signals/Assets", reason: expect.stringContaining("Nested folders") },
        { path: "Manuscript/10 Signals/draft.txt", reason: expect.stringContaining("Only Markdown") },
      ],
    });
  });

  it("blocks symbolic links and stable IDs duplicated anywhere in the lore index", async () => {
    const one = markdown(NOTE_ONE, "One");
    const two = markdown(NOTE_ONE, "Two");
    const root = directory({
      Manuscript: directory({
        "one.md": file(one),
        "shortcut.md": { type: "symlink" },
      }),
      Lore: directory({ "duplicate.md": file(two) }),
    });
    const loreIndex = buildLoreProjectIndex([
      { path: "Manuscript/one.md", text: one },
      { path: "Lore/duplicate.md", text: two },
    ], 1);

    const plan = await planManuscriptCreation({
      rootPath: ROOT,
      importDirectory: "Manuscript",
      title: "Book",
      mode: "import",
      backend: backend(root),
      loreIndex,
      createId: ids(),
    });
    expect(plan).toMatchObject({ kind: "blocked" });
    if (plan.kind !== "blocked") throw new Error("Expected blocked plan");
    expect(plan.issues.map((issue) => issue.message).join(" ")).toContain("duplicated");
    expect(plan.issues.map((issue) => issue.message).join(" ")).toContain("Symbolic links");
  });

  it("blocks an unreadable chapter instead of silently omitting it", async () => {
    const root = directory({
      Manuscript: directory({ "01 Signals": directory({}, true) }),
    });
    const plan = await planManuscriptCreation({
      rootPath: ROOT,
      importDirectory: "Manuscript",
      title: "Book",
      mode: "import",
      backend: backend(root),
      createId: ids(),
    });
    expect(plan).toMatchObject({
      kind: "blocked",
      issues: [{ path: "Manuscript/01 Signals", message: expect.stringContaining("permission denied") }],
    });
  });

  it("requires a fresh preview when an imported source changes", async () => {
    const scene = file("# One\n\nFirst version.\n");
    const root = directory({ Manuscript: directory({ "one.md": scene }) });
    const plan = await planManuscriptCreation({
      rootPath: ROOT,
      importDirectory: "Manuscript",
      title: "Book",
      mode: "import",
      backend: backend(root),
      createId: ids(),
    });
    if (plan.kind !== "ready") throw new Error("Expected ready plan");

    scene.text = "# One\n\nSecond version.\n";
    const verified = await verifyManuscriptCreationPlan(ROOT, plan, backend(root));
    expect(verified).toMatchObject({
      kind: "blocked",
      issues: [{ path: "Manuscript/one.md", message: expect.stringContaining("changed after preview") }],
    });
  });

  it("requires a fresh preview when the import directory gains a source", async () => {
    const manuscript = directory({ "one.md": file("# One\n") });
    const root = directory({ Manuscript: manuscript });
    const plan = await planManuscriptCreation({
      rootPath: ROOT,
      importDirectory: "Manuscript",
      title: "Book",
      mode: "import",
      backend: backend(root),
      createId: ids(),
    });
    if (plan.kind !== "ready") throw new Error("Expected ready plan");

    manuscript.children["two.md"] = file("# Two\n");
    await expect(
      verifyManuscriptCreationPlan(ROOT, plan, backend(root)),
    ).resolves.toMatchObject({
      kind: "blocked",
      issues: [{ message: expect.stringContaining("changed after preview") }],
    });
  });

  it("refuses any existing structure path and never treats it as replaceable", async () => {
    const root = directory({ [MANUSCRIPT_STRUCTURE_FILE]: file("broken but writer-owned") });
    await expect(
      planManuscriptCreation({
        rootPath: ROOT,
        importDirectory: "",
        title: "Book",
        mode: "empty",
        backend: backend(root),
        createId: ids(),
      }),
    ).resolves.toMatchObject({
      kind: "blocked",
      issues: [{ path: MANUSCRIPT_STRUCTURE_FILE, message: expect.stringContaining("already exists") }],
    });
  });

  it("retitles a ready preview through the validated serializer", async () => {
    const root = directory({});
    const plan = await planManuscriptCreation({
      rootPath: ROOT,
      importDirectory: "",
      title: "First title",
      mode: "empty",
      backend: backend(root),
      createId: ids(),
    });
    if (plan.kind !== "ready") throw new Error("Expected ready plan");

    expect(retitleManuscriptCreationPlan(plan, "Revised title")).toMatchObject({
      kind: "ready",
      structure: { manuscripts: [{ title: "Revised title" }] },
    });
    expect(retitleManuscriptCreationPlan(plan, "")).toMatchObject({
      kind: "blocked",
      issues: [{ path: "manuscripts[0].title" }],
    });
  });
});
