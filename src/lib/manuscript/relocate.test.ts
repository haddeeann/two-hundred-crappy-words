import { describe, expect, it } from "vitest";

import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  manuscriptSceneMoveDestinations,
  planManuscriptSceneMove,
} from "./relocate";
import { executeManuscriptSceneMove } from "./relocate-execution";
import { undoManuscriptSourceRepair, type ManuscriptRepairIo } from "./repair-execution";
import {
  parseManuscriptStructure,
  type ManuscriptOutlineItem,
  type ManuscriptScene,
} from "./structure";

const FIRST_CHAPTER_ID = "422b34ce-2d0f-4916-a557-553fc95db31b";
const SECOND_CHAPTER_ID = "1dc37f05-e9b2-4600-98b3-137ecda49411";
const PROSE_CHAPTER_ID = "b87359fd-43ed-47eb-be8f-3f28d7e8be81";
const FIRST_SCENE_ID = "6eea7c60-8e12-4b9a-9716-f31cd3450eb3";
const SECOND_SCENE_ID = "44fe96d8-b53d-47c5-9518-c4c2f1859a48";
const LOOSE_SCENE_ID = "f94bb03e-81dc-4f58-83c2-ab204bcec5fb";

function sourceText(): string {
  return `${JSON.stringify({
    formatVersion: 1,
    futureRoot: "keep",
    manuscripts: [{
      id: "7339b0ee-5f87-493d-bcad-e56636d7cb26",
      title: "Book",
      items: [{
        kind: "chapter",
        id: FIRST_CHAPTER_ID,
        title: "Signals",
        futureChapter: { keep: true },
        children: [
          { kind: "scene", id: FIRST_SCENE_ID, title: "Arrival", source: { path: "arrival.md" }, synopsis: "One" },
          { kind: "scene", id: SECOND_SCENE_ID, title: "Reply", source: { path: "reply.md" }, labels: ["signal"], futureScene: 42 },
        ],
      }, {
        kind: "scene",
        id: LOOSE_SCENE_ID,
        title: "Interlude",
        source: { path: "interlude.md" },
        futureLoose: [1, 2],
      }, {
        kind: "chapter",
        id: SECOND_CHAPTER_ID,
        title: "Landfall",
        children: [],
      }, {
        kind: "chapter",
        id: PROSE_CHAPTER_ID,
        title: "Single-file chapter",
        source: { path: "single.md" },
      }],
    }, {
      id: "3f29df13-b994-43b0-8fc5-333e81881033",
      title: "Other book",
      items: [],
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
  return {
    item,
    folder: null,
    overview: null,
    source: item.source ? fakeBoundSource(item.source.path) : null,
    children: item.children.map(fakeScene),
  };
}

function fakeScene(item: ManuscriptScene) {
  return { item, source: fakeBoundSource(item.source.path) };
}

function fakeBoundSource(path: string) {
  return {
    kind: "ready" as const,
    declaredPath: path,
    resolvedPath: path,
    fingerprint: "source",
    bytes: 1,
    wordCount: 1,
  };
}

describe("manuscript scene relocation", () => {
  it("lists only legal containers in the same manuscript with exact insertion positions", () => {
    expect(manuscriptSceneMoveDestinations(project(), SECOND_SCENE_ID)).toEqual([
      {
        key: "manuscript:7339b0ee-5f87-493d-bcad-e56636d7cb26",
        label: "manuscript “Book” top level",
        arrayJsonPath: "$.manuscripts[0].items",
        positions: [
          { index: 0, label: "At beginning" },
          { index: 1, label: "After “Signals”" },
          { index: 2, label: "After “Interlude”" },
          { index: 3, label: "After “Landfall”" },
          { index: 4, label: "After “Single-file chapter”" },
        ],
      },
      {
        key: `chapter:${SECOND_CHAPTER_ID}`,
        label: "chapter “Landfall”",
        arrayJsonPath: "$.manuscripts[0].items[2].children",
        positions: [{ index: 0, label: "At beginning" }],
      },
    ]);
  });

  it("moves a scene from one chapter to another without changing the scene object", () => {
    const plan = planManuscriptSceneMove(project(), SECOND_SCENE_ID, `chapter:${SECOND_CHAPTER_ID}`, 0);
    if (plan.kind !== "ready") throw new Error(plan.reason);
    expect(plan.target).toMatchObject({
      sceneTitle: "Reply",
      sourceContainerLabel: "chapter “Signals”",
      destinationContainerLabel: "chapter “Landfall”",
      sourceArrayJsonPath: "$.manuscripts[0].items[0].children",
      destinationArrayJsonPath: "$.manuscripts[0].items[2].children",
      oldPosition: 2,
      newPosition: 1,
    });
    const after = JSON.parse(plan.updatedText);
    expect(after.manuscripts[0].items[0].children.map((item: { id: string }) => item.id))
      .toEqual([FIRST_SCENE_ID]);
    expect(after.manuscripts[0].items[2].children[0]).toMatchObject({
      id: SECOND_SCENE_ID,
      labels: ["signal"],
      futureScene: 42,
      source: { path: "reply.md" },
    });
    expect(after.futureRoot).toBe("keep");
  });

  it("moves a loose scene into a chapter and a nested scene to the top level", () => {
    const nested = planManuscriptSceneMove(project(), LOOSE_SCENE_ID, `chapter:${SECOND_CHAPTER_ID}`, 0);
    if (nested.kind !== "ready") throw new Error(nested.reason);
    const nestedJson = JSON.parse(nested.updatedText);
    expect(nestedJson.manuscripts[0].items.map((item: { id: string }) => item.id))
      .toEqual([FIRST_CHAPTER_ID, SECOND_CHAPTER_ID, PROSE_CHAPTER_ID]);
    expect(nestedJson.manuscripts[0].items[1].children[0].futureLoose).toEqual([1, 2]);

    const loose = planManuscriptSceneMove(
      project(),
      FIRST_SCENE_ID,
      "manuscript:7339b0ee-5f87-493d-bcad-e56636d7cb26",
      2,
    );
    if (loose.kind !== "ready") throw new Error(loose.reason);
    const looseJson = JSON.parse(loose.updatedText);
    expect(looseJson.manuscripts[0].items.map((item: { id: string }) => item.id))
      .toEqual([FIRST_CHAPTER_ID, LOOSE_SCENE_ID, FIRST_SCENE_ID, SECOND_CHAPTER_ID, PROSE_CHAPTER_ID]);
    expect(looseJson.manuscripts[0].items[2]).toMatchObject({
      id: FIRST_SCENE_ID,
      synopsis: "One",
      source: { path: "arrival.md" },
    });
  });

  it("refuses same-container, invalid-position, chapter, and unknown-item requests", () => {
    const result = project();
    expect(planManuscriptSceneMove(result, FIRST_SCENE_ID, `chapter:${FIRST_CHAPTER_ID}`, 0))
      .toMatchObject({ kind: "unavailable" });
    expect(planManuscriptSceneMove(result, LOOSE_SCENE_ID, `chapter:${SECOND_CHAPTER_ID}`, 2))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("position") });
    expect(planManuscriptSceneMove(result, FIRST_CHAPTER_ID, `chapter:${SECOND_CHAPTER_ID}`, 0))
      .toMatchObject({ kind: "unavailable" });
    expect(planManuscriptSceneMove(result, "missing", `chapter:${SECOND_CHAPTER_ID}`, 0))
      .toMatchObject({ kind: "unavailable" });
  });

  it("plans from proxy-backed data without mutating the verified input", () => {
    const result = project();
    const originalSource = JSON.stringify(result.source);
    const proxied = { ...result, source: new Proxy(result.source, {}) };
    expect(planManuscriptSceneMove(proxied, SECOND_SCENE_ID, `chapter:${SECOND_CHAPTER_ID}`, 0))
      .toMatchObject({ kind: "ready" });
    expect(JSON.stringify(result.source)).toBe(originalSource);
  });

  it("rechecks, replaces, rereads, and restores exact bytes through shared Undo", async () => {
    let text = sourceText();
    const plan = planManuscriptSceneMove(project(text), SECOND_SCENE_ID, `chapter:${SECOND_CHAPTER_ID}`, 0);
    if (plan.kind !== "ready") throw new Error(plan.reason);
    const io: ManuscriptRepairIo = {
      async reload() { return project(text); },
      async replaceAtomic(expectedText, newText) {
        if (text !== expectedText) throw new Error("changed");
        text = newText;
      },
    };
    const moved = await executeManuscriptSceneMove(plan, io);
    expect(moved).toMatchObject({ kind: "success" });
    if (moved.kind !== "success") throw new Error(moved.message);
    expect(JSON.parse(text).manuscripts[0].items[2].children[0].id).toBe(SECOND_SCENE_ID);
    expect(await undoManuscriptSourceRepair(moved.undo, io)).toMatchObject({ kind: "success" });
    expect(text).toBe(sourceText());
  });

  it("writes nothing after an external structure change or atomic failure", async () => {
    let text = sourceText();
    const plan = planManuscriptSceneMove(project(text), LOOSE_SCENE_ID, `chapter:${SECOND_CHAPTER_ID}`, 0);
    if (plan.kind !== "ready") throw new Error(plan.reason);
    text = `${text.trimEnd()} \n`;
    let writes = 0;
    expect(await executeManuscriptSceneMove(plan, {
      async reload() { return project(text); },
      async replaceAtomic() { writes += 1; },
    })).toMatchObject({ kind: "failed", message: expect.stringContaining("changed after preview") });
    expect(writes).toBe(0);

    text = sourceText();
    expect(await executeManuscriptSceneMove(plan, {
      async reload() { return project(text); },
      async replaceAtomic() { throw new Error("permission denied"); },
    })).toMatchObject({ kind: "failed", message: expect.stringContaining("permission denied") });
    expect(text).toBe(sourceText());
  });
});
