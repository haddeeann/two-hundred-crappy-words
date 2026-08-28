import { describe, expect, it } from "vitest";

import { fingerprintContent } from "$lib/editor/recovery";
import {
  executeManuscriptSceneMerge,
  undoManuscriptSceneMerge,
  type ManuscriptSceneMergeIo,
  type SceneMergeAtomicRequest,
  type SceneMergeUndoAtomicRequest,
} from "./merge-execution";
import { planManuscriptSceneMerge } from "./merge";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import { parseManuscriptStructure, type ManuscriptOutlineItem } from "./structure";

const LEFT_ID = "6eea7c60-8e12-4b9a-9716-f31cd3450eb3";
const RIGHT_ID = "44fe96d8-b53d-47c5-9518-c4c2f1859a48";
const LEFT_PATH = "Manuscript/Signals/arrival.md";
const RIGHT_PATH = "Manuscript/Signals/reply.md";
const RETIRED_PATH = `${RIGHT_PATH}.retired`;
const LEFT_TEXT = "The signal arrived.";
const RIGHT_TEXT = "Mara answered.\n";

function structureText(): string {
  return `${JSON.stringify({
    formatVersion: 1,
    manuscripts: [{
      id: "7339b0ee-5f87-493d-bcad-e56636d7cb26",
      title: "Book",
      items: [{
        kind: "chapter",
        id: "422b34ce-2d0f-4916-a557-553fc95db31b",
        title: "Signals",
        children: [
          { kind: "scene", id: LEFT_ID, title: "Arrival", source: { path: LEFT_PATH } },
          { kind: "scene", id: RIGHT_ID, title: "Reply", source: { path: RIGHT_PATH } },
        ],
      }],
    }],
  }, null, 2)}\n`;
}

function project(text: string, files: Map<string, string>): Extract<ManuscriptProjectLoadResult, { kind: "ready" }> {
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
        items: manuscript.items.map((item) => fakeItem(item, files)),
      })),
      acceptedSourceBytes: 0,
      readSourceBytes: 0,
    },
  };
}

function fakeItem(item: ManuscriptOutlineItem, files: Map<string, string>) {
  if (item.kind === "scene") return fakeScene(item, files);
  return {
    item,
    folder: null,
    overview: null,
    source: null,
    children: item.children.map((child) => fakeScene(child, files)),
  };
}

function fakeScene(item: Extract<ManuscriptOutlineItem, { kind: "scene" }>, files: Map<string, string>) {
  const text = files.get(item.source.path);
  return {
    item,
    source: text === undefined
      ? { kind: "missing" as const, declaredPath: item.source.path, message: "missing" }
      : {
          kind: "ready" as const,
          declaredPath: item.source.path,
          resolvedPath: item.source.path,
          fingerprint: fingerprintContent(text),
          bytes: new TextEncoder().encode(text).byteLength,
          wordCount: 1,
        },
  };
}

function harness() {
  let structure = structureText();
  const files = new Map([[LEFT_PATH, LEFT_TEXT], [RIGHT_PATH, RIGHT_TEXT]]);
  const calls: string[] = [];
  const io: ManuscriptSceneMergeIo = {
    reload: async () => project(structure, files),
    readSource: async (path) => {
      const text = files.get(path);
      if (text === undefined) throw new Error("missing");
      return text;
    },
    sourceExists: async (path) => files.has(path),
    mergeAtomic: async (request: SceneMergeAtomicRequest) => {
      calls.push("merge");
      if (
        structure !== request.expectedStructureText ||
        files.get(request.leftRelative) !== request.expectedLeftText ||
        files.get(request.rightRelative) !== request.expectedRightText ||
        files.has(request.retiredRelative)
      ) throw new Error("stale");
      files.set(request.leftRelative, request.mergedLeftText);
      files.set(request.retiredRelative, request.expectedRightText);
      files.delete(request.rightRelative);
      structure = request.newStructureText;
      return { cleanupWarnings: [] };
    },
    undoAtomic: async (request: SceneMergeUndoAtomicRequest) => {
      calls.push("undo");
      if (
        structure !== request.expectedStructureText ||
        files.get(request.leftRelative) !== request.expectedMergedLeftText ||
        files.get(request.retiredRelative) !== request.restoredRightText ||
        files.has(request.rightRelative)
      ) throw new Error("stale");
      files.set(request.leftRelative, request.restoredLeftText);
      files.set(request.rightRelative, request.restoredRightText);
      files.delete(request.retiredRelative);
      structure = request.restoredStructureText;
      return { cleanupWarnings: [] };
    },
  };
  const plan = planManuscriptSceneMerge(project(structure, files), {
    leftSceneId: LEFT_ID,
    leftSourceText: LEFT_TEXT,
    leftSourceFingerprint: fingerprintContent(LEFT_TEXT),
    rightSourceText: RIGHT_TEXT,
    rightSourceFingerprint: fingerprintContent(RIGHT_TEXT),
    join: "blank-line",
    retiredSourcePath: RETIRED_PATH,
  });
  if (plan.kind !== "ready") throw new Error(plan.reason);
  return { io, plan, files, calls, getStructure: () => structure, setStructure: (text: string) => { structure = text; } };
}

describe("manuscript scene merge execution", () => {
  it("rechecks, applies, rereads, and exactly undoes the four-path transaction", async () => {
    const state = harness();
    const merged = await executeManuscriptSceneMerge(state.plan, state.io);
    if (merged.kind !== "success") throw new Error(merged.message);
    expect(state.calls).toEqual(["merge"]);
    expect(state.files.get(LEFT_PATH)).toBe(state.plan.mergedSourceText);
    expect(state.files.has(RIGHT_PATH)).toBe(false);
    expect(state.files.get(RETIRED_PATH)).toBe(RIGHT_TEXT);
    expect(state.getStructure()).toBe(state.plan.updatedStructureText);

    expect(await undoManuscriptSceneMerge(merged.undo, state.io)).toMatchObject({ kind: "success" });
    expect(state.calls).toEqual(["merge", "undo"]);
    expect(state.files.get(LEFT_PATH)).toBe(LEFT_TEXT);
    expect(state.files.get(RIGHT_PATH)).toBe(RIGHT_TEXT);
    expect(state.files.has(RETIRED_PATH)).toBe(false);
    expect(state.getStructure()).toBe(state.plan.originalStructureText);
  });

  it("refuses changed source text and a retirement collision before invoking native code", async () => {
    const changed = harness();
    changed.files.set(RIGHT_PATH, `${RIGHT_TEXT}changed`);
    expect(await executeManuscriptSceneMerge(changed.plan, changed.io))
      .toMatchObject({ kind: "failed", message: expect.stringContaining("changed after preview") });
    expect(changed.calls).toEqual([]);

    const collision = harness();
    collision.files.set(RETIRED_PATH, "occupied");
    expect(await executeManuscriptSceneMerge(collision.plan, collision.io))
      .toMatchObject({ kind: "failed", message: expect.stringContaining("destination now exists") });
    expect(collision.calls).toEqual([]);
  });

  it("refuses guarded Undo after any affected result changes", async () => {
    for (const mutate of [
      (state: ReturnType<typeof harness>) => state.files.set(LEFT_PATH, "edited left"),
      (state: ReturnType<typeof harness>) => state.files.set(RETIRED_PATH, "edited retired"),
      (state: ReturnType<typeof harness>) => state.files.set(RIGHT_PATH, "occupied"),
      (state: ReturnType<typeof harness>) => state.setStructure(`${state.getStructure()} `),
    ]) {
      const state = harness();
      const merged = await executeManuscriptSceneMerge(state.plan, state.io);
      if (merged.kind !== "success") throw new Error(merged.message);
      mutate(state);
      expect(await undoManuscriptSceneMerge(merged.undo, state.io)).toMatchObject({ kind: "failed" });
      expect(state.calls).toEqual(["merge"]);
    }
  });
});
