import { describe, expect, it } from "vitest";
import { fingerprintContent } from "$lib/editor/recovery";
import {
  markdownToReadableText,
  planManuscriptCompile,
} from "./compile";
import type {
  ManuscriptProjectLoadResult,
  ManuscriptSourceState,
  ReconciledManuscriptScene,
} from "./source-reconciliation";
import type { ManuscriptScene } from "./structure";

const MANUSCRIPT_ID = "7339b0ee-5f87-493d-bcad-e56636d7cb26";
const CHAPTER_ID = "422b34ce-2d0f-4916-a557-553fc95db31b";

function scene(
  id: string,
  title: string,
  path: string,
  text: string,
  includeInCompile = true,
): ReconciledManuscriptScene {
  const item: ManuscriptScene = {
    id,
    kind: "scene",
    title,
    source: { path },
    includeInCompile,
    synopsis: `Planning synopsis for ${title}`,
  };
  return {
    item,
    source: {
      kind: "ready",
      declaredPath: path,
      resolvedPath: path,
      bytes: new TextEncoder().encode(text).byteLength,
      fingerprint: fingerprintContent(text),
      wordCount: 0,
    },
  };
}

function project({
  firstText,
  secondText,
  excludedText,
  firstState,
}: {
  firstText: string;
  secondText: string;
  excludedText: string;
  firstState?: ManuscriptSourceState;
}): Extract<ManuscriptProjectLoadResult, { kind: "ready" }> {
  const first = scene(
    "b94fc398-9156-46d2-a48b-93e3c40ee638",
    "Planning title one",
    "Manuscript/one.md",
    firstText,
  );
  if (firstState) first.source = firstState;
  const second = scene(
    "07aad09d-09d2-4dd1-9236-28bf4ec07d38",
    "Planning title two",
    "Manuscript/two.md",
    secondText,
  );
  const excluded = scene(
    "37697c81-ab6c-4ea2-87c6-ef0f28b6d2c4",
    "Cut material",
    "Manuscript/cut.md",
    excludedText,
    false,
  );
  const structure = {
    formatVersion: 1 as const,
    manuscripts: [
      {
        id: MANUSCRIPT_ID,
        title: "The Patient Comet",
        items: [
          {
            id: CHAPTER_ID,
            kind: "chapter" as const,
            title: "Signals in the Dust",
            includeInCompile: true,
            children: [first.item, second.item, excluded.item],
          },
        ],
      },
    ],
  };
  return {
    kind: "ready",
    fingerprint: "structure-fingerprint",
    text: JSON.stringify(structure),
    source: structuredClone(structure) as unknown as Record<string, unknown>,
    reconciled: {
      structure,
      acceptedSourceBytes: 0,
      readSourceBytes: 0,
      manuscripts: [
        {
          manuscript: structure.manuscripts[0]!,
          items: [
            {
              item: structure.manuscripts[0]!.items[0]!,
              folder: null,
              overview: null,
              source: null,
              children: [first, second, excluded],
            },
          ],
        },
      ],
    },
  };
}

describe("verified manuscript compile planning", () => {
  const firstText = `---\nid: "b94fc398-9156-46d2-a48b-93e3c40ee638"\ntitle: Hidden metadata\n---\n\nMara hears **the signal**.\n`;
  const secondText = "The answer crosses the dark.\n";
  const excludedText = "This draft stays out.\n";

  it("renders exact structure order without scene titles or planning metadata", () => {
    const result = planManuscriptCompile({
      project: project({ firstText, secondText, excludedText }),
      manuscriptId: MANUSCRIPT_ID,
      format: "markdown",
      sourceTexts: new Map([
        ["Manuscript/one.md", firstText],
        ["Manuscript/two.md", secondText],
      ]),
    });

    expect(result).toMatchObject({
      kind: "ready",
      suggestedFilename: "The Patient Comet.md",
      summary: { chapters: 1, scenes: 2, words: 9, excludedItems: 1 },
    });
    if (result.kind !== "ready") throw new Error("fixture");
    expect(result.output).toBe(
      "# The Patient Comet\n\n## Signals in the Dust\n\nMara hears **the signal**.\n\n* * *\n\nThe answer crosses the dark.\n",
    );
    expect(result.output).not.toContain("Planning title");
    expect(result.output).not.toContain("Planning synopsis");
    expect(result.output).not.toContain("Hidden metadata");
    expect(result.entries.at(-1)).toMatchObject({
      title: "Cut material",
      included: false,
    });
  });

  it("creates a readable plain-text copy while retaining visible words", () => {
    const result = planManuscriptCompile({
      project: project({ firstText, secondText, excludedText }),
      manuscriptId: MANUSCRIPT_ID,
      format: "text",
      sourceTexts: new Map([
        ["Manuscript/one.md", firstText],
        ["Manuscript/two.md", secondText],
      ]),
    });
    if (result.kind !== "ready") throw new Error("fixture");
    expect(result.suggestedFilename).toBe("The Patient Comet.txt");
    expect(result.output).toContain("The Patient Comet\n=================");
    expect(result.output).toContain("Signals in the Dust\n-------------------");
    expect(result.output).toContain("Mara hears the signal.");
    expect(result.output).toContain("* * *");
    expect(result.output).not.toContain("**");
  });

  it.each([
    ["epub", "The Patient Comet.epub"],
    ["pdf", "The Patient Comet.pdf"],
  ] as const)("retains exact verified section tokens for a %s package", (format, suggestedFilename) => {
    const result = planManuscriptCompile({
      project: project({ firstText, secondText, excludedText }),
      manuscriptId: MANUSCRIPT_ID,
      format,
      sourceTexts: new Map([
        ["Manuscript/one.md", firstText],
        ["Manuscript/two.md", secondText],
      ]),
    });
    expect(result).toMatchObject({
      kind: "ready",
      suggestedFilename,
      tokens: [
        { kind: "chapter", title: "Signals in the Dust" },
        { kind: "scene", chapterTitle: "Signals in the Dust" },
        { kind: "scene", chapterTitle: "Signals in the Dust" },
      ],
    });
  });

  it("blocks unavailable, omitted, or fingerprint-changed included sources", () => {
    const missingProject = project({
      firstText,
      secondText,
      excludedText,
      firstState: {
        kind: "missing",
        declaredPath: "Manuscript/one.md",
        message: "The recorded Markdown source is missing.",
      },
    });
    expect(
      planManuscriptCompile({
        project: missingProject,
        manuscriptId: MANUSCRIPT_ID,
        format: "markdown",
        sourceTexts: new Map([["Manuscript/two.md", secondText]]),
      }),
    ).toMatchObject({
      kind: "blocked",
      blockers: [{ sourceKind: "missing", sourcePath: "Manuscript/one.md" }],
    });

    expect(
      planManuscriptCompile({
        project: project({ firstText, secondText, excludedText }),
        manuscriptId: MANUSCRIPT_ID,
        format: "markdown",
        sourceTexts: new Map([
          ["Manuscript/one.md", `${firstText}changed`],
          ["Manuscript/two.md", secondText],
        ]),
      }),
    ).toMatchObject({ kind: "blocked", blockers: [{ sourceKind: "changed" }] });
  });

  it("does not require a source for material deliberately excluded by its parent", () => {
    const value = project({ firstText, secondText, excludedText });
    const chapter = value.reconciled.manuscripts[0]!.items[0]!;
    if (!("children" in chapter)) throw new Error("fixture");
    chapter.item.includeInCompile = false;
    chapter.children[0]!.source = {
      kind: "missing",
      declaredPath: "Manuscript/one.md",
      message: "missing",
    };
    const result = planManuscriptCompile({
      project: value,
      manuscriptId: MANUSCRIPT_ID,
      format: "markdown",
      sourceTexts: new Map(),
    });
    expect(result).toMatchObject({
      kind: "ready",
      summary: { chapters: 0, scenes: 0, excludedItems: 4 },
      blockers: [],
    });
  });
});

describe("plain-text Markdown conversion", () => {
  it("removes familiar notation but preserves labels, code, lists, and unknown syntax", () => {
    const source = [
      "# Heading",
      "",
      "> A **bold** [label](https://example.test) and [[Lore/path|wiki label]].",
      "",
      "- Keep the list",
      "- Keep `literal_code()` too",
      "",
      "::: unfamiliar directive :::",
    ].join("\n");
    expect(markdownToReadableText(source)).toBe([
      "Heading",
      "",
      "A bold label and wiki label.",
      "",
      "- Keep the list",
      "- Keep literal_code() too",
      "",
      "::: unfamiliar directive :::",
    ].join("\n"));
  });
});
