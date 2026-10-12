import { describe, expect, it } from "vitest";
import { createDailyProgressRecord } from "./daily-ledger";
import {
  challengeDefaultDates,
  createWritingChallenge,
  WritingChallengeRepository,
  writingChallengeProgress,
  type WritingChallengeBackend,
} from "./challenge";

class MemoryBackend implements WritingChallengeBackend {
  values = new Map<string, unknown>();
  saves = 0;
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
  async save(): Promise<void> { this.saves += 1; }
}

function challenge() {
  return createWritingChallenge(
    { name: "Draft November", target: 50_000, validFrom: "2026-11-01", validTo: "2026-11-30" },
    null,
    new Date("2026-10-12T12:00:00Z"),
    "challenge-1",
  );
}

function record(dateKey: string, creditedWords: number) {
  return createDailyProgressRecord({
    projectPath: "project:elsewhere",
    dateKey,
    creditedWords,
    revision: 1,
    now: new Date("2026-11-10T12:00:00Z"),
  });
}

describe("writing challenges", () => {
  it("uses an inclusive final day and reads the existing ledger", () => {
    const item = challenge();
    expect(writingChallengeProgress(item, {
      "2026-10-31": record("2026-10-31", 900),
      "2026-11-01": record("2026-11-01", 1200),
      "2026-11-30": record("2026-11-30", 800),
      "2026-12-01": record("2026-12-01", 700),
    }, "2026-11-15")).toEqual({
      creditedWords: 2000,
      participatedDays: 2,
      availableDays: 30,
      status: "active",
    });
  });

  it("shows a future challenge as upcoming without inventing progress", () => {
    expect(writingChallengeProgress(challenge(), {}, "2026-10-12")).toEqual({
      creditedWords: 0,
      participatedDays: 0,
      availableDays: 30,
      status: "upcoming",
    });
  });

  it("treats reaching the total as complete without changing daily goals", () => {
    const item = createWritingChallenge({
      name: "Small finish",
      target: 2000,
      validFrom: "2026-11-01",
      validTo: "2026-11-30",
    }, null, new Date("2026-11-10T12:00:00Z"), "challenge-2");
    expect(writingChallengeProgress(item, {
      "2026-11-01": record("2026-11-01", 2000),
    }, "2026-11-02").status).toBe("complete");
  });

  it("rejects reversed and impossible date windows", () => {
    expect(() => createWritingChallenge({
      name: "Backwards", target: 100, validFrom: "2026-11-30", validTo: "2026-11-01",
    })).toThrow("final day");
    expect(() => createWritingChallenge({
      name: "Impossible", target: 100, validFrom: "2026-02-30", validTo: "2026-03-01",
    })).toThrow("real calendar");
  });

  it("defaults to today through the final valid day of the month", () => {
    expect(challengeDefaultDates(new Date(2028, 1, 10, 9))).toEqual({
      validFrom: "2028-02-10",
      validTo: "2028-02-29",
    });
  });
});

describe("writing challenge repository", () => {
  it("stores, edits, and clears one project-local challenge", async () => {
    const backend = new MemoryBackend();
    const repository = new WritingChallengeRepository(backend);
    const original = challenge();
    await repository.set("project:elsewhere", original);
    const edited = createWritingChallenge({ ...original, target: 60_000 }, original, new Date("2026-10-13T12:00:00Z"));
    await repository.set("project:elsewhere", edited);
    expect(await repository.get("project:elsewhere")).toMatchObject({ id: original.id, target: 60_000 });
    await expect(repository.clear("project:elsewhere")).resolves.toBe(true);
    expect(await repository.get("project:elsewhere")).toBeNull();
  });

  it("copies a path-keyed challenge to stable identity without replacing one", async () => {
    const repository = new WritingChallengeRepository(new MemoryBackend());
    await repository.set("/world", challenge());
    await expect(repository.copyProject("/world", "project:stable")).resolves.toBe(true);
    await expect(repository.copyProject("/world", "project:stable")).resolves.toBe(false);
    expect(await repository.get("project:stable")).toMatchObject({ name: "Draft November" });
  });

  it("ignores malformed stored challenges", async () => {
    const backend = new MemoryBackend();
    backend.values.set("challenges", { broken: { version: 1, target: -1 } });
    expect(await new WritingChallengeRepository(backend).get("broken")).toBeNull();
  });
});
