import { describe, expect, it } from "vitest";

import {
  MAPS_FILE,
  MAPS_FORMAT,
  MAX_MAPS_BYTES,
  MAX_MAP_ANCHORS,
  MAX_MAP_ISSUES,
  parseMapsProject,
} from "./format";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const MAP_ID = "26a31375-e38d-48bb-833d-6357f2dc086b";
const POINT_ID = "6675a835-c599-4490-a2f3-8a7865a924f7";
const REGION_ID = "b5899528-7b36-48e9-98e6-b1ef80bc093b";
const NOTE_ID = "a46e0dbc-4304-449f-8292-c65dcc6529cf";

function validValue(overrides: Record<string, unknown> = {}) {
  return {
    format: MAPS_FORMAT,
    formatVersion: 1,
    projectId: PROJECT_ID,
    maps: [
      {
        id: MAP_ID,
        title: "The Nacre System",
        image: {
          path: "Maps/nacre-system.png",
          mediaType: "image/png",
          sha256: "5bd45d0986e2f03ad9c989c87f101846c35f9b4b593c9a577acbc032a649d21a",
          width: 4096,
          height: 3072,
        },
        canvas: { width: 4096, height: 3072 },
        anchors: [
          {
            id: POINT_ID,
            noteId: NOTE_ID,
            geometry: { kind: "point", x: 1712, y: 930 },
          },
          {
            id: REGION_ID,
            noteId: NOTE_ID,
            geometry: { kind: "polygon", points: [[700, 1220], [1160, 980], [1510, 1440]] },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("portable maps project", () => {
  it("uses the approved root filename and parses point and polygon anchors", () => {
    expect(MAPS_FILE).toBe("200-crappy-words.maps.json");
    const result = parseMapsProject(JSON.stringify(validValue({ future: { retained: true } })));
    expect(result).toMatchObject({
      kind: "valid",
      mapsProject: {
        projectId: PROJECT_ID,
        maps: [{ id: MAP_ID, anchors: [{ geometry: { kind: "point" } }, { geometry: { kind: "polygon" } }] }],
      },
      source: { future: { retained: true } },
    });
  });

  it("deep-clones unknown supported-version fields", () => {
    const original = validValue({ extension: { owner: "writer" } }) as ReturnType<typeof validValue> & {
      extension: { owner: string };
    };
    const result = parseMapsProject(JSON.stringify(original));
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;
    original.extension.owner = "changed";
    expect(result.source.extension).toEqual({ owner: "writer" });
  });

  it("separates malformed, invalid, and unsupported versions", () => {
    expect(parseMapsProject("{")).toMatchObject({ kind: "malformed" });
    expect(parseMapsProject("[]")).toMatchObject({ kind: "invalid" });
    expect(parseMapsProject(JSON.stringify({ formatVersion: 2 }))).toEqual({
      kind: "unsupported-version",
      version: 2,
    });
  });

  it("requires canonical globally unique map and anchor identities", () => {
    const duplicateMap = validValue();
    duplicateMap.maps.push(structuredClone(duplicateMap.maps[0]!));
    const mapResult = parseMapsProject(JSON.stringify(duplicateMap));
    expect(mapResult).toMatchObject({ kind: "invalid" });
    if (mapResult.kind === "invalid") {
      expect(mapResult.issues).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining("Duplicate map id") })]));
    }

    const duplicateAnchor = validValue();
    duplicateAnchor.maps[0]!.anchors[1]!.id = POINT_ID;
    const anchorResult = parseMapsProject(JSON.stringify(duplicateAnchor));
    expect(anchorResult).toMatchObject({ kind: "invalid" });
    if (anchorResult.kind === "invalid") {
      expect(anchorResult.issues).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining("Duplicate anchor id") })]));
    }
  });

  it("accepts only portable project-relative image paths and supported media types", () => {
    for (const path of ["../outside.png", "/absolute.png", "Maps\\map.png", "Maps//map.png"]) {
      const value = validValue();
      value.maps[0]!.image.path = path;
      expect(parseMapsProject(JSON.stringify(value))).toMatchObject({ kind: "invalid" });
    }
    const value = validValue();
    value.maps[0]!.image.mediaType = "image/svg+xml";
    expect(parseMapsProject(JSON.stringify(value))).toMatchObject({ kind: "invalid" });
  });

  it("bounds image and canvas dimensions independently of display scaling", () => {
    const oversized = validValue();
    oversized.maps[0]!.image.width = 8193;
    expect(parseMapsProject(JSON.stringify(oversized))).toMatchObject({ kind: "invalid" });

    const tooManyPixels = validValue();
    tooManyPixels.maps[0]!.canvas = { width: 7000, height: 7000 };
    expect(parseMapsProject(JSON.stringify(tooManyPixels))).toMatchObject({ kind: "invalid" });
  });

  it("requires in-canvas non-negative integer geometry", () => {
    const value = validValue();
    value.maps[0]!.anchors[0]!.geometry = { kind: "point", x: 4096, y: -1 };
    const result = parseMapsProject(JSON.stringify(value));
    expect(result).toMatchObject({ kind: "invalid" });
    if (result.kind === "invalid") {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining(".x") }),
        expect.objectContaining({ path: expect.stringContaining(".y") }),
      ]));
    }
  });

  it("rejects repeated closure, too few distinct points, and collinear polygons", () => {
    for (const points of [
      [[0, 0], [10, 0], [0, 0]],
      [[0, 0], [10, 10], [20, 20]],
      [[0, 0], [0, 0], [10, 10]],
    ]) {
      const value = validValue();
      value.maps[0]!.anchors[1]!.geometry = { kind: "polygon", points };
      expect(parseMapsProject(JSON.stringify(value))).toMatchObject({ kind: "invalid" });
    }
  });

  it("bounds total anchors and reported issues", () => {
    const value = validValue();
    value.maps[0]!.anchors = Array.from({ length: MAX_MAP_ANCHORS + 1 }, (_, index) => ({
      id: index < 2 ? POINT_ID : "invalid",
      noteId: "invalid",
      geometry: { kind: "point", x: 0, y: 0 },
    }));
    const result = parseMapsProject(JSON.stringify(value));
    expect(result).toMatchObject({ kind: "invalid" });
    if (result.kind !== "invalid") return;
    expect(result.issues.length).toBe(MAX_MAP_ISSUES + 1);
    expect(result.issues.at(-1)?.message).toContain("omitted");
  });

  it("refuses JSON beyond the approved byte boundary before parsing", () => {
    const result = parseMapsProject(`{"padding":"${"x".repeat(MAX_MAPS_BYTES)}"}`);
    expect(result).toMatchObject({ kind: "invalid", issues: [{ message: expect.stringContaining("must not exceed") }] });
  });
});
