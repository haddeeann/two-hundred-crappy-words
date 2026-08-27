import { describe, expect, it } from "vitest";

import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  planManuscriptSceneSplit,
  suggestSplitScenePath,
  type ManuscriptSceneSplitRequest,
} from "./split";
import {
  parseManuscriptStructure,
  type ManuscriptOutlineItem,
  type ManuscriptScene,
} from "./structure";

const CHAPTER_ID = "422b34ce-2d0f-4916-a557-553fc95db31b";
const SCENE_ID = "6eea7c60-8e12-4b9a-9716-f31cd3450eb3";
const LOOSE_ID = "f94bb03e-81dc-4f58-83c2-ab204bcec5fb";
const NEW_SCENE_ID = "44fe96d8-b53d-47c5-9518-c4c2f1859a48";
const SOURCE_TEXT = "The signal arrived.\n\nMara answered from the dark.\n";

function sourceText(): string {
  return `${JSON.stringify({
    formatVersion: 1,
    futureRoot: "keep",
    manuscripts: [{
      id: "7339b0ee-5f87-493d-bcad-e56636d7cb26",
      title: "Book",
      items: [{
        kind: "chapter",
        id: CHAPTER_ID,
        title: "Signals",
        children: [{
          kind: "scene",
          id: SCENE_ID,
          title: "Arrival",
          source: { path: "Manuscript/Signals/arrival.md", futureBinding: true },
          synopsis: "Keep me on the left",
          includeInCompile: false,
          futureScene: { keep: true },
        }],
      }, {
        kind: "scene",
        id: LOOSE_ID,
        title: "Interlude",
        source: { path: "Manuscript/interlude.md" },
      }],
    }],
  }, null, 2)}\n`;
}

function project(text = sourceText()): Extract<ManuscriptProjectLoadResult, { kind: "ready" }> {
  const parsed = parseManuscriptStructure(text);
  if (parsed.kind !== "valid") throw new Error(`invalid fixture: ${parsed.kind}`);
  return {
    kind: "ready",
    fingerprint: fingerprintContent(text),
    text,
    source: parsed.source,
    reconciled: {
      structure: parsed.structure,
      manuscripts: parsed.structure.manuscripts.map((manuscript) => ({
        manuscript,
        items: manuscript.items.map(fakeReconciledItem),
      })),
      acceptedSourceBytes: 0,
      readSourceBytes: 0,
    },
  };
}

function fakeReconciledItem(item: ManuscriptOutlineItem) {
  if (item.kind === "scene") return fakeScene(item);
  return { item, folder: null, overview: null, source: null, children: item.children.map(fakeScene) };
}

function fakeScene(item: ManuscriptScene) {
  const text = item.id === SCENE_ID ? SOURCE_TEXT : "Loose prose.";
  return {
    item,
    source: {
      kind: "ready" as const,
      declaredPath: item.source.path,
      resolvedPath: item.source.path,
      fingerprint: fingerprintContent(text),
      bytes: new TextEncoder().encode(text).byteLength,
      wordCount: 1,
    },
  };
}

function request(overrides: Partial<ManuscriptSceneSplitRequest> = {}): ManuscriptSceneSplitRequest {
  const caretOffset = SOURCE_TEXT.indexOf("Mara");
  return {
    sourcePath: "Manuscript/Signals/arrival.md",
    sourceText: SOURCE_TEXT,
    sourceFingerprint: fingerprintContent(SOURCE_TEXT),
    caretOffset,
    newSceneId: NEW_SCENE_ID,
    newSceneTitle: "The answer",
    newSourcePath: "Manuscript/Signals/arrival-part-2.md",
    ...overrides,
  };
}

function projectWithSceneText(text: string) {
  const result = project();
  const chapter = result.reconciled.manuscripts[0]!.items[0];
  if (!chapter || !("children" in chapter) || chapter.children[0]!.source.kind !== "ready") {
    throw new Error("fixture");
  }
  chapter.children[0]!.source.fingerprint = fingerprintContent(text);
  return result;
}

describe("manuscript scene split planning", () => {
  it("keeps the complete original object on the left and inserts one minimal excluded scene", () => {
    const plan = planManuscriptSceneSplit(project(), request());
    if (plan.kind !== "ready") throw new Error(plan.reason);
    expect(plan.target).toMatchObject({
      manuscriptTitle: "Book",
      sceneTitle: "Arrival",
      containerLabel: "chapter “Signals”",
      arrayJsonPath: "$.manuscripts[0].items[0].children",
      oldPosition: 1,
      newPosition: 2,
      newSceneTitle: "The answer",
    });
    expect(plan.leftSourceText + plan.rightSourceText).toBe(SOURCE_TEXT);
    expect(plan.leftSourceText).toBe("The signal arrived.\n\n");
    expect(plan.rightSourceText).toBe("Mara answered from the dark.\n");
    const after = JSON.parse(plan.updatedStructureText);
    const [left, right] = after.manuscripts[0].items[0].children;
    expect(left).toMatchObject({
      id: SCENE_ID,
      synopsis: "Keep me on the left",
      futureScene: { keep: true },
      source: { path: "Manuscript/Signals/arrival.md", futureBinding: true },
    });
    expect(right).toEqual({
      id: NEW_SCENE_ID,
      kind: "scene",
      title: "The answer",
      source: { path: "Manuscript/Signals/arrival-part-2.md" },
      includeInCompile: false,
    });
    expect(after.futureRoot).toBe("keep");
  });

  it("inserts a new loose scene directly after its source without copying inclusion defaults", () => {
    const looseText = "First half. Second half.";
    const result = project();
    const loose = result.reconciled.manuscripts[0]!.items[1];
    if (!loose || "children" in loose || loose.source.kind !== "ready") throw new Error("fixture");
    loose.source.fingerprint = fingerprintContent(looseText);
    const plan = planManuscriptSceneSplit(result, request({
      sourcePath: "Manuscript/interlude.md",
      sourceText: looseText,
      sourceFingerprint: fingerprintContent(looseText),
      caretOffset: looseText.indexOf("Second"),
      newSourcePath: "Manuscript/interlude-part-2.md",
    }));
    if (plan.kind !== "ready") throw new Error(plan.reason);
    expect(plan.target).toMatchObject({
      containerLabel: "manuscript “Book” top level",
      arrayJsonPath: "$.manuscripts[0].items",
      oldPosition: 2,
      newPosition: 3,
    });
    const items = JSON.parse(plan.updatedStructureText).manuscripts[0].items;
    expect(items.map((item: { id: string }) => item.id)).toEqual([CHAPTER_ID, LOOSE_ID, NEW_SCENE_ID]);
    expect(items[2]).not.toHaveProperty("includeInCompile");
  });

  it("refuses unverified sources, changed text, and invalid caret boundaries", () => {
    expect(planManuscriptSceneSplit(project(), request({ sourcePath: "missing.md" })))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("exactly one") });
    expect(planManuscriptSceneSplit(project(), request({ sourceText: `${SOURCE_TEXT}changed` })))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("no longer matches") });
    for (const caretOffset of [0, SOURCE_TEXT.length]) {
      expect(planManuscriptSceneSplit(project(), request({ caretOffset })))
        .toMatchObject({ kind: "unavailable" });
    }
    const unicodeText = "Left😀Right";
    expect(planManuscriptSceneSplit(projectWithSceneText(unicodeText), request({
      sourceText: unicodeText,
      sourceFingerprint: fingerprintContent(unicodeText),
      caretOffset: 5,
    }))).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("Unicode") });
    const whitespaceText = "   Prose";
    expect(planManuscriptSceneSplit(projectWithSceneText(whitespaceText), request({
      sourceText: whitespaceText,
      sourceFingerprint: fingerprintContent(whitespaceText),
      caretOffset: 2,
    })))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("non-whitespace") });
  });

  it("refuses invalid or duplicate identity, title, and source paths through full validation", () => {
    expect(planManuscriptSceneSplit(project(), request({ newSceneId: "not-a-uuid" })))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("id") });
    expect(planManuscriptSceneSplit(project(), request({ newSceneId: SCENE_ID })))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("Duplicate") });
    expect(planManuscriptSceneSplit(project(), request({ newSceneTitle: " " })))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("title") });
    expect(planManuscriptSceneSplit(project(), request({ newSourcePath: "../escape.md" })))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("path") });
    expect(planManuscriptSceneSplit(project(), request({ newSourcePath: "Manuscript/interlude.md" })))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("Duplicate") });
  });

  it("plans from proxy-backed data without mutating the verified input", () => {
    const result = project();
    const before = JSON.stringify(result.source);
    const proxied = { ...result, source: new Proxy(result.source, {}) };
    expect(planManuscriptSceneSplit(proxied, request())).toMatchObject({ kind: "ready" });
    expect(JSON.stringify(result.source)).toBe(before);
  });

  it("suggests portable sibling filenames without changing the extension", () => {
    expect(suggestSplitScenePath("Manuscript/arrival.md")).toBe("Manuscript/arrival-part-2.md");
    expect(suggestSplitScenePath("arrival.markdown", 4)).toBe("arrival-part-4.markdown");
    expect(suggestSplitScenePath("arrival")).toBe("arrival-part-2.md");
  });
});
