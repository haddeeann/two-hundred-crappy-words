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
    })).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("Only point") });

    expect(planMapsMutation(source(), PROJECT_ID, {
      kind: "add-point", mapId: MAP_ID, anchorId: "b5899528-7b36-48e9-98e6-b1ef80bc093b", noteId: NOTE_ID, x: 400, y: 1,
    })).toMatchObject({ kind: "blocked", issues: expect.arrayContaining([expect.objectContaining({ path: expect.stringContaining(".x") })]) });
  });

  it("reports unchanged updates without manufacturing consent", () => {
    expect(planMapsMutation(source(), PROJECT_ID, {
      kind: "update-point", mapId: MAP_ID, anchorId: ANCHOR_ID, noteId: NOTE_ID, x: 10, y: 20,
    })).toEqual({ kind: "unchanged", summary: "The point anchor is already unchanged." });
  });
});
