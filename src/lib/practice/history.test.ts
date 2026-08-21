import { describe, expect, it } from "vitest";

import {
  createDailyProgressRecord,
  type DailyProgressRecords,
} from "./daily-ledger";
import {
  createWritingHistory,
  formatStreakSummary,
  summarizeStreaks,
} from "./history";

function records(
  entries: Array<[dateKey: string, creditedWords: number, completed: boolean]>,
): DailyProgressRecords {
  return Object.fromEntries(
    entries.map(([dateKey, creditedWords, completed], index) => [
      dateKey,
      createDailyProgressRecord({
        projectPath: "/world/andromeda",
        dateKey,
        creditedWords,
        revision: index + 1,
        completedAt: completed ? `${dateKey}T12:00:00.000Z` : null,
        target: 200,
        now: new Date(`${dateKey}T12:00:00.000Z`),
      }),
    ]),
  );
}

describe("writing history", () => {
  it("lists recorded dates newest first without inventing missed days", () => {
    expect(
      createWritingHistory(
        records([
          ["2026-08-19", 205, true],
          ["2026-08-21", 80, false],
        ]),
      ),
    ).toEqual([
      {
        dateKey: "2026-08-21",
        creditedWords: 80,
        target: 200,
        completed: false,
        correctionCount: 0,
      },
      {
        dateKey: "2026-08-19",
        creditedWords: 205,
        target: 200,
        completed: true,
        correctionCount: 0,
      },
    ]);
  });
});

describe("humane streak summaries", () => {
  it("counts consecutive completed dates through today", () => {
    const summary = summarizeStreaks(
      records([
        ["2026-08-19", 200, true],
        ["2026-08-20", 210, true],
        ["2026-08-21", 220, true],
      ]),
      "2026-08-21",
    );

    expect(summary).toEqual({ current: 3, best: 3, completedDays: 3 });
    expect(formatStreakSummary(summary)).toBe("3-day rhythm · Best 3");
  });

  it("keeps yesterday's rhythm available while today is still open", () => {
    expect(
      summarizeStreaks(
        records([
          ["2026-08-19", 200, true],
          ["2026-08-20", 200, true],
        ]),
        "2026-08-21",
      ).current,
    ).toBe(2);
  });

  it("uses fresh-start language after a gap without erasing the best", () => {
    const summary = summarizeStreaks(
      records([
        ["2026-08-15", 200, true],
        ["2026-08-16", 200, true],
        ["2026-08-17", 200, true],
      ]),
      "2026-08-21",
    );

    expect(summary).toEqual({ current: 0, best: 3, completedDays: 3 });
    expect(formatStreakSummary(summary)).toBe(
      "A fresh start today · Best 3",
    );
  });

  it("handles month, year, and leap-day boundaries as calendar days", () => {
    expect(
      summarizeStreaks(
        records([
          ["2028-02-28", 200, true],
          ["2028-02-29", 200, true],
          ["2028-03-01", 200, true],
        ]),
        "2028-03-01",
      ).current,
    ).toBe(3);

    expect(
      summarizeStreaks(
        records([
          ["2025-12-31", 200, true],
          ["2026-01-01", 200, true],
        ]),
        "2026-01-01",
      ).current,
    ).toBe(2);
  });

  it("ignores future clock-correction entries for the current rhythm", () => {
    expect(
      summarizeStreaks(
        records([
          ["2026-08-21", 200, true],
          ["2026-08-22", 200, true],
        ]),
        "2026-08-20",
      ).current,
    ).toBe(0);
  });

  it("rejects malformed current date keys instead of normalizing them", () => {
    expect(() => summarizeStreaks({}, "2026-8-21")).toThrow(RangeError);
    expect(() => summarizeStreaks({}, "2026-02-30")).toThrow(RangeError);
  });
});
