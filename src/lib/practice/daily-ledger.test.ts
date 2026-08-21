import { describe, expect, it } from "vitest";

import {
  createDailyProgressRecord,
  DailyProgressRepository,
  localDateKey,
  resolveDailyProgress,
  type DailyProgressBackend,
} from "./daily-ledger";
import { correctDailyProgressRecord } from "./correction";

class MemoryBackend implements DailyProgressBackend {
  values = new Map<string, unknown>();
  saves = 0;

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async save(): Promise<void> {
    this.saves += 1;
  }
}

function record(
  creditedWords: number,
  revision: number,
  projectPath = "/world/andromeda",
  dateKey = "2026-08-21",
) {
  return createDailyProgressRecord({
    projectPath,
    dateKey,
    creditedWords,
    revision,
    completedAt: null,
    target: 200,
    now: new Date("2026-08-21T12:00:00.000Z"),
  });
}

describe("local calendar dates", () => {
  it("uses local calendar components rather than a UTC slice", () => {
    expect(localDateKey(new Date(2026, 7, 21, 23, 59))).toBe("2026-08-21");
  });

  it("changes at local midnight", () => {
    expect(localDateKey(new Date(2026, 7, 21, 23, 59, 59))).toBe(
      "2026-08-21",
    );
    expect(localDateKey(new Date(2026, 7, 22, 0, 0, 0))).toBe("2026-08-22");
  });

  it("rejects invalid dates and impossible record keys", () => {
    expect(() => localDateKey(new Date(Number.NaN))).toThrow(RangeError);
    expect(() =>
      createDailyProgressRecord({
        projectPath: "/world",
        dateKey: "2026-02-30",
        creditedWords: 1,
        revision: 1,
      }),
    ).toThrow(RangeError);
  });

  it("restores a prior date when the local clock moves backward", () => {
    const earlier = record(8, 1, "/world/andromeda", "2026-08-20");
    const later = record(13, 2, "/world/andromeda", "2026-08-21");
    const records = {
      [earlier.dateKey]: earlier,
      [later.dateKey]: later,
    };

    expect(resolveDailyProgress(records, new Date(2026, 7, 21, 12))).toEqual({
      dateKey: "2026-08-21",
      creditedWords: 13,
      revision: 2,
      completedAt: null,
      completedTarget: null,
    });
    expect(resolveDailyProgress(records, new Date(2026, 7, 20, 12))).toEqual({
      dateKey: "2026-08-20",
      creditedWords: 8,
      revision: 1,
      completedAt: null,
      completedTarget: null,
    });
  });

  it("starts a date with zero without modifying other entries", () => {
    const existing = record(13, 2);
    expect(
      resolveDailyProgress(
        { [existing.dateKey]: existing },
        new Date(2026, 7, 22, 0, 0),
      ),
    ).toEqual({
      dateKey: "2026-08-22",
      creditedWords: 0,
      revision: 0,
      completedAt: null,
      completedTarget: null,
    });
  });

  it("restores the goal that was actually completed after a later goal change", () => {
    const completed = createDailyProgressRecord({
      projectPath: "/world/andromeda",
      dateKey: "2026-08-21",
      creditedWords: 5,
      revision: 2,
      completedAt: "2026-08-21T12:00:00.000Z",
      completedTarget: 5,
      target: 8,
    });

    expect(
      resolveDailyProgress(
        { [completed.dateKey]: completed },
        new Date(2026, 7, 21, 12),
      ).completedTarget,
    ).toBe(5);
  });
});

describe("daily progress repository", () => {
  it("keeps projects and dates independent", async () => {
    const repository = new DailyProgressRepository(new MemoryBackend());
    await repository.put(record(12, 1));
    await repository.put(record(7, 1, "/world/orion"));
    await repository.put(record(4, 1, "/world/andromeda", "2026-08-20"));

    expect(
      (await repository.get("/world/andromeda", "2026-08-21"))
        ?.creditedWords,
    ).toBe(12);
    expect(
      (await repository.get("/world/orion", "2026-08-21"))?.creditedWords,
    ).toBe(7);
    expect(
      (await repository.get("/world/andromeda", "2026-08-20"))
        ?.creditedWords,
    ).toBe(4);
  });

  it("retains progress across repository instances", async () => {
    const backend = new MemoryBackend();
    const completed = createDailyProgressRecord({
      projectPath: "/world/andromeda",
      dateKey: "2026-08-21",
      creditedWords: 31,
      revision: 1,
      completedAt: "2026-08-21T12:00:00.000Z",
      target: 200,
      now: new Date("2026-08-21T12:00:00.000Z"),
    });
    await new DailyProgressRepository(backend).put(completed);

    const afterRestart = new DailyProgressRepository(backend);
    expect(await afterRestart.get("/world/andromeda", "2026-08-21")).toEqual(
      completed,
    );
  });

  it("retains the correction audit across repository instances", async () => {
    const backend = new MemoryBackend();
    const corrected = correctDailyProgressRecord(
      record(31, 1),
      24,
      new Date("2026-08-21T13:00:00.000Z"),
    );
    await new DailyProgressRepository(backend).put(corrected);

    expect(
      await new DailyProgressRepository(backend).get(
        "/world/andromeda",
        "2026-08-21",
      ),
    ).toEqual(corrected);
  });

  it("serializes rapid writes and keeps the newest revision", async () => {
    const backend = new MemoryBackend();
    const repository = new DailyProgressRepository(backend);

    await Promise.all([
      repository.put(record(10, 1)),
      repository.put(record(12, 2)),
      repository.put(record(11, 1)),
    ]);

    expect(
      (await repository.get("/world/andromeda", "2026-08-21"))
        ?.creditedWords,
    ).toBe(12);
    expect(backend.saves).toBe(2);
  });

  it("does not replace a record with a different payload at the same revision", async () => {
    const backend = new MemoryBackend();
    const repository = new DailyProgressRepository(backend);
    await repository.put(record(12, 2));
    await repository.put(record(99, 2));

    expect(
      (await repository.get("/world/andromeda", "2026-08-21"))
        ?.creditedWords,
    ).toBe(12);
    expect(backend.saves).toBe(1);
  });

  it("returns all valid dates for clock or time-zone changes", async () => {
    const repository = new DailyProgressRepository(new MemoryBackend());
    await repository.put(record(9, 1, "/world/andromeda", "2026-08-20"));
    await repository.put(record(14, 2, "/world/andromeda", "2026-08-21"));

    expect(Object.keys(await repository.getProject("/world/andromeda"))).toEqual(
      ["2026-08-20", "2026-08-21"],
    );
  });

  it("ignores malformed and cross-project records", async () => {
    const backend = new MemoryBackend();
    backend.values.set("projects", {
      "/world/andromeda": {
        "2026-08-21": { creditedWords: 999 },
        "2026-08-22": record(5, 1, "/world/orion", "2026-08-22"),
      },
    });

    expect(
      await new DailyProgressRepository(backend).getProject(
        "/world/andromeda",
      ),
    ).toEqual({});
  });

  it("ignores a record with a malformed correction audit", async () => {
    const backend = new MemoryBackend();
    backend.values.set("projects", {
      "/world/andromeda": {
        "2026-08-21": {
          ...record(20, 3),
          corrections: [{ previousWords: 21, correctedWords: -1 }],
        },
      },
    });

    expect(
      await new DailyProgressRepository(backend).getProject(
        "/world/andromeda",
      ),
    ).toEqual({});
  });

  it("stores counters and bookkeeping without manuscript text", () => {
    expect(record(20, 3)).toEqual({
      version: 1,
      projectPath: "/world/andromeda",
      dateKey: "2026-08-21",
      creditedWords: 20,
      updatedAt: "2026-08-21T12:00:00.000Z",
      revision: 3,
      completedAt: null,
      target: 200,
    });
  });

  it("rejects malformed completion timestamps", () => {
    expect(() =>
      createDailyProgressRecord({
        projectPath: "/world/andromeda",
        dateKey: "2026-08-21",
        creditedWords: 200,
        revision: 2,
        completedAt: "sometime later",
        target: 200,
      }),
    ).toThrow(RangeError);
  });
});
