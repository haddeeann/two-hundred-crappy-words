import { describe, expect, it } from "vitest";

import { createIndependentProjectManifestText } from "./project-copy";
import { WORLD_PROJECT_FORMAT } from "./manifest";

const OLD_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const NEW_ID = "c6d5ba63-e70e-4618-9da8-6da077839f22";

function manifest(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: WORLD_PROJECT_FORMAT,
    formatVersion: 1,
    projectId: OLD_ID,
    name: "Copied World",
    folders: { manuscript: "Manuscript", futureRole: "Maps" },
    futureSetting: { preserve: true },
    ...overrides,
  });
}

describe("independent project copies", () => {
  it("changes only the project ID and preserves unknown version-one data", () => {
    const result = createIndependentProjectManifestText(manifest(), NEW_ID);

    expect(result.manifest.projectId).toBe(NEW_ID);
    expect(JSON.parse(result.text)).toEqual({
      format: WORLD_PROJECT_FORMAT,
      formatVersion: 1,
      projectId: NEW_ID,
      name: "Copied World",
      folders: { manuscript: "Manuscript", futureRole: "Maps" },
      futureSetting: { preserve: true },
    });
    expect(result.text.endsWith("\n")).toBe(true);
  });

  it("refuses malformed, unsupported, or invalid source text", () => {
    expect(() => createIndependentProjectManifestText("{", NEW_ID)).toThrow(
      /valid supported/,
    );
    expect(() =>
      createIndependentProjectManifestText(
        manifest({ formatVersion: 2 }),
        NEW_ID,
      ),
    ).toThrow(/valid supported/);
    expect(() =>
      createIndependentProjectManifestText(manifest(), "not-a-uuid"),
    ).toThrow(/did not validate/);
  });
});
