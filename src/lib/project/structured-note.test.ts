import { describe, expect, it } from "vitest";

import {
  createStructuredNote,
  STRUCTURED_NOTE_TEMPLATES,
  STRUCTURED_NOTE_TYPES,
  suggestStructuredNoteFileName,
  validateStructuredNoteFileName,
} from "./structured-note";

const NOTE_ID = "2cd59970-6ab4-46f9-b54b-a0e35af5b9e1";

describe("structured Markdown note templates", () => {
  it("defines every approved note type and semantic default", () => {
    expect(STRUCTURED_NOTE_TYPES).toEqual([
      "character",
      "location",
      "faction",
      "species",
      "technology",
      "spacecraft",
      "event",
      "scene",
      "chapter",
    ]);
    expect(STRUCTURED_NOTE_TEMPLATES.spacecraft.defaultRole).toBe("technology");
    expect(STRUCTURED_NOTE_TEMPLATES.event.defaultRole).toBe("timeline");
    expect(STRUCTURED_NOTE_TEMPLATES.scene.defaultRole).toBe("manuscript");
  });

  it("emits only the approved frontmatter fields in deterministic order", () => {
    const note = createStructuredNote({
      id: NOTE_ID,
      type: "character",
      title: "Captain ‘Sol’ Veyra: First Contact",
    });

    expect(note.split("---")[1]?.trim().split("\n")).toEqual([
      `id: "${NOTE_ID}"`,
      'type: "character"',
      'title: "Captain ‘Sol’ Veyra: First Contact"',
    ]);
    expect(note).toContain("# Captain ‘Sol’ Veyra: First Contact");
    expect(note).toContain("<!-- Who are they in one or two sentences?");
    expect(note.endsWith("\n")).toBe(true);
  });

  it("uses JSON-compatible YAML quoting for special title text", () => {
    expect(
      createStructuredNote({
        id: NOTE_ID,
        type: "location",
        title: 'Dock #7: The "Quiet" Ring',
      }),
    ).toContain('title: "Dock #7: The \\"Quiet\\" Ring"');
  });

  it("rejects invalid identifiers, titles, and unknown types", () => {
    expect(() =>
      createStructuredNote({ id: "not-a-uuid", type: "scene", title: "One" }),
    ).toThrow(RangeError);
    expect(() =>
      createStructuredNote({ id: NOTE_ID, type: "scene", title: "  " }),
    ).toThrow(RangeError);
    expect(() =>
      createStructuredNote({
        id: NOTE_ID,
        type: "rumor" as never,
        title: "Whispers",
      }),
    ).toThrow(RangeError);
  });
});

describe("structured note filenames", () => {
  it.each([
    ["A Quiet Red Planet", "location", "a-quiet-red-planet.md"],
    ["Élan Station", "location", "elan-station.md"],
    ["東京", "location", "location.md"],
  ] as const)("suggests a portable filename for %j", (title, type, expected) => {
    expect(suggestStructuredNoteFileName(title, type)).toBe(expected);
  });

  it("requires a valid Markdown filename", () => {
    expect(validateStructuredNoteFileName("captain-veyra.md")).toBeNull();
    expect(validateStructuredNoteFileName("captain-veyra.txt")).toMatch(/\.md/);
    expect(validateStructuredNoteFileName("../captain.md")).not.toBeNull();
  });
});
