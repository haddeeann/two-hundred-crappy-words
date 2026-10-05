import { describe, expect, it } from "vitest";

import { fingerprintContent } from "$lib/editor/recovery";
import { MAPS_FORMAT, parseMapsProject, type MapImage } from "./format";
import type { MapsProjectLoadResult } from "./load";
import {
  executeMapsMutation,
  undoMapsMutation,
  type MapsMutationIo,
} from "./mutation-execution";
import { planMapsMutation, type MapsMutationRequest } from "./mutation";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const MAP_ID = "26a31375-e38d-48bb-833d-6357f2dc086b";
const image: MapImage = {
  path: "Maps/system.png",
  mediaType: "image/png",
  sha256: "5bd45d0986e2f03ad9c989c87f101846c35f9b4b593c9a577acbc032a649d21a",
  width: 400,
  height: 300,
};

function source(title = "System"): string {
  return `${JSON.stringify({
    format: MAPS_FORMAT,
    formatVersion: 1,
    projectId: PROJECT_ID,
    maps: [{ id: MAP_ID, title, image, canvas: { width: 400, height: 300 }, anchors: [] }],
  }, null, 2)}\n`;
}

function ready(text: string): Extract<MapsProjectLoadResult, { kind: "ready" }> {
  const parsed = parseMapsProject(text);
  if (parsed.kind !== "valid") throw new Error("invalid fixture");
  return {
    kind: "ready",
    fingerprint: fingerprintContent(text),
    text,
    source: parsed.source,
    mapsProject: parsed.mapsProject,
  };
}

function memoryIo(initial: string | null): MapsMutationIo & { current(): string | null; external(text: string | null): void } {
  let text = initial;
  return {
    current: () => text,
    external: (value) => { text = value; },
    async reload() { return text === null ? { kind: "absent" } : ready(text); },
    async createNew(value) {
      if (text !== null) throw new Error("collision");
      text = value;
    },
    async replaceAtomic(expected, value) {
      if (text !== expected) throw new Error("stale");
      text = value;
    },
    async removeCreated(expected) {
      if (text !== expected) throw new Error("stale");
      text = null;
    },
  };
}

const addMap: MapsMutationRequest = { kind: "add-map", mapId: MAP_ID, title: "System", image };

describe("maps mutation execution", () => {
  it("creates, exactly rereads, and removes the first file through Undo", async () => {
    const plan = planMapsMutation(null, PROJECT_ID, addMap);
    expect(plan.kind).toBe("ready");
    if (plan.kind !== "ready") return;
    const io = memoryIo(null);
    const applied = await executeMapsMutation(plan, addMap, io);
    expect(applied).toMatchObject({ kind: "applied", project: { text: plan.updatedText } });
    if (applied.kind !== "applied") return;
    const undone = await undoMapsMutation(applied.undo, io);
    expect(undone).toEqual({ kind: "undone", project: { kind: "absent" } });
    expect(io.current()).toBeNull();
  });

  it("replaces and restores an existing file exactly", async () => {
    const original = source();
    const request: MapsMutationRequest = {
      kind: "add-point",
      mapId: MAP_ID,
      anchorId: "6675a835-c599-4490-a2f3-8a7865a924f7",
      noteId: "a46e0dbc-4304-449f-8292-c65dcc6529cf",
      x: 10,
      y: 20,
    };
    const plan = planMapsMutation(original, PROJECT_ID, request);
    expect(plan.kind).toBe("ready");
    if (plan.kind !== "ready") return;
    const io = memoryIo(original);
    const applied = await executeMapsMutation(plan, request, io);
    expect(applied).toMatchObject({ kind: "applied" });
    if (applied.kind !== "applied") return;
    await expect(undoMapsMutation(applied.undo, io)).resolves.toMatchObject({ kind: "undone" });
    expect(io.current()).toBe(original);
  });

  it("refuses a file that appears or changes after preview", async () => {
    const creation = planMapsMutation(null, PROJECT_ID, addMap);
    if (creation.kind !== "ready") throw new Error("fixture");
    const appeared = memoryIo(source("External"));
    await expect(executeMapsMutation(creation, addMap, appeared)).resolves.toMatchObject({
      kind: "failed",
      message: expect.stringContaining("appeared"),
    });

    const original = source();
    const request: MapsMutationRequest = { kind: "remove-map", mapId: MAP_ID };
    const removal = planMapsMutation(original, PROJECT_ID, request);
    if (removal.kind !== "ready") throw new Error("fixture");
    const changed = memoryIo(source("External"));
    await expect(executeMapsMutation(removal, request, changed)).resolves.toMatchObject({
      kind: "failed",
      message: expect.stringContaining("changed after preview"),
    });
  });

  it("regenerates the request and refuses a different reviewed plan", async () => {
    const original = source();
    const request: MapsMutationRequest = { kind: "remove-map", mapId: MAP_ID };
    const plan = planMapsMutation(original, PROJECT_ID, request);
    if (plan.kind !== "ready") throw new Error("fixture");
    const differentRequest: MapsMutationRequest = {
      kind: "add-point",
      mapId: MAP_ID,
      anchorId: "6675a835-c599-4490-a2f3-8a7865a924f7",
      noteId: "a46e0dbc-4304-449f-8292-c65dcc6529cf",
      x: 1,
      y: 1,
    };
    await expect(executeMapsMutation(plan, differentRequest, memoryIo(original))).resolves.toMatchObject({
      kind: "failed",
      message: expect.stringContaining("no longer matches"),
    });
  });

  it("refuses Undo after any external change", async () => {
    const original = source();
    const request: MapsMutationRequest = { kind: "remove-map", mapId: MAP_ID };
    const plan = planMapsMutation(original, PROJECT_ID, request);
    if (plan.kind !== "ready") throw new Error("fixture");
    const io = memoryIo(original);
    const applied = await executeMapsMutation(plan, request, io);
    if (applied.kind !== "applied") throw new Error("fixture");
    io.external(source("External after edit"));
    await expect(undoMapsMutation(applied.undo, io)).resolves.toMatchObject({
      kind: "failed",
      message: expect.stringContaining("will not overwrite or remove"),
    });
  });
});
