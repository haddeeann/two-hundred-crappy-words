import { describe, expect, it } from "vitest";

import {
  MANUSCRIPT_STRUCTURE_FILE,
  MAX_MANUSCRIPT_ITEMS,
  MAX_MANUSCRIPT_STRUCTURE_BYTES,
  parseManuscriptStructure,
  serializeManuscriptStructure,
  validateManuscriptFilePath,
  type ManuscriptStructure,
} from "./structure";

const MANUSCRIPT_ID = "7339b0ee-5f87-493d-bcad-e56636d7cb26";
const CHAPTER_ID = "422b34ce-2d0f-4916-a557-553fc95db31b";
const CHAPTER_NOTE_ID = "2792befd-5380-4815-9a25-e2659aa9c79f";
const SCENE_ID = "6eea7c60-8e12-4b9a-9716-f31cd3450eb3";
const SCENE_NOTE_ID = "b94fc398-9156-46d2-a48b-93e3c40ee638";

function scene(overrides: Record<string, unknown> = {}) {
  return {
    id: SCENE_ID,
    kind: "scene",
    title: "The buried antenna",
    source: {
      path: "Manuscript/01 Signals/01 buried-antenna.md",
      noteId: SCENE_NOTE_ID,
    },
    ...overrides,
  };
}

function chapter(overrides: Record<string, unknown> = {}) {
  return {
    id: CHAPTER_ID,
    kind: "chapter",
    title: "Signals in the Dust",
    folder: "Manuscript/01 Signals",
    overview: {
      path: "Manuscript/01 Signals/chapter.md",
      noteId: CHAPTER_NOTE_ID,
    },
    children: [scene()],
    ...overrides,
  };
}

function validSource(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    formatVersion: 1,
    manuscripts: [
      {
        id: MANUSCRIPT_ID,
        title: "The Patient Comet",
        items: [chapter()],
      },
    ],
    ...overrides,
  });
}

describe("portable manuscript structure", () => {
  it("uses the approved visible project-root filename", () => {
    expect(MANUSCRIPT_STRUCTURE_FILE).toBe("200-crappy-words.manuscripts.json");
  });

  it("parses a chapter folder, optional overview, and separate scene prose", () => {
    const result = parseManuscriptStructure(
      validSource({ futureField: { retained: true } }),
    );

    expect(result).toMatchObject({
      kind: "valid",
      structure: {
        manuscripts: [
          {
            title: "The Patient Comet",
            items: [
              {
                kind: "chapter",
                folder: "Manuscript/01 Signals",
                overview: { noteId: CHAPTER_NOTE_ID },
                includeInCompile: true,
                children: [
                  {
                    kind: "scene",
                    source: { noteId: SCENE_NOTE_ID },
                    includeInCompile: true,
                  },
                ],
              },
            ],
          },
        ],
      },
      source: { futureField: { retained: true } },
    });
  });

  it("normalizes bounded display metadata without interpreting it", () => {
    const result = parseManuscriptStructure(
      validSource({
        manuscripts: [
          {
            id: MANUSCRIPT_ID,
            title: "  The Patient Comet  ",
            items: [
              chapter({
                synopsis: "  A first transmission.  ",
                status: "  needs another pass  ",
                notes: "  Keep the answer uncertain.\nTry silence.  ",
                labels: [" opening ", "mystery"],
                targetWords: 2400,
                includeInCompile: false,
              }),
            ],
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      kind: "valid",
      structure: {
        manuscripts: [
          {
            title: "The Patient Comet",
            items: [
              {
                synopsis: "A first transmission.",
                status: "needs another pass",
                notes: "Keep the answer uncertain.\nTry silence.",
                labels: ["opening", "mystery"],
                targetWords: 2400,
                includeInCompile: false,
              },
            ],
          },
        ],
      },
    });
  });

  it("supports multiple books, loose scenes, and one-file chapters", () => {
    const secondManuscriptId = "39d249de-dac5-428b-a8f1-6a32ed3b2af9";
    const looseSceneId = "f089040d-18e9-449b-97bd-f3a869cb33e0";
    const oneFileChapterId = "76a66f37-a4b1-41eb-9428-e2bdb588fb25";
    const result = parseManuscriptStructure(
      validSource({
        manuscripts: [
          {
            id: MANUSCRIPT_ID,
            title: "Book One",
            items: [
              scene({
                id: looseSceneId,
                source: { path: "Manuscript/loose.md" },
              }),
            ],
          },
          {
            id: secondManuscriptId,
            title: "Book Two",
            items: [
              chapter({
                id: oneFileChapterId,
                folder: undefined,
                overview: undefined,
                children: undefined,
                source: { path: "Manuscript/book-two.md" },
              }),
            ],
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      kind: "valid",
      structure: {
        manuscripts: [
          { items: [{ kind: "scene" }] },
          { items: [{ kind: "chapter", source: { path: "Manuscript/book-two.md" }, children: [] }] },
        ],
      },
    });
  });

  it("separates malformed, invalid, and newer versions", () => {
    expect(parseManuscriptStructure("{")).toMatchObject({ kind: "malformed" });
    expect(parseManuscriptStructure("[]")).toEqual({
      kind: "invalid",
      issues: [{ path: "$", message: "The structure file must be a JSON object." }],
    });
    expect(
      parseManuscriptStructure(JSON.stringify({ formatVersion: 2 })),
    ).toEqual({ kind: "unsupported-version", version: 2 });
  });

  it("rejects unsafe source paths and unsupported item shapes", () => {
    const result = parseManuscriptStructure(
      validSource({
        manuscripts: [
          {
            id: MANUSCRIPT_ID,
            title: "Book",
            items: [
              chapter({
                folder: "../Escape",
                overview: { path: "notes.txt" },
                source: { path: "chapter.md" },
                children: [
                  scene({
                    source: { path: "Manuscript\\scene.md" },
                    children: [],
                    folder: "Manuscript",
                    overview: { path: "overview.md" },
                  }),
                ],
              }),
            ],
          },
        ],
      }),
    );

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.manuscripts[0].items[0].folder" }),
        expect.objectContaining({ path: "$.manuscripts[0].items[0].overview.path" }),
        expect.objectContaining({ path: "$.manuscripts[0].items[0].children[0].source.path" }),
        expect.objectContaining({ path: "$.manuscripts[0].items[0].children[0].children" }),
        expect.objectContaining({ path: "$.manuscripts[0].items[0].children[0].folder" }),
        expect.objectContaining({ path: "$.manuscripts[0].items[0].children[0].overview" }),
      ]),
    );
    expect(result.issues.some(({ message }) => message.includes("both its own prose"))).toBe(true);
  });

  it("rejects nested chapters and scenes without prose sources", () => {
    const result = parseManuscriptStructure(
      validSource({
        manuscripts: [
          {
            id: MANUSCRIPT_ID,
            title: "Book",
            items: [
              chapter({
                children: [
                  chapter({ id: "a399c50b-924c-479c-8b26-290982630fd4", children: [] }),
                  scene({ id: "a46c0de9-bf45-40b0-8ee5-1063c18e0cbf", source: undefined }),
                ],
              }),
            ],
          },
        ],
      }),
    );

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "A chapter must not be nested inside another chapter." }),
        expect.objectContaining({ message: "A scene source is required." }),
      ]),
    );
  });

  it("rejects duplicate identities and repeated source bindings", () => {
    const duplicateScene = scene({
      source: {
        path: "Manuscript/other.md",
        noteId: SCENE_NOTE_ID,
      },
    });
    const repeatedPath = scene({
      id: "cfbf7387-ae17-42dc-a725-717dc45dc8c2",
      source: { path: "Manuscript/01 Signals/chapter.md" },
    });
    const result = parseManuscriptStructure(
      validSource({
        manuscripts: [
          {
            id: MANUSCRIPT_ID,
            title: "Book One",
            items: [chapter(), duplicateScene, repeatedPath],
          },
          { id: MANUSCRIPT_ID, title: "Book Two", items: [] },
        ],
      }),
    );

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.issues.filter(({ message }) => message.startsWith("Duplicate"))).toHaveLength(4);
    expect(result.issues.map(({ message }) => message).join(" ")).toContain("manuscript ID");
    expect(result.issues.map(({ message }) => message).join(" ")).toContain("outline item ID");
    expect(result.issues.map(({ message }) => message).join(" ")).toContain("source path");
    expect(result.issues.map(({ message }) => message).join(" ")).toContain("source note ID");
  });

  it("bounds labels, metadata, target words, issue output, and file bytes", () => {
    const tooManyInvalidLabels = Array.from({ length: 140 }, () => "");
    const result = parseManuscriptStructure(
      validSource({
        manuscripts: [
          {
            id: MANUSCRIPT_ID,
            title: "Book",
            items: [
              chapter({
                labels: tooManyInvalidLabels,
                synopsis: "x".repeat(10_001),
                status: "x".repeat(241),
                targetWords: 10_000_001,
                includeInCompile: "yes",
              }),
            ],
          },
        ],
      }),
    );

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.issues.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "$.manuscripts[0].items[0].labels",
        "$.manuscripts[0].items[0].synopsis",
        "$.manuscripts[0].items[0].status",
        "$.manuscripts[0].items[0].targetWords",
        "$.manuscripts[0].items[0].includeInCompile",
      ]),
    );

    const noisy = parseManuscriptStructure(
      validSource({
        manuscripts: Array.from({ length: 33 }, () => ({
          id: "bad",
          title: "",
          items: [{ id: "bad", kind: "other", title: "" }],
        })),
      }),
    );
    expect(noisy.kind).toBe("invalid");
    if (noisy.kind !== "invalid") return;
    expect(noisy.issues).toHaveLength(101);
    expect(noisy.issues.at(-1)?.message).toContain("Additional issues were omitted");
    expect(
      parseManuscriptStructure(`{"formatVersion":1,"padding":"${"x".repeat(MAX_MANUSCRIPT_STRUCTURE_BYTES)}"}`),
    ).toMatchObject({ kind: "invalid", issues: [{ path: "$" }] });
  });

  it("enforces the global outline-item limit without recursive traversal", () => {
    const items = Array.from({ length: MAX_MANUSCRIPT_ITEMS + 1 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      kind: "scene",
      title: `Scene ${index}`,
      source: { path: `Manuscript/scene-${index}.md` },
    }));
    const result = parseManuscriptStructure(
      validSource({ manuscripts: [{ id: MANUSCRIPT_ID, title: "Book", items }] }),
    );

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.issues).toContainEqual({
      path: "$.manuscripts[0].items",
      message: `The structure must contain at most ${MAX_MANUSCRIPT_ITEMS} outline items.`,
    });
  });

  it.each([
    ["", "non-empty"],
    ["/scene.md", "empty, . or .."],
    ["Manuscript/../scene.md", "empty, . or .."],
    ["Manuscript\\scene.md", "forward slashes"],
    ["Manuscript/scene.txt", "end with .md"],
  ])("rejects unsafe manuscript path %j", (path, message) => {
    expect(validateManuscriptFilePath(path)).toContain(message);
  });

  it("serializes a validated new structure deterministically", () => {
    const parsed = parseManuscriptStructure(validSource());
    expect(parsed.kind).toBe("valid");
    if (parsed.kind !== "valid") return;
    const serialized = serializeManuscriptStructure(parsed.structure);

    expect(serialized.endsWith("\n")).toBe(true);
    expect(serializeManuscriptStructure(parsed.structure)).toBe(serialized);
    expect(parseManuscriptStructure(serialized)).toMatchObject({ kind: "valid" });
    expect(JSON.parse(serialized)).toEqual({
      formatVersion: 1,
      manuscripts: [
        {
          id: MANUSCRIPT_ID,
          title: "The Patient Comet",
          items: [
            {
              id: CHAPTER_ID,
              kind: "chapter",
              title: "Signals in the Dust",
              folder: "Manuscript/01 Signals",
              overview: {
                path: "Manuscript/01 Signals/chapter.md",
                noteId: CHAPTER_NOTE_ID,
              },
              children: [
                {
                  id: SCENE_ID,
                  kind: "scene",
                  title: "The buried antenna",
                  source: {
                    path: "Manuscript/01 Signals/01 buried-antenna.md",
                    noteId: SCENE_NOTE_ID,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("rejects an invalid in-memory structure before serialization", () => {
    const invalid = {
      formatVersion: 1,
      manuscripts: [
        {
          id: MANUSCRIPT_ID,
          title: "Book",
          items: [
            {
              id: SCENE_ID,
              kind: "scene",
              title: "Scene",
              source: { path: "outside.txt" },
              includeInCompile: true,
            },
          ],
        },
      ],
    } as ManuscriptStructure;
    expect(() => serializeManuscriptStructure(invalid)).toThrow(
      /Cannot serialize manuscript structure/,
    );
    expect(() =>
      serializeManuscriptStructure({
        formatVersion: 2,
        manuscripts: [],
      } as unknown as ManuscriptStructure),
    ).toThrow(/formatVersion must be 1/);
  });
});
