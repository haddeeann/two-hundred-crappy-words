import { describe, expect, it } from "vitest";

import {
  createWorldProjectManifest,
  parseWorldProjectManifest,
  serializeWorldProjectManifest,
  validateProjectDirectoryPath,
  WORLD_PROJECT_FORMAT,
  WORLD_PROJECT_MANIFEST_FILE,
  worldProjectStorageKey,
} from "./manifest";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";

function validSource(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: WORLD_PROJECT_FORMAT,
    formatVersion: 1,
    projectId: PROJECT_ID,
    name: "A Quiet Red Planet",
    folders: {
      manuscript: "Manuscript",
      characters: "World/Lore/Characters",
    },
    ...overrides,
  });
}

describe("world project manifest", () => {
  it("uses a visible product-specific manifest name", () => {
    expect(WORLD_PROJECT_MANIFEST_FILE).toBe(
      "200-crappy-words.project.json",
    );
  });

  it("parses version 1 and normalizes only the in-memory display name", () => {
    const result = parseWorldProjectManifest(
      validSource({ name: "  A Quiet Red Planet  ", futureField: true }),
    );

    expect(result).toMatchObject({
      kind: "valid",
      manifest: {
        projectId: PROJECT_ID,
        name: "A Quiet Red Planet",
        folders: {
          manuscript: "Manuscript",
          characters: "World/Lore/Characters",
        },
      },
      source: { futureField: true },
    });
  });

  it("tolerates unknown folder roles without assigning behavior to them", () => {
    const result = parseWorldProjectManifest(
      validSource({ folders: { characters: "Characters", planets: "Planets" } }),
    );

    expect(result).toMatchObject({
      kind: "valid",
      manifest: { folders: { characters: "Characters" } },
      source: { folders: { planets: "Planets" } },
    });
  });

  it("separates malformed JSON, invalid version 1, and newer versions", () => {
    expect(parseWorldProjectManifest("{")).toMatchObject({
      kind: "malformed",
    });
    expect(
      parseWorldProjectManifest(validSource({ projectId: "not-a-uuid" })),
    ).toEqual({
      kind: "invalid",
      issues: ["projectId must be a canonical lowercase UUID v4."],
    });
    expect(
      parseWorldProjectManifest(
        JSON.stringify({
          format: WORLD_PROJECT_FORMAT,
          formatVersion: 2,
        }),
      ),
    ).toEqual({ kind: "unsupported-version", version: 2 });
  });

  it.each([
    ["", "non-empty"],
    ["/Characters", "empty, . or .."],
    ["Characters/", "empty, . or .."],
    ["Characters//Crew", "empty, . or .."],
    ["Characters/../Research", "empty, . or .."],
    ["Characters\\Crew", "forward slashes"],
    ["Characters/Bad:Name", "invalid path segment"],
  ])("rejects unsafe project directory path %j", (path, message) => {
    expect(validateProjectDirectoryPath(path)).toContain(message);
  });

  it("allows portable nested directory paths", () => {
    expect(validateProjectDirectoryPath("World/Lore/Characters")).toBeNull();
  });

  it("creates deterministic manifests and serializes with a trailing newline", () => {
    const manifest = createWorldProjectManifest({
      projectId: PROJECT_ID,
      name: "  A Quiet Red Planet  ",
      folders: {
        inbox: "Inbox",
        manuscript: "Manuscript",
      },
    });

    expect(Object.keys(manifest.folders)).toEqual(["manuscript", "inbox"]);
    const serialized = serializeWorldProjectManifest(manifest);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toEqual(manifest);
  });

  it("rejects invalid new manifests and storage keys", () => {
    expect(() =>
      createWorldProjectManifest({
        projectId: PROJECT_ID,
        name: "",
      }),
    ).toThrow(/name must not be empty/);
    expect(() => worldProjectStorageKey("not-a-uuid")).toThrow(/UUID v4/);
  });

  it("namespaces stable app-local identity away from ordinary paths", () => {
    expect(worldProjectStorageKey(PROJECT_ID)).toBe(`project:${PROJECT_ID}`);
  });
});
