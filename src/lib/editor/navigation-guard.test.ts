import { describe, expect, it, vi } from "vitest";
import { resolvePendingChanges } from "./navigation-guard";

describe("resolvePendingChanges", () => {
  it("continues immediately when there is nothing to save", async () => {
    const save = vi.fn(async () => {});
    const chooseAfterFailure = vi.fn(async () => "cancel" as const);

    const result = await resolvePendingChanges({
      hasUnsavedChanges: () => false,
      save,
      chooseAfterFailure,
    });

    expect(result).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(chooseAfterFailure).not.toHaveBeenCalled();
  });

  it("continues after a successful save", async () => {
    let dirty = true;
    const save = vi.fn(async () => {
      dirty = false;
    });

    const result = await resolvePendingChanges({
      hasUnsavedChanges: () => dirty,
      save,
      chooseAfterFailure: vi.fn(),
    });

    expect(result).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("retries a failed save before continuing", async () => {
    let dirty = true;
    const save = vi.fn(async () => {
      if (save.mock.calls.length === 2) dirty = false;
    });
    const chooseAfterFailure = vi.fn(async () => "retry" as const);

    const result = await resolvePendingChanges({
      hasUnsavedChanges: () => dirty,
      save,
      chooseAfterFailure,
    });

    expect(result).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(chooseAfterFailure).toHaveBeenCalledTimes(1);
  });

  it("allows an explicit discard after a failed save", async () => {
    const discard = vi.fn(async () => {});
    const result = await resolvePendingChanges({
      hasUnsavedChanges: () => true,
      save: vi.fn(async () => {}),
      chooseAfterFailure: vi.fn(async () => "discard" as const),
      discard,
    });

    expect(result).toBe(true);
    expect(discard).toHaveBeenCalledOnce();
  });

  it("cancels navigation after a failed save", async () => {
    const result = await resolvePendingChanges({
      hasUnsavedChanges: () => true,
      save: vi.fn(async () => {}),
      chooseAfterFailure: vi.fn(async () => "cancel" as const),
    });

    expect(result).toBe(false);
  });
});
