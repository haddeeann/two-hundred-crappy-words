import { describe, expect, it } from "vitest";

import { LoreIndexSession } from "./session";

describe("in-memory lore index session", () => {
  it("discards a stale asynchronous full scan", async () => {
    const session = new LoreIndexSession();
    let finish!: (sources: { path: string; text: string }[]) => void;
    const pending = session.rebuild(
      () => new Promise((resolve) => { finish = resolve; }),
    );

    session.invalidatePendingWork();
    finish([{ path: "old.md", text: "# Old" }]);

    await expect(pending).resolves.toEqual({ kind: "stale" });
    expect(session.current()).toBeNull();
  });

  it("overlays unsaved text in memory and restores disk-derived links", async () => {
    const session = new LoreIndexSession();
    const loaded = await session.rebuild(async () => [
      { path: "chapter.md", text: "No link yet." },
      { path: "mara.md", text: "# Mara" },
    ]);
    expect(loaded.kind).toBe("committed");

    const overlaid = session.setActiveOverlay("chapter.md", "Meet [[Mara]].");
    expect(overlaid.documents.get("chapter.md")?.outgoing[0]?.resolution).toMatchObject({
      kind: "resolved",
      targetPath: "mara.md",
    });

    const restored = session.clearActiveOverlay("chapter.md");
    expect(restored.documents.get("chapter.md")?.outgoing).toEqual([]);
  });

  it("updates and removes disk sources without persisting creative text", async () => {
    const session = new LoreIndexSession();
    await session.rebuild(async () => [{ path: "one.md", text: "# One" }]);

    expect(session.replaceDiskSource("two.md", "# Two").documents.size).toBe(2);
    expect(session.removeDiskSource("one.md").documents.has("one.md")).toBe(false);
  });
});
