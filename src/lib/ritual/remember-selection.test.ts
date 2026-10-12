import { describe, expect, it } from "vitest";

import {
  captureRememberSelection,
  createRememberedStructuredNote,
  MAX_REMEMBER_SELECTION_LENGTH,
  validateRememberSelectionSnapshot,
} from "./remember-selection";

const NOTE_ID = "2cd59970-6ab4-46f9-b54b-a0e35af5b9e1";

describe("remembering selected prose", () => {
  it("freezes the exact source range and fingerprint", () => {
    const result = captureRememberSelection({
      sourcePath: "Daily/2026-10-12.md",
      content: "Mara crossed the red plain.",
      selectionStart: 0,
      selectionEnd: 4,
    });

    expect(result).toMatchObject({
      kind: "ready",
      snapshot: {
        sourcePath: "Daily/2026-10-12.md",
        selectionStart: 0,
        selectionEnd: 4,
        selectedText: "Mara",
      },
    });
  });

  it("refuses blank, invalid, and overlong selections", () => {
    expect(
      captureRememberSelection({
        sourcePath: "draft.md",
        content: "only spaces   here",
        selectionStart: 11,
        selectionEnd: 14,
      }).kind,
    ).toBe("refused");
    expect(
      captureRememberSelection({
        sourcePath: "draft.md",
        content: "short",
        selectionStart: 3,
        selectionEnd: 99,
      }).kind,
    ).toBe("refused");
    expect(
      captureRememberSelection({
        sourcePath: "draft.md",
        content: "x".repeat(MAX_REMEMBER_SELECTION_LENGTH + 1),
        selectionStart: 0,
        selectionEnd: MAX_REMEMBER_SELECTION_LENGTH + 1,
      }).kind,
    ).toBe("refused");
  });

  it("detects source path and content changes before writing", () => {
    const result = captureRememberSelection({
      sourcePath: "draft.md",
      content: "Mara crossed the red plain.",
      selectionStart: 0,
      selectionEnd: 4,
    });
    if (result.kind !== "ready") throw new Error("expected ready selection");

    expect(
      validateRememberSelectionSnapshot(result.snapshot, {
        sourcePath: "draft.md",
        content: "Mara crossed the red plain.",
      }),
    ).toBeNull();
    expect(
      validateRememberSelectionSnapshot(result.snapshot, {
        sourcePath: "other.md",
        content: "Mara crossed the red plain.",
      }),
    ).toMatch(/source file changed/i);
    expect(
      validateRememberSelectionSnapshot(result.snapshot, {
        sourcePath: "draft.md",
        content: "Mara crossed another plain.",
      }),
    ).toMatch(/source text changed/i);
  });

  it("creates a portable note without copying or linking the source prose", () => {
    const note = createRememberedStructuredNote({
      id: NOTE_ID,
      type: "character",
      title: "Mara Vale",
      summary: "The surveyor who first hears the buried signal.",
      consistency: "She is left-handed.",
    });

    expect(note).toContain('type: "character"');
    expect(note).toContain("## Summary\n\nThe surveyor who first hears the buried signal.");
    expect(note).toContain("## Notes\n\n### Keep consistent\n\nShe is left-handed.");
    expect(note).not.toContain("[[");
    expect(note).not.toContain("crossed the red plain");
  });
});
