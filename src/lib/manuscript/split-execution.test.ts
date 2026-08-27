import { describe, expect, it } from "vitest";

import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  executeManuscriptSceneSplit,
  undoManuscriptSceneSplit,
  type ManuscriptSceneSplitIo,
  type SceneSplitAtomicRequest,
  type SceneSplitUndoAtomicRequest,
} from "./split-execution";
import { planManuscriptSceneSplit } from "./split";
import { parseManuscriptStructure, type ManuscriptOutlineItem } from "./structure";

const SCENE_ID = "6eea7c60-8e12-4b9a-9716-f31cd3450eb3";
const NEW_SCENE_ID = "44fe96d8-b53d-47c5-9518-c4c2f1859a48";
const SOURCE_PATH = "Manuscript/Signals/arrival.md";
const DESTINATION_PATH = "Manuscript/Signals/arrival-part-2.md";
const SOURCE_TEXT = "The signal arrived.\n\nMara answered from the dark.\n";

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
        children: [{
          kind: "scene",
          id: SCENE_ID,
          title: "Arrival",
          source: { path: SOURCE_PATH },
        }],
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
  return { item, folder: null, overview: null, source: null, children: item.children.map((child) => fakeScene(child, files)) };
}

function fakeScene(item: Extract<ManuscriptOutlineItem, { kind: "scene" }>, files: Map<string, string>) {
  const text = files.get(item.source.path);
  return {
    item,
    source: text === undefined ? { kind: "missing" as const, declaredPath: item.source.path, message: "missing" } : {
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
  const files = new Map([[SOURCE_PATH, SOURCE_TEXT]]);
  const calls: string[] = [];
  const io: ManuscriptSceneSplitIo = {
    reload: async () => project(structure, files),
    readSource: async (path) => {
      const text = files.get(path);
      if (text === undefined) throw new Error("missing");
      return text;
    },
    sourceExists: async (path) => files.has(path),
    splitAtomic: async (request: SceneSplitAtomicRequest) => {
      calls.push("split");
      if (structure !== request.expectedStructureText || files.get(request.sourceRelative) !== request.expectedSourceText) {
        throw new Error("stale");
      }
      if (files.has(request.destinationRelative)) throw new Error("collision");
      files.set(request.sourceRelative, request.leftSourceText);
      files.set(request.destinationRelative, request.rightSourceText);
      structure = request.newStructureText;
      return { cleanupWarnings: [] };
    },
    undoAtomic: async (request: SceneSplitUndoAtomicRequest) => {
      calls.push("undo");
      if (
        structure !== request.expectedStructureText ||
        files.get(request.sourceRelative) !== request.expectedLeftSourceText ||
        files.get(request.destinationRelative) !== request.expectedRightSourceText
      ) throw new Error("stale");
      files.set(request.sourceRelative, request.restoredSourceText);
      files.delete(request.destinationRelative);
      structure = request.restoredStructureText;
      return { cleanupWarnings: [] };
    },
  };
  const plan = planManuscriptSceneSplit(project(structure, files), {
    sourcePath: SOURCE_PATH,
    sourceText: SOURCE_TEXT,
    sourceFingerprint: fingerprintContent(SOURCE_TEXT),
    caretOffset: SOURCE_TEXT.indexOf("Mara"),
    newSceneId: NEW_SCENE_ID,
    newSceneTitle: "The answer",
    newSourcePath: DESTINATION_PATH,
  });
  if (plan.kind !== "ready") throw new Error(plan.reason);
  return { io, plan, files, calls, getStructure: () => structure, setStructure: (text: string) => { structure = text; } };
}

describe("manuscript scene split execution", () => {
  it("rechecks, applies, rereads, and exactly undoes the three-file transaction", async () => {
    const state = harness();
    const split = await executeManuscriptSceneSplit(state.plan, state.io);
    if (split.kind !== "success") throw new Error(split.message);
    expect(state.calls).toEqual(["split"]);
    expect(state.files.get(SOURCE_PATH)).toBe(state.plan.leftSourceText);
    expect(state.files.get(DESTINATION_PATH)).toBe(state.plan.rightSourceText);
    expect(state.getStructure()).toBe(state.plan.updatedStructureText);

    const undone = await undoManuscriptSceneSplit(split.undo, state.io);
    expect(undone.kind).toBe("success");
    expect(state.calls).toEqual(["split", "undo"]);
    expect(state.files.get(SOURCE_PATH)).toBe(SOURCE_TEXT);
    expect(state.files.has(DESTINATION_PATH)).toBe(false);
    expect(state.getStructure()).toBe(state.plan.originalStructureText);
  });

  it("refuses changed source text before invoking the native transaction", async () => {
    const state = harness();
    state.files.set(SOURCE_PATH, `${SOURCE_TEXT}changed`);
    const result = await executeManuscriptSceneSplit(state.plan, state.io);
    expect(result).toMatchObject({ kind: "failed", message: expect.stringContaining("changed after preview") });
    expect(state.calls).toEqual([]);
  });

  it("refuses a destination collision and treats an existence-check failure as unsafe", async () => {
    const collision = harness();
    collision.files.set(DESTINATION_PATH, "existing");
    expect(await executeManuscriptSceneSplit(collision.plan, collision.io))
      .toMatchObject({ kind: "failed", message: expect.stringContaining("destination now exists") });
    const unreadable = harness();
    unreadable.io.sourceExists = async () => { throw new Error("denied"); };
    expect(await executeManuscriptSceneSplit(unreadable.plan, unreadable.io))
      .toMatchObject({ kind: "failed", message: expect.stringContaining("destination now exists") });
  });

  it("removes guarded Undo when either split scene or the structure changes", async () => {
    for (const mutate of [
      (state: ReturnType<typeof harness>) => state.files.set(SOURCE_PATH, "edited left"),
      (state: ReturnType<typeof harness>) => state.files.set(DESTINATION_PATH, "edited right"),
      (state: ReturnType<typeof harness>) => state.setStructure(`${state.getStructure()} `),
    ]) {
      const state = harness();
      const split = await executeManuscriptSceneSplit(state.plan, state.io);
      if (split.kind !== "success") throw new Error(split.message);
      mutate(state);
      expect(await undoManuscriptSceneSplit(split.undo, state.io)).toMatchObject({ kind: "failed" });
      expect(state.calls).toEqual(["split"]);
    }
  });
});
