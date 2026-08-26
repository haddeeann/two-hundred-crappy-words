import { describe, expect, it } from "vitest";

import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  manuscriptMetadataEditorState,
  planManuscriptMetadataEdit,
  type ManuscriptMetadataDraft,
} from "./metadata";
import { parseManuscriptStructure } from "./structure";

const MANUSCRIPT_ID = "7339b0ee-5f87-493d-bcad-e56636d7cb26";
const CHAPTER_ID = "422b34ce-2d0f-4916-a557-553fc95db31b";
const SCENE_ID = "6eea7c60-8e12-4b9a-9716-f31cd3450eb3";

function sourceText(): string {
  return `${JSON.stringify({
    formatVersion: 1,
    futureRoot: "keep",
    manuscripts: [{
      id: MANUSCRIPT_ID,
      title: "Book",
      futureBook: { keep: true },
      items: [{
        id: CHAPTER_ID,
        kind: "chapter",
        title: "Signals",
        synopsis: "Old synopsis",
        status: "draft",
        children: [{
          id: SCENE_ID,
          kind: "scene",
          title: "Arrival",
          labels: ["opening"],
          includeInCompile: false,
          source: { path: "arrival.md" },
          futureScene: [1, 2, 3],
        }],
      }],
    }],
  }, null, 2)}\n`;
}

function project(text = sourceText()): Extract<ManuscriptProjectLoadResult, { kind: "ready" }> {
  const parsed = parseManuscriptStructure(text);
  if (parsed.kind !== "valid") throw new Error(`invalid fixture: ${parsed.kind}`);
  const manuscript = parsed.structure.manuscripts[0]!;
  const chapter = manuscript.items[0]!;
  if (chapter.kind !== "chapter") throw new Error("expected chapter");
  const scene = chapter.children[0]!;
  return {
    kind: "ready",
    fingerprint: fingerprintContent(text),
    text,
    source: parsed.source,
    reconciled: {
      structure: parsed.structure,
      manuscripts: [{
        manuscript,
        items: [{
          item: chapter,
          folder: null,
          overview: null,
          source: null,
          children: [{
            item: scene,
            source: {
              kind: "ready",
              declaredPath: "arrival.md",
              resolvedPath: "arrival.md",
              fingerprint: "source",
              bytes: 12,
            },
          }],
        }],
      }],
      acceptedSourceBytes: 12,
      readSourceBytes: 12,
    },
  };
}

function draft(overrides: Partial<ManuscriptMetadataDraft> = {}): ManuscriptMetadataDraft {
  const state = manuscriptMetadataEditorState(project(), SCENE_ID);
  if (state.kind !== "ready") throw new Error(state.reason);
  return { ...state.draft, ...overrides };
}

describe("manuscript metadata edit planning", () => {
  it("loads a nested scene into a human-editable draft", () => {
    expect(manuscriptMetadataEditorState(project(), SCENE_ID)).toMatchObject({
      kind: "ready",
      target: {
        itemKind: "scene",
        itemTitle: "Arrival",
        jsonPath: "$.manuscripts[0].items[0].children[0]",
      },
      draft: {
        title: "Arrival",
        labels: "opening",
        includeInCompile: false,
        targetWords: "",
      },
    });
  });

  it("previews exact changed fields and preserves unknown JSON", () => {
    const result = project();
    const plan = planManuscriptMetadataEdit(result, SCENE_ID, draft({
      title: "  First arrival  ",
      synopsis: "  A threshold crossing.  ",
      pov: "Mara Venn",
      location: "Aster Vale",
      storyDate: "Orbit 41",
      status: "revised",
      labels: "opening\nmystery",
      notes: "  Keep the sender uncertain.\nTry silence.  ",
      targetWords: "1200",
      includeInCompile: true,
    }));
    expect(plan).toMatchObject({
      kind: "ready",
      changes: expect.arrayContaining([
        expect.objectContaining({ jsonPath: "$.manuscripts[0].items[0].children[0].title", before: "Arrival", after: "First arrival" }),
        expect.objectContaining({ jsonPath: "$.manuscripts[0].items[0].children[0].includeInCompile", before: "Excluded", after: "Included" }),
      ]),
    });
    if (plan.kind !== "ready") throw new Error(plan.kind);
    const after = JSON.parse(plan.updatedText);
    const scene = after.manuscripts[0].items[0].children[0];
    expect(scene).toMatchObject({
      title: "First arrival",
      synopsis: "A threshold crossing.",
      pov: "Mara Venn",
      location: "Aster Vale",
      storyDate: "Orbit 41",
      status: "revised",
      labels: ["opening", "mystery"],
      notes: "Keep the sender uncertain.\nTry silence.",
      targetWords: 1200,
      futureScene: [1, 2, 3],
    });
    expect(scene).not.toHaveProperty("includeInCompile");
    expect(after.futureRoot).toBe("keep");
    expect(after.manuscripts[0].futureBook).toEqual({ keep: true });
  });

  it("removes cleared optional metadata and distinguishes an unchanged draft", () => {
    expect(planManuscriptMetadataEdit(project(), SCENE_ID, draft())).toMatchObject({ kind: "unchanged" });
    const chapterState = manuscriptMetadataEditorState(project(), CHAPTER_ID);
    if (chapterState.kind !== "ready") throw new Error(chapterState.reason);
    const plan = planManuscriptMetadataEdit(project(), CHAPTER_ID, {
      ...chapterState.draft,
      synopsis: "",
      status: "",
    });
    if (plan.kind !== "ready") throw new Error(plan.kind);
    const chapter = JSON.parse(plan.updatedText).manuscripts[0].items[0];
    expect(chapter).not.toHaveProperty("synopsis");
    expect(chapter).not.toHaveProperty("status");
  });

  it("returns bounded parser issues for invalid fields", () => {
    expect(planManuscriptMetadataEdit(project(), SCENE_ID, draft({ title: " " }))).toMatchObject({
      kind: "blocked",
      issues: [{ path: "$.manuscripts[0].items[0].children[0].title" }],
    });
    expect(planManuscriptMetadataEdit(project(), SCENE_ID, draft({ labels: "same\nsame" }))).toMatchObject({
      kind: "blocked",
      issues: [{ path: "$.manuscripts[0].items[0].children[0].labels[1]" }],
    });
    expect(planManuscriptMetadataEdit(project(), SCENE_ID, draft({ targetWords: "12.5" }))).toEqual({
      kind: "blocked",
      issues: [{
        path: "$.manuscripts[0].items[0].children[0].targetWords",
        message: "Word target must be a whole number.",
      }],
    });
  });

  it("plans from proxy-backed source JSON and refuses stale item IDs", () => {
    const result = project();
    const proxied = { ...result, source: new Proxy(result.source, {}) };
    expect(planManuscriptMetadataEdit(proxied, SCENE_ID, draft({ status: "done" })))
      .toMatchObject({ kind: "ready" });
    expect(manuscriptMetadataEditorState(result, "missing")).toMatchObject({ kind: "unavailable" });
  });
});
