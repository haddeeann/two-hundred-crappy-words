import { describe, expect, it } from "vitest";

import type { LoreDocumentRecord, LoreProjectIndex } from "$lib/lore/types";
import { MAPS_FORMAT, type MapsProject } from "./format";
import { deriveMapsWorkspaceModel } from "./model";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const NOTE_ID = "a46e0dbc-4304-449f-8292-c65dcc6529cf";
const MISSING_ID = "93ddcd75-a74b-45f1-a029-8567ee333c3e";

function document(path: string, id: string | null, type: string | null): LoreDocumentRecord {
  return {
    path,
    fingerprint: "stable",
    size: 1,
    id,
    type,
    title: path.replace(/\.md$/u, ""),
    aliases: [],
    canon: null,
    facts: [],
    headings: [],
    outgoing: [],
    parseIssues: [],
    searchText: "",
    normalizedSearchText: "",
  };
}

function index(documents: LoreDocumentRecord[]): LoreProjectIndex {
  return {
    format: "200-crappy-words/lore-index",
    version: 1,
    generation: 1,
    documents: new Map(documents.map((value) => [value.path, value])),
    backlinks: new Map(),
    issues: [],
  };
}

function project(noteIds: string[]): MapsProject {
  return {
    format: MAPS_FORMAT,
    formatVersion: 1,
    projectId: PROJECT_ID,
    maps: [{
      id: "26a31375-e38d-48bb-833d-6357f2dc086b",
      title: "System",
      image: { path: "Maps/system.png", mediaType: "image/png", sha256: "0".repeat(64), width: 100, height: 100 },
      canvas: { width: 100, height: 100 },
      anchors: noteIds.map((noteId, position) => ({
        id: position === 0 ? "6675a835-c599-4490-a2f3-8a7865a924f7" : "b5899528-7b36-48e9-98e6-b1ef80bc093b",
        noteId,
        geometry: { kind: "point", x: position, y: position },
      })),
    }],
  };
}

describe("map workspace model", () => {
  it("resolves exactly one structured note without changing anchor order", () => {
    const model = deriveMapsWorkspaceModel(project([NOTE_ID]), index([
      document("Locations/Mars.md", NOTE_ID, "location"),
    ]));
    expect(model).toMatchObject({
      problemAnchorCount: 0,
      maps: [{ anchors: [{ target: { kind: "resolved", path: "Locations/Mars.md", noteType: "location" } }] }],
    });
  });

  it("keeps missing, duplicate, and unstructured targets explicit", () => {
    const missing = deriveMapsWorkspaceModel(project([MISSING_ID]), index([]));
    expect(missing.maps[0]!.anchors[0]!.target).toMatchObject({ kind: "missing" });

    const duplicate = deriveMapsWorkspaceModel(project([NOTE_ID]), index([
      document("A.md", NOTE_ID, "location"),
      document("B.md", NOTE_ID, "location"),
    ]));
    expect(duplicate.maps[0]!.anchors[0]!.target).toEqual(expect.objectContaining({
      kind: "ambiguous",
      paths: ["A.md", "B.md"],
    }));

    const unstructured = deriveMapsWorkspaceModel(project([NOTE_ID]), index([
      document("Notes/Mars.md", NOTE_ID, null),
    ]));
    expect(unstructured.maps[0]!.anchors[0]!.target).toMatchObject({ kind: "unstructured" });
  });
});
