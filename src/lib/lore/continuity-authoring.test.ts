import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "./index";
import { continuityAuthoringContext } from "./continuity-authoring";

const NOTE_ID = "2cd59970-6ab4-46f9-b54b-a0e35af5b9e1";
const TARGET_ID = "f8c20f24-4368-4c21-a1f7-a2ba31bd73a4";

describe("continuity authoring eligibility", () => {
  it("exposes only saved, fingerprint-current, uniquely identified notes and targets", () => {
    const active = `---\nid: "${NOTE_ID}"\ntype: "character"\ntitle: "Mara"\n---\nBody`;
    const index = buildLoreProjectIndex([
      { path: "mara.md", text: active },
      { path: "fleet.md", text: `---\nid: "${TARGET_ID}"\ntitle: "Fleet"\n---` },
      { path: "copy.md", text: `---\nid: "99944941-6705-4d4b-977c-4f8785473330"\ntitle: "Copy"\n---` },
      { path: "copy-two.md", text: `---\nid: "99944941-6705-4d4b-977c-4f8785473330"\ntitle: "Copy two"\n---` },
    ]);

    expect(continuityAuthoringContext(index, "mara.md", active, true)).toMatchObject({
      kind: "ready",
      path: "mara.md",
      noteId: NOTE_ID,
      noteType: "character",
      noteChoices: [
        { id: TARGET_ID, title: "Fleet", path: "fleet.md" },
        { id: NOTE_ID, title: "Mara", path: "mara.md" },
      ],
    });
    expect(continuityAuthoringContext(index, "mara.md", active, false)).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("Save this note"),
    });
    expect(continuityAuthoringContext(index, "mara.md", `${active} changed`, true)).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("catch up"),
    });
  });

  it("refuses missing and duplicated stable note identities", () => {
    const noId = "---\ntitle: \"No ID\"\n---";
    expect(
      continuityAuthoringContext(
        buildLoreProjectIndex([{ path: "no-id.md", text: noId }]),
        "no-id.md",
        noId,
        true,
      ),
    ).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("stable note ID") });

    const duplicated = `---\nid: "${NOTE_ID}"\n---`;
    const duplicateIndex = buildLoreProjectIndex([
      { path: "one.md", text: duplicated },
      { path: "two.md", text: duplicated },
    ]);
    expect(continuityAuthoringContext(duplicateIndex, "one.md", duplicated, true)).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("more than one file"),
    });
  });
});
