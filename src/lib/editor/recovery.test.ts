import { describe, expect, it } from "vitest";
import {
  assessRecovery,
  createRecoveryRecord,
  fingerprintContent,
  formatRecoveryPreview,
  RecoveryRepository,
  type RecoveryBackend,
} from "./recovery";

class MemoryBackend implements RecoveryBackend {
  values = new Map<string, unknown>();
  saves = 0;

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async save(): Promise<void> {
    this.saves += 1;
  }
}

function record(revision: number, content = `draft ${revision}`) {
  return createRecoveryRecord({
    path: "/world/chapter.md",
    content,
    persistedContent: "original",
    revision,
    now: new Date("2026-08-19T12:00:00.000Z"),
  });
}

describe("recovery records", () => {
  it("creates a versioned record without storing a second base copy", () => {
    const recovery = record(3);

    expect(recovery).toEqual({
      version: 1,
      path: "/world/chapter.md",
      content: "draft 3",
      baseFingerprint: fingerprintContent("original"),
      updatedAt: "2026-08-19T12:00:00.000Z",
      revision: 3,
    });
  });

  it("recognizes a recovery copy already persisted to the file", () => {
    expect(assessRecovery(record(1), "draft 1").kind).toBe("identical");
  });

  it("detects when both the recovery copy and source file changed", () => {
    const assessment = assessRecovery(record(1), "external change");

    expect(assessment.kind).toBe("recoverable");
    if (assessment.kind === "recoverable") {
      expect(assessment.fileChangedSinceRecoveryBegan).toBe(true);
    }
  });

  it("formats bounded excerpts so a recovery choice is informed", () => {
    expect(formatRecoveryPreview("on disk", "draft", 4)).toBe(
      "FILE ON DISK\non d…\n\nRECOVERY DRAFT\ndraf…",
    );
  });

  it("retains recovery data across repository instances", async () => {
    const backend = new MemoryBackend();
    await new RecoveryRepository(backend).put(record(4));

    const afterRestart = new RecoveryRepository(backend);
    expect((await afterRestart.get(record(4).path))?.content).toBe("draft 4");
  });

  it("does not replace a newer recovery record with an older write", async () => {
    const repository = new RecoveryRepository(new MemoryBackend());

    await Promise.all([repository.put(record(2)), repository.put(record(1))]);

    expect((await repository.get(record(2).path))?.revision).toBe(2);
  });

  it("removes only records covered by a persisted revision", async () => {
    const backend = new MemoryBackend();
    const repository = new RecoveryRepository(backend);
    await repository.put(record(3));

    await repository.remove(record(3).path, 2);
    expect(await repository.get(record(3).path)).not.toBeNull();

    await repository.remove(record(3).path, 3);
    expect(await repository.get(record(3).path)).toBeNull();
    expect(backend.saves).toBe(2);
  });

  it("ignores malformed records", async () => {
    const backend = new MemoryBackend();
    backend.values.set("records", {
      "/world/chapter.md": { path: "/world/chapter.md", content: "draft" },
    });
    const repository = new RecoveryRepository(backend);

    expect(await repository.get("/world/chapter.md")).toBeNull();
  });
});
