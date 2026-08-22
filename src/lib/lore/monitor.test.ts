import { afterEach, describe, expect, it, vi } from "vitest";

import { LoreChangeMonitor, shouldReconcileWatchEvent } from "./monitor";

afterEach(() => vi.useRealTimers());

describe("lore filesystem event monitor", () => {
  it("ignores read-access noise but retains content and rename events", () => {
    expect(shouldReconcileWatchEvent({ access: { kind: "open", mode: "read" } })).toBe(false);
    expect(shouldReconcileWatchEvent({ modify: { kind: "metadata", mode: "access-time" } })).toBe(false);
    expect(shouldReconcileWatchEvent({ modify: { kind: "data", mode: "content" } })).toBe(true);
    expect(shouldReconcileWatchEvent({ modify: { kind: "rename", mode: "both" } })).toBe(true);
    expect(shouldReconcileWatchEvent("any")).toBe(true);
  });

  it("debounces noisy paths into one serialized batch", async () => {
    vi.useFakeTimers();
    const batches: { paths: string[]; revision: number }[] = [];
    const monitor = new LoreChangeMonitor({
      delayMs: 50,
      reconcile: async (batch) => { batches.push(batch); },
    });

    monitor.notify(["one.md"]);
    monitor.notify(["one.md", "two.md"]);
    await vi.advanceTimersByTimeAsync(49);
    expect(batches).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await monitor.flush();

    expect(batches).toEqual([
      { paths: ["one.md", "two.md"], revision: 1 },
    ]);
  });

  it("queues a later event behind an in-flight reconciliation", async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    let finishFirst!: () => void;
    const monitor = new LoreChangeMonitor({
      delayMs: 0,
      reconcile: async ({ paths }) => {
        order.push(`start:${paths.join(",")}`);
        if (paths.includes("first.md")) {
          await new Promise<void>((resolve) => { finishFirst = resolve; });
        }
        order.push(`end:${paths.join(",")}`);
      },
    });

    monitor.notify(["first.md"]);
    await vi.advanceTimersByTimeAsync(0);
    monitor.notify(["second.md"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(["start:first.md"]);
    finishFirst();
    await monitor.flush();

    expect(order).toEqual([
      "start:first.md",
      "end:first.md",
      "start:second.md",
      "end:second.md",
    ]);
  });

  it("drops pending work after disposal", async () => {
    vi.useFakeTimers();
    const reconcile = vi.fn(async () => {});
    const monitor = new LoreChangeMonitor({ delayMs: 50, reconcile });
    monitor.notify(["one.md"]);
    monitor.dispose();
    await vi.runAllTimersAsync();

    expect(reconcile).not.toHaveBeenCalled();
  });
});
