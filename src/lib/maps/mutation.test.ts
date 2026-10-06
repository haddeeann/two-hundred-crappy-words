import { describe, expect, it } from "vitest";

import { MAPS_FORMAT, parseMapsProject, type MapImage } from "./format";
import { planMapsMutation } from "./mutation";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const OTHER_PROJECT_ID = "aef84aa7-fd7d-42de-9c94-6df548a6471f";
const MAP_ID = "26a31375-e38d-48bb-833d-6357f2dc086b";
const ANCHOR_ID = "6675a835-c599-4490-a2f3-8a7865a924f7";
const NOTE_ID = "a46e0dbc-4304-449f-8292-c65dcc6529cf";
const OTHER_NOTE_ID = "93ddcd75-a74b-45f1-a029-8567ee333c3e";

const image: MapImage = {
  path: "Maps/system.png",
  mediaType: "image/png",
  sha256: "5bd45d0986e2f03ad9c989c87f101846c35f9b4b593c9a577acbc032a649d21a",
  width: 400,
  height: 300,
};

function source(overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    format: MAPS_FORMAT,
    formatVersion: 1,
    projectId: PROJECT_ID,
    maps: [{
      id: MAP_ID,
      title: "System",
      image,
      canvas: { width: 400, height: 300 },
      anchors: [{
        id: ANCHOR_ID,
        noteId: NOTE_ID,
        geometry: { kind: "point", x: 10, y: 20, futureGeometry: true },
        futureAnchor: "kept",
      }],
      futureMap: { retained: true },
    }],
    futureRoot: ["kept"],
    ...overrides,
  }, null, 2)}\n`;
}

describe("guarded maps mutation planning", () => {
  it("creates the first file only as part of adding a verified map", () => {
    const plan = planMapsMutation(null, PROJECT_ID, {
      kind: "add-map",
      mapId: MAP_ID,
      title: "  System  ",
      image,
    });
    expect(plan).toMatchObject({
      kind: "ready",
      originalText: null,
      originalFingerprint: null,
      summary: "Add map System.",
    });
    if (plan.kind !== "ready") return;
    expect(parseMapsProject(plan.updatedText)).toMatchObject({
      kind: "valid",
      mapsProject: { maps: [{ title: "System", canvas: { width: 400, height: 300 }, anchors: [] }] },
    });
  });

  it("refuses non-creation work while the optional file is absent", () => {
    expect(planMapsMutation(null, PROJECT_ID, {
      kind: "remove-map",
      mapId: MAP_ID,
    })).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("first map") });
  });

  it("adds a bounded point while preserving every unknown supported-version field", () => {
    const plan = planMapsMutation(source(), PROJECT_ID, {
      kind: "add-point",
      mapId: MAP_ID,
      anchorId: "b5899528-7b36-48e9-98e6-b1ef80bc093b",
      noteId: OTHER_NOTE_ID,
      x: 200,
      y: 120,
    });
    expect(plan).toMatchObject({ kind: "ready", operation: "add-point" });
    if (plan.kind !== "ready") return;
    const parsed = JSON.parse(plan.updatedText);
    expect(parsed).toMatchObject({
      futureRoot: ["kept"],
      maps: [{
        futureMap: { retained: true },
        anchors: [
          { futureAnchor: "kept", geometry: { futureGeometry: true } },
          { noteId: OTHER_NOTE_ID, geometry: { kind: "point", x: 200, y: 120 } },
        ],
      }],
    });
  });

  it("freezes reactive-proxy-shaped requests through the JSON data boundary", () => {
    const request = new Proxy({
      kind: "add-point" as const,
      mapId: MAP_ID,
      anchorId: "b5899528-7b36-48e9-98e6-b1ef80bc093b",
      noteId: OTHER_NOTE_ID,
      x: 200,
      y: 120,
    }, {});
    expect(() => structuredClone(request)).toThrow();
    const plan = planMapsMutation(source(), PROJECT_ID, request);
    expect(plan).toMatchObject({ kind: "ready", request: { x: 200, y: 120 } });
  });

  it("accepts a reactive-proxy-shaped image when planning a map", () => {
    const reactiveImage = new Proxy(image, {});
    expect(() => structuredClone(reactiveImage)).toThrow();
    const plan = planMapsMutation(source(), PROJECT_ID, {
      kind: "add-map",
      mapId: "3b63990c-55d7-4a0c-a161-1002cab46b3f",
      title: "External",
      image: reactiveImage,
    });
    expect(plan).toMatchObject({
      kind: "ready",
      request: { image },
    });
  });

  it("updates only recognized point fields and retains extensions", () => {
    const plan = planMapsMutation(source(), PROJECT_ID, {
      kind: "update-point",
      mapId: MAP_ID,
      anchorId: ANCHOR_ID,
      noteId: OTHER_NOTE_ID,
      x: 30,
      y: 40,
    });
    expect(plan).toMatchObject({ kind: "ready" });
    if (plan.kind !== "ready") return;
    expect(JSON.parse(plan.updatedText).maps[0].anchors[0]).toEqual(expect.objectContaining({
      noteId: OTHER_NOTE_ID,
      futureAnchor: "kept",
      geometry: { kind: "point", x: 30, y: 40, futureGeometry: true },
    }));
  });

  it("removes metadata without naming an image or note deletion", () => {
    const anchorPlan = planMapsMutation(source(), PROJECT_ID, {
      kind: "remove-anchor",
      mapId: MAP_ID,
      anchorId: ANCHOR_ID,
    });
    expect(anchorPlan).toMatchObject({ kind: "ready", summary: expect.stringContaining("keep its linked note") });
    if (anchorPlan.kind === "ready") expect(JSON.parse(anchorPlan.updatedText).maps[0].anchors).toEqual([]);

    const mapPlan = planMapsMutation(source(), PROJECT_ID, { kind: "remove-map", mapId: MAP_ID });
    expect(mapPlan).toMatchObject({ kind: "ready", summary: expect.stringContaining("keep its image and notes") });
    if (mapPlan.kind === "ready") expect(JSON.parse(mapPlan.updatedText).maps).toEqual([]);
  });

  it("refuses mismatched, malformed, invalid, missing, duplicate, polygon, and out-of-canvas work", () => {
    expect(planMapsMutation(source({ projectId: OTHER_PROJECT_ID }), PROJECT_ID, {
      kind: "remove-map", mapId: MAP_ID,
    })).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("different world") });
    expect(planMapsMutation("{", PROJECT_ID, { kind: "remove-map", mapId: MAP_ID })).toMatchObject({ kind: "unavailable" });
    expect(planMapsMutation(source({ format: "wrong" }), PROJECT_ID, { kind: "remove-map", mapId: MAP_ID })).toMatchObject({ kind: "blocked" });
    expect(planMapsMutation(source(), PROJECT_ID, { kind: "remove-map", mapId: OTHER_NOTE_ID })).toMatchObject({ kind: "unavailable" });
    expect(planMapsMutation(source(), PROJECT_ID, {
      kind: "add-point", mapId: MAP_ID, anchorId: ANCHOR_ID, noteId: NOTE_ID, x: 1, y: 1,
    })).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("stable ID") });

    const polygonSource = source();
    const polygonValue = JSON.parse(polygonSource);
    polygonValue.maps[0].anchors[0].geometry = { kind: "polygon", points: [[0, 0], [10, 0], [0, 10]] };
    expect(planMapsMutation(`${JSON.stringify(polygonValue)}\n`, PROJECT_ID, {
      kind: "update-point", mapId: MAP_ID, anchorId: ANCHOR_ID, noteId: NOTE_ID, x: 1, y: 1,
    })).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("geometry type") });

    expect(planMapsMutation(source(), PROJECT_ID, {
      kind: "add-point", mapId: MAP_ID, anchorId: "b5899528-7b36-48e9-98e6-b1ef80bc093b", noteId: NOTE_ID, x: 400, y: 1,
    })).toMatchObject({ kind: "blocked", issues: expect.arrayContaining([expect.objectContaining({ path: expect.stringContaining(".x") })]) });
  });

  it("reports unchanged updates without manufacturing consent", () => {
    expect(planMapsMutation(source(), PROJECT_ID, {
      kind: "update-point", mapId: MAP_ID, anchorId: ANCHOR_ID, noteId: NOTE_ID, x: 10, y: 20,
    })).toEqual({ kind: "unchanged", summary: "The point anchor is already unchanged." });
  });

  it("adds and updates polygon anchors through the authoritative geometry validator", () => {
    const polygonId = "3b63990c-55d7-4a0c-a161-1002cab46b3f";
    const addPlan = planMapsMutation(source(), PROJECT_ID, {
      kind: "add-polygon",
      mapId: MAP_ID,
      anchorId: polygonId,
      noteId: OTHER_NOTE_ID,
      points: [[40, 40], [200, 40], [120, 180]],
    });
    expect(addPlan).toMatchObject({ kind: "ready", operation: "add-polygon" });
    if (addPlan.kind !== "ready") return;
    expect(JSON.parse(addPlan.updatedText).maps[0].anchors[1]).toEqual({
      id: polygonId,
      noteId: OTHER_NOTE_ID,
      geometry: { kind: "polygon", points: [[40, 40], [200, 40], [120, 180]] },
    });

    const updatePlan = planMapsMutation(addPlan.updatedText, PROJECT_ID, {
      kind: "update-polygon",
      mapId: MAP_ID,
      anchorId: polygonId,
      noteId: NOTE_ID,
      points: [[50, 50], [210, 50], [130, 190]],
    });
    expect(updatePlan).toMatchObject({ kind: "ready", operation: "update-polygon" });
    if (updatePlan.kind !== "ready") return;
    expect(JSON.parse(updatePlan.updatedText).maps[0].anchors[1]).toEqual({
      id: polygonId,
      noteId: NOTE_ID,
      geometry: { kind: "polygon", points: [[50, 50], [210, 50], [130, 190]] },
    });
  });

  it("blocks invalid polygons and geometry-type races", () => {
    const invalid = planMapsMutation(source(), PROJECT_ID, {
      kind: "add-polygon",
      mapId: MAP_ID,
      anchorId: "3b63990c-55d7-4a0c-a161-1002cab46b3f",
      noteId: OTHER_NOTE_ID,
      points: [[0, 0], [10, 10], [20, 20]],
    });
    expect(invalid).toMatchObject({ kind: "blocked" });

    const mismatch = planMapsMutation(source(), PROJECT_ID, {
      kind: "update-polygon",
      mapId: MAP_ID,
      anchorId: ANCHOR_ID,
      noteId: NOTE_ID,
      points: [[0, 0], [10, 0], [0, 10]],
    });
    expect(mismatch).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("geometry type"),
    });
  });

  it("replaces a same-aspect image while retaining the logical canvas and anchors", () => {
    const replacement: MapImage = {
      ...image,
      path: "Maps/system-large.png",
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      width: 800,
      height: 600,
    };
    const original = JSON.parse(source());
    original.maps[0].image.futureImage = "kept";
    original.maps[0].canvas.futureCanvas = "kept";
    const plan = planMapsMutation(`${JSON.stringify(original, null, 2)}\n`, PROJECT_ID, {
      kind: "replace-image",
      mapId: MAP_ID,
      image: replacement,
      clearAnchors: false,
    });
    expect(plan).toMatchObject({
      kind: "ready",
      operation: "replace-image",
      summary: expect.stringContaining("retain 1 anchor"),
    });
    if (plan.kind !== "ready") return;
    const updated = JSON.parse(plan.updatedText);
    expect(updated.maps[0].image).toEqual({ ...replacement, futureImage: "kept" });
    expect(updated.maps[0].canvas).toEqual({ width: 400, height: 300, futureCanvas: "kept" });
    expect(updated.maps[0].anchors).toHaveLength(1);
    expect(updated.maps[0].futureMap).toEqual({ retained: true });
  });

  it("requires explicit anchor clearing for a different-aspect replacement", () => {
    const replacement: MapImage = {
      ...image,
      path: "Maps/system-square.png",
      sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      width: 500,
      height: 500,
    };
    expect(planMapsMutation(source(), PROJECT_ID, {
      kind: "replace-image",
      mapId: MAP_ID,
      image: replacement,
      clearAnchors: false,
    })).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("explicitly clear all 1 anchors"),
    });

    const plan = planMapsMutation(source(), PROJECT_ID, {
      kind: "replace-image",
      mapId: MAP_ID,
      image: replacement,
      clearAnchors: true,
    });
    expect(plan).toMatchObject({ kind: "ready", summary: expect.stringContaining("clear 1 anchor") });
    if (plan.kind !== "ready") return;
    const updated = JSON.parse(plan.updatedText);
    expect(updated.maps[0].image).toEqual(replacement);
    expect(updated.maps[0].canvas).toEqual({ width: 500, height: 500 });
    expect(updated.maps[0].anchors).toEqual([]);
  });

  it("needs no update for identical bytes and can reset an empty different-aspect canvas", () => {
    expect(planMapsMutation(source(), PROJECT_ID, {
      kind: "replace-image",
      mapId: MAP_ID,
      image: { ...image, path: "Maps/same-bytes.png" },
      clearAnchors: false,
    })).toEqual({
      kind: "unchanged",
      summary: "The selected image has the same verified bytes as the current image.",
    });

    const empty = JSON.parse(source());
    empty.maps[0].anchors = [];
    const plan = planMapsMutation(`${JSON.stringify(empty, null, 2)}\n`, PROJECT_ID, {
      kind: "replace-image",
      mapId: MAP_ID,
      image: {
        ...image,
        path: "Maps/empty-square.png",
        sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        width: 500,
        height: 500,
      },
      clearAnchors: false,
    });
    expect(plan).toMatchObject({ kind: "ready", summary: expect.stringContaining("empty logical canvas") });
  });
});
