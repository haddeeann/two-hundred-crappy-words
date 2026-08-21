import { describe, expect, it } from "vitest";

import {
  assessGoalCompletion,
  DailyGoalRepository,
  DEFAULT_DAILY_TARGET,
  MAX_DAILY_TARGET,
  parseDailyTarget,
  validateDailyTarget,
  type DailyGoalBackend,
} from "./daily-goal";

class MemoryBackend implements DailyGoalBackend {
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

describe("daily goal configuration", () => {
  it("keeps 200 as the opinionated default", () => {
    expect(DEFAULT_DAILY_TARGET).toBe(200);
  });

  it.each([
    ["1", 1],
    [" 350 ", 350],
    [String(MAX_DAILY_TARGET), MAX_DAILY_TARGET],
  ])("parses valid whole-word goal %j", (input, expected) => {
    expect(parseDailyTarget(input)).toBe(expected);
  });

  it.each(["", "0", "-1", "2.5", "words", "100001"])(
    "rejects invalid goal %j",
    (input) => expect(parseDailyTarget(input)).toBeNull(),
  );

  it("rejects unsafe programmatic values", () => {
    expect(() => validateDailyTarget(Number.NaN)).toThrow(RangeError);
    expect(() => validateDailyTarget(Number.MAX_SAFE_INTEGER)).toThrow(
      RangeError,
    );
  });
});

describe("daily completion", () => {
  const completedAt = "2026-08-21T12:00:00.000Z";

  it("does nothing below the goal", () => {
    expect(
      assessGoalCompletion({
        dailyWords: 199,
        target: 200,
        completedAt: null,
      }),
    ).toEqual({ completedAt: null, shouldAnnounce: false });
  });

  it("announces once when the goal is reached", () => {
    expect(
      assessGoalCompletion({
        dailyWords: 200,
        target: 200,
        completedAt: null,
        now: new Date(completedAt),
      }),
    ).toEqual({ completedAt, shouldAnnounce: true });
  });

  it("does not announce again after restart or a goal change", () => {
    expect(
      assessGoalCompletion({
        dailyWords: 500,
        target: 300,
        completedAt,
      }),
    ).toEqual({ completedAt, shouldAnnounce: false });
  });

  it("can complete when a goal is lowered below existing progress", () => {
    expect(
      assessGoalCompletion({
        dailyWords: 150,
        target: 100,
        completedAt: null,
        now: new Date(completedAt),
      }).shouldAnnounce,
    ).toBe(true);
  });
});

describe("daily goal repository", () => {
  it("uses 200 until a project chooses another target", async () => {
    const repository = new DailyGoalRepository(new MemoryBackend());
    expect(await repository.get("/world/andromeda")).toBe(200);
  });

  it("keeps project targets independent across restart", async () => {
    const backend = new MemoryBackend();
    const repository = new DailyGoalRepository(backend);
    await repository.set("/world/andromeda", 350);
    await repository.set("/world/orion", 500);

    const afterRestart = new DailyGoalRepository(backend);
    expect(await afterRestart.get("/world/andromeda")).toBe(350);
    expect(await afterRestart.get("/world/orion")).toBe(500);
    expect(backend.saves).toBe(2);
  });

  it("ignores malformed stored targets", async () => {
    const backend = new MemoryBackend();
    backend.values.set("targets", {
      "/world/valid": 250,
      "/world/zero": 0,
      "/world/text": "lots",
    });
    const repository = new DailyGoalRepository(backend);

    expect(await repository.get("/world/valid")).toBe(250);
    expect(await repository.get("/world/zero")).toBe(200);
    expect(await repository.get("/world/text")).toBe(200);
  });
});
