import { describe, expect, it } from "vitest";

import {
  applyDailyPracticeEdit,
  beginDailyPractice,
  countWords,
} from "./word-count";

describe("document word count", () => {
  it.each([
    ["", 0],
    ["  \n\t  ", 0],
    ["The moon wakes.", 3],
    ["**Bold** [two words]", 3],
    ["🚀 + = 🌌", 0],
  ])("counts %j as %i words", (text, expected) => {
    expect(countWords(text)).toBe(expected);
  });

  it("keeps straight and curly internal apostrophes within words", () => {
    expect(countWords("don't writer’s l’esprit rock'n'roll")).toBe(4);
  });

  it("splits hyphens, en dashes, and em dashes", () => {
    expect(countWords("star-crossed past—future near–far")).toBe(6);
  });

  it("keeps periods and commas between digits within numbers", () => {
    expect(countWords("42 3.14 1,000 version 2.0.1")).toBe(5);
  });

  it("counts letters from representative spaced scripts", () => {
    expect(countWords("naïve café; Привет мир; مرحبا بالعالم")).toBe(6);
  });

  it("keeps decomposed combining marks attached to their letters", () => {
    expect(countWords("Cafe\u0301 re\u0301sume\u0301")).toBe(2);
  });

  it("uses one deterministic token for a contiguous unspaced run", () => {
    expect(countWords("星系文明")).toBe(1);
  });
});

describe("daily practice credit", () => {
  it("establishes a baseline without crediting existing text", () => {
    expect(beginDailyPractice("three existing words", 40)).toEqual({
      documentWords: 3,
      dailyWords: 40,
    });
  });

  it("credits only a positive document-count change", () => {
    const baseline = beginDailyPractice("one two", 10);
    const edited = applyDailyPracticeEdit(baseline, "one two three four");

    expect(edited).toEqual({ documentWords: 4, dailyWords: 12 });
  });

  it("does not remove earned credit when words are deleted", () => {
    const baseline = beginDailyPractice("one two three", 7);
    const edited = applyDailyPracticeEdit(baseline, "one");

    expect(edited).toEqual({ documentWords: 1, dailyWords: 7 });
  });

  it("credits new growth after deletion because revision is writing", () => {
    const baseline = beginDailyPractice("one two three", 7);
    const deleted = applyDailyPracticeEdit(baseline, "one");
    const rewritten = applyDailyPracticeEdit(deleted, "one four five");

    expect(rewritten).toEqual({ documentWords: 3, dailyWords: 9 });
  });

  it("credits the net positive change from a paste or replacement", () => {
    const baseline = beginDailyPractice("one two", 0);
    const pasted = applyDailyPracticeEdit(
      baseline,
      "one two three four five",
    );
    const sameSizeReplacement = applyDailyPracticeEdit(
      pasted,
      "six seven eight nine ten",
    );

    expect(pasted.dailyWords).toBe(3);
    expect(sameSizeReplacement).toEqual({
      documentWords: 5,
      dailyWords: 3,
    });
  });
});
