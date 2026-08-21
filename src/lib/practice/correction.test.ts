import { describe, expect, it } from "vitest";

import { createDailyProgressRecord } from "./daily-ledger";
import {
  correctDailyProgressRecord,
  parseCorrectedWords,
} from "./correction";

function record(words: number, completedAt: string | null = null) {
  return createDailyProgressRecord({
    projectPath: "/world/andromeda",
    dateKey: "2026-08-21",
    creditedWords: words,
    revision: 3,
    completedAt,
    target: 200,
    now: new Date("2026-08-21T12:00:00.000Z"),
  });
}

describe("daily progress correction", () => {
  it("appends an audit entry and advances the record revision", () => {
    const corrected = correctDailyProgressRecord(
      record(150),
      125,
      new Date("2026-08-21T13:00:00.000Z"),
    );

    expect(corrected).toMatchObject({
      creditedWords: 125,
      revision: 4,
      updatedAt: "2026-08-21T13:00:00.000Z",
      completedAt: null,
      corrections: [
        {
          previousWords: 150,
          correctedWords: 125,
          correctedAt: "2026-08-21T13:00:00.000Z",
        },
      ],
    });
  });

  it("retains every prior value across repeated corrections", () => {
    const first = correctDailyProgressRecord(record(150), 125);
    const second = correctDailyProgressRecord(first, 140);

    expect(second.corrections).toHaveLength(2);
    expect(second.corrections?.map((entry) => entry.previousWords)).toEqual([
      150, 125,
    ]);
  });

  it("removes a mistaken completion below the recorded goal", () => {
    const corrected = correctDailyProgressRecord(
      record(220, "2026-08-21T12:00:00.000Z"),
      180,
    );

    expect(corrected.completedAt).toBeNull();
  });

  it("records completion without a later UI announcement when raised to goal", () => {
    const now = new Date("2026-08-21T13:00:00.000Z");
    const corrected = correctDailyProgressRecord(record(180), 200, now);

    expect(corrected.completedAt).toBe(now.toISOString());
    expect(corrected.completedTarget).toBe(200);
  });

  it("preserves the goal originally reached when correcting a completed day", () => {
    const original = {
      ...record(5, "2026-08-21T12:00:00.000Z"),
      target: 8,
      completedTarget: 5,
    };

    expect(correctDailyProgressRecord(original, 6).completedTarget).toBe(5);
  });

  it("returns the same record when the total is unchanged", () => {
    const original = record(150);
    expect(correctDailyProgressRecord(original, 150)).toBe(original);
  });

  it("accepts only non-negative safe whole-number input", () => {
    expect(parseCorrectedWords(" 0 ")).toBe(0);
    expect(parseCorrectedWords("250")).toBe(250);
    expect(parseCorrectedWords("-1")).toBeNull();
    expect(parseCorrectedWords("1.5")).toBeNull();
    expect(parseCorrectedWords("words")).toBeNull();
    expect(parseCorrectedWords(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
  });
});
