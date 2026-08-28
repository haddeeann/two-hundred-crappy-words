import { describe, expect, it } from "vitest";

import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  manuscriptSceneMergeAvailability,
  planManuscriptSceneMerge,
  suggestRetiredScenePath,
  type ManuscriptSceneMergeRequest,
} from "./merge";
import { parseManuscriptStructure, type ManuscriptOutlineItem } from "./structure";

const LEFT_ID = "6eea7c60-8e12-4b9a-9716-f31cd3450eb3";
const RIGHT_ID = "44fe96d8-b53d-47c5-9518-c4c2f1859a48";
const LEFT_PATH = "Manuscript/Signals/arrival.md";
const RIGHT_PATH = "Manuscript/Signals/arrival-part-2.md";
const LEFT_TEXT = "The signal arrived.";
const RIGHT_TEXT = "Mara answered.\n";

function structureText(rightChanges: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    formatVersion: 1,
    futureRoot: "keep",
    manuscripts: [{
      id: "7339b0ee-5f87-493d-bcad-e56636d7cb26",
      title: "Book",
      items: [{
        kind: "chapter",
        id: "422b34ce-2d0f-4916-a557-553fc95db31b",
        title: "Signals",
        children: [{
          kind: "scene",
          id: LEFT_ID,
          title: "Arrival",
          source: { path: LEFT_PATH },
          synopsis: "Keep left metadata",
          includeInCompile: false,
          futureScene: { keep: true },
        }, {
          kind: "scene",
          id: RIGHT_ID,
          title: "Reply",
          source: { path: RIGHT_PATH },
          includeInCompile: false,
          ...rightChanges,
        }],
      }],
    }],
  }, null, 2)}\n`;
}

function project(
  text = structureText(),
  leftText = LEFT_TEXT,
  rightText = RIGHT_TEXT,
): Extract<ManuscriptProjectLoadResult, { kind: "ready" }> {
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
        items: manuscript.items.map((item) => fakeItem(item, leftText, rightText)),
      })),
      acceptedSourceBytes: 0,
      readSourceBytes: 0,
    },
  };
}

function fakeItem(item: ManuscriptOutlineItem, leftText: string, rightText: string) {
  if (item.kind === "scene") return fakeScene(item, leftText, rightText);
  return {
    item,
    folder: null,
    overview: null,
    source: null,
    children: item.children.map((child) => fakeScene(child, leftText, rightText)),
  };
}

function fakeScene(
  item: Extract<ManuscriptOutlineItem, { kind: "scene" }>,
  leftText: string,
  rightText: string,
) {
  const text = item.id === LEFT_ID ? leftText : rightText;
  return {
    item,
    source: {
      kind: "ready" as const,
      declaredPath: item.source.path,
      resolvedPath: item.source.path,
      fingerprint: fingerprintContent(text),
      bytes: new TextEncoder().encode(text).byteLength,
      wordCount: 2,
    },
  };
}

function request(changes: Partial<ManuscriptSceneMergeRequest> = {}): ManuscriptSceneMergeRequest {
  return {
    leftSceneId: LEFT_ID,
    leftSourceText: LEFT_TEXT,
    leftSourceFingerprint: fingerprintContent(LEFT_TEXT),
    rightSourceText: RIGHT_TEXT,
    rightSourceFingerprint: fingerprintContent(RIGHT_TEXT),
    join: "blank-line",
    retiredSourcePath: `${RIGHT_PATH}.retired`,
    ...changes,
  };
}

describe("manuscript scene merge planning", () => {
  it("keeps the complete left object, removes one minimal right object, and previews a blank line", () => {
    const plan = planManuscriptSceneMerge(project(), request());
    if (plan.kind !== "ready") throw new Error(plan.reason);
    expect(plan.target).toMatchObject({
      manuscriptTitle: "Book",
      containerLabel: "chapter “Signals”",
      arrayJsonPath: "$.manuscripts[0].items[0].children",
      leftPosition: 1,
      rightPosition: 2,
      leftSceneTitle: "Arrival",
      rightSceneTitle: "Reply",
      insertedBoundary: "\n\n",
    });
    expect(plan.mergedSourceText).toBe(`${LEFT_TEXT}\n\n${RIGHT_TEXT}`);
    const after = JSON.parse(plan.updatedStructureText);
    expect(after.manuscripts[0].items[0].children).toHaveLength(1);
    expect(after.manuscripts[0].items[0].children[0]).toMatchObject({
      id: LEFT_ID,
      synopsis: "Keep left metadata",
      futureScene: { keep: true },
      source: { path: LEFT_PATH },
    });
    expect(after.futureRoot).toBe("keep");
  });

  it("supports exact concatenation and adds only missing newlines for the blank-line option", () => {
    expect(planManuscriptSceneMerge(project(), request({ join: "preserve" })))
      .toMatchObject({ kind: "ready", mergedSourceText: `${LEFT_TEXT}${RIGHT_TEXT}` });
    const leftWithOne = `${LEFT_TEXT}\n`;
    const withOne = planManuscriptSceneMerge(
      project(structureText(), leftWithOne),
      request({ leftSourceText: leftWithOne, leftSourceFingerprint: fingerprintContent(leftWithOne) }),
    );
    expect(withOne).toMatchObject({ kind: "ready", target: { insertedBoundary: "\n" } });
    const leftWithTwo = `${LEFT_TEXT}\n\n`;
    const withTwo = planManuscriptSceneMerge(
      project(structureText(), leftWithTwo),
      request({ leftSourceText: leftWithTwo, leftSourceFingerprint: fingerprintContent(leftWithTwo) }),
    );
    expect(withTwo).toMatchObject({ kind: "ready", target: { insertedBoundary: "" } });
  });

  it("offers merge only for an adjacent verified minimal scene with matching compile intent", () => {
    expect(manuscriptSceneMergeAvailability(project(), LEFT_ID)).toEqual({
      kind: "available",
      leftSceneId: LEFT_ID,
      leftTitle: "Arrival",
      leftSourcePath: LEFT_PATH,
      leftSourceFingerprint: fingerprintContent(LEFT_TEXT),
      rightSceneId: RIGHT_ID,
      rightTitle: "Reply",
      rightSourcePath: RIGHT_PATH,
      rightSourceFingerprint: fingerprintContent(RIGHT_TEXT),
    });
    expect(manuscriptSceneMergeAvailability(project(), RIGHT_ID))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("immediately followed") });
    expect(manuscriptSceneMergeAvailability(project(structureText({ synopsis: "Do not drop" })), LEFT_ID))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("metadata") });
    expect(manuscriptSceneMergeAvailability(project(structureText({ includeInCompile: true })), LEFT_ID))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("compile inclusion") });
    expect(manuscriptSceneMergeAvailability(project(structureText({ source: { path: RIGHT_PATH, noteId: RIGHT_ID } })), LEFT_ID))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("metadata") });
  });

  it("refuses stale source bytes, unsafe retirement paths, and whitespace-only prose", () => {
    expect(planManuscriptSceneMerge(project(), request({ rightSourceText: `${RIGHT_TEXT}changed` })))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("changed") });
    for (const retiredSourcePath of ["../escape.retired", RIGHT_PATH, "Archive/reply.md"]) {
      expect(planManuscriptSceneMerge(project(), request({ retiredSourcePath })))
        .toMatchObject({ kind: "unavailable" });
    }
    expect(planManuscriptSceneMerge(
      project(structureText(), LEFT_TEXT, "  "),
      request({ rightSourceText: "  ", rightSourceFingerprint: fingerprintContent("  ") }),
    ))
      .toMatchObject({ kind: "unavailable", reason: expect.stringContaining("non-whitespace") });
  });

  it("preserves CRLF style when adding a missing blank-line boundary", () => {
    const left = "The signal arrived.\r\n";
    const right = "Mara answered.\r\n";
    expect(planManuscriptSceneMerge(
      project(structureText(), left, right),
      request({
        leftSourceText: left,
        leftSourceFingerprint: fingerprintContent(left),
        rightSourceText: right,
        rightSourceFingerprint: fingerprintContent(right),
      }),
    )).toMatchObject({ kind: "ready", target: { insertedBoundary: "\r\n" } });
  });

  it("suggests visible non-Markdown retirement names deterministically", () => {
    expect(suggestRetiredScenePath(RIGHT_PATH)).toBe(`${RIGHT_PATH}.retired`);
    expect(suggestRetiredScenePath(RIGHT_PATH, 3)).toBe(`${RIGHT_PATH}.retired-3`);
  });
});
