import { describe, expect, it } from "vitest";

import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  canReorderManuscriptItem,
  planManuscriptReorder,
} from "./reorder";
import {
  parseManuscriptStructure,
  type ManuscriptOutlineItem,
  type ManuscriptScene,
} from "./structure";

const FIRST_CHAPTER_ID = "422b34ce-2d0f-4916-a557-553fc95db31b";
const SECOND_CHAPTER_ID = "1dc37f05-e9b2-4600-98b3-137ecda49411";
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
          { kind: "scene", id: SECOND_SCENE_ID, title: "Reply", source: { path: "reply.md" }, labels: ["signal"] },
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
  return {
    item,
    folder: null,
    overview: null,
    source: null,
    children: item.children.map(fakeScene),
  };
}

function fakeScene(item: ManuscriptScene) {
  return {
    item,
    source: {
      kind: "ready" as const,
      declaredPath: item.source.path,
      resolvedPath: item.source.path,
      fingerprint: "source",
      bytes: 1,
    },
  };
}

describe("manuscript reorder planning", () => {
  it("moves a nested scene one sibling earlier without changing its values", () => {
    const plan = planManuscriptReorder(project(), SECOND_SCENE_ID, "earlier");
    expect(plan).toMatchObject({
      kind: "ready",
      target: {
        itemTitle: "Reply",
        neighborTitle: "Arrival",
        direction: "earlier",
        oldPosition: 2,
        newPosition: 1,
        arrayJsonPath: "$.manuscripts[0].items[0].children",
      },
    });
    if (plan.kind !== "ready") throw new Error(plan.reason);
    const after = JSON.parse(plan.updatedText);
    expect(after.manuscripts[0].items[0].children.map((item: { id: string }) => item.id))
      .toEqual([SECOND_SCENE_ID, FIRST_SCENE_ID]);
    expect(after.manuscripts[0].items[0].children[0]).toMatchObject({
      labels: ["signal"],
      source: { path: "reply.md" },
    });
    expect(after.manuscripts[0].items[0].futureChapter).toEqual({ keep: true });
    expect(after.futureRoot).toBe("keep");
  });

  it("moves top-level chapters and loose scenes within one shared order", () => {
    const plan = planManuscriptReorder(project(), LOOSE_SCENE_ID, "later");
    if (plan.kind !== "ready") throw new Error(plan.reason);
    expect(plan.target).toMatchObject({
      itemTitle: "Interlude",
      neighborTitle: "Landfall",
      oldPosition: 2,
      newPosition: 3,
      arrayJsonPath: "$.manuscripts[0].items",
    });
    const items = JSON.parse(plan.updatedText).manuscripts[0].items;
    expect(items.map((item: { id: string }) => item.id))
      .toEqual([FIRST_CHAPTER_ID, SECOND_CHAPTER_ID, LOOSE_SCENE_ID]);
    expect(items[2].futureLoose).toEqual([1, 2]);
  });

  it("reports exact sibling boundaries and unavailable items", () => {
    const result = project();
    expect(canReorderManuscriptItem(result, FIRST_CHAPTER_ID, "earlier")).toBe(false);
    expect(canReorderManuscriptItem(result, FIRST_CHAPTER_ID, "later")).toBe(true);
    expect(canReorderManuscriptItem(result, FIRST_SCENE_ID, "earlier")).toBe(false);
    expect(canReorderManuscriptItem(result, FIRST_SCENE_ID, "later")).toBe(true);
    expect(planManuscriptReorder(result, SECOND_CHAPTER_ID, "later"))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("already last") });
    expect(planManuscriptReorder(result, "missing", "earlier"))
      .toMatchObject({ kind: "unavailable" });
  });

  it("plans safely from a proxy-backed source and does not mutate the input", () => {
    const result = project();
    const originalSource = JSON.stringify(result.source);
    const proxied = { ...result, source: new Proxy(result.source, {}) };
    expect(planManuscriptReorder(proxied, SECOND_CHAPTER_ID, "earlier"))
      .toMatchObject({ kind: "ready" });
    expect(JSON.stringify(result.source)).toBe(originalSource);
  });
});
