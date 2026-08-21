import { describe, expect, it } from "vitest";

import { DEFAULT_DAILY_TARGET, presentPractice } from "./progress";

describe("practice progress presentation", () => {
  it("formats document and session counts", () => {
    expect(presentPractice({ documentWords: 42, dailyWords: 17 })).toEqual({
      documentLabel: "42 words",
      sessionLabel: "This session · 17 / 200",
      accessibleSessionLabel: "This session: 17 of 200 words",
      progressValue: 17,
    });
  });

  it("uses the singular document label", () => {
    expect(
      presentPractice({ documentWords: 1, dailyWords: 0 }).documentLabel,
    ).toBe("1 word");
  });

  it("caps the visual meter while retaining earned credit in its label", () => {
    const presentation = presentPractice({
      documentWords: 250,
      dailyWords: 247,
    });

    expect(presentation.progressValue).toBe(DEFAULT_DAILY_TARGET);
    expect(presentation.sessionLabel).toContain("247 / 200");
  });

  it("rejects invalid targets", () => {
    expect(() =>
      presentPractice({ documentWords: 0, dailyWords: 0 }, 0),
    ).toThrow(RangeError);
  });
});
