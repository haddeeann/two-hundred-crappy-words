import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutosaveController, type AutosaveRequest } from "./autosave";

const first: AutosaveRequest = {
  path: "/world/chapter.txt",
  content: "first",
  revision: 1,
};

const second: AutosaveRequest = {
  path: "/world/chapter.txt",
  content: "second",
  revision: 2,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("AutosaveController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves only after the idle delay", async () => {
    const save = vi.fn(async () => {});
    const autosave = new AutosaveController({ delayMs: 750, save });

    autosave.schedule(first);
    await vi.advanceTimersByTimeAsync(749);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledWith(first);
  });

  it("reschedules the delay and keeps only the latest edit", async () => {
    const save = vi.fn(async () => {});
    const autosave = new AutosaveController({ delayMs: 750, save });

    autosave.schedule(first);
    await vi.advanceTimersByTimeAsync(500);
    autosave.schedule(second);
    await vi.advanceTimersByTimeAsync(749);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(second);
  });

  it("flushes a pending edit immediately", async () => {
    const save = vi.fn(async () => {});
    const autosave = new AutosaveController({ delayMs: 750, save });

    autosave.schedule(first);
    await autosave.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(first);
  });

  it("serializes a newer edit behind an in-flight save", async () => {
    const firstWrite = deferred();
    const save = vi
      .fn<(request: AutosaveRequest) => Promise<void>>()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValueOnce();
    const autosave = new AutosaveController({ delayMs: 750, save });

    autosave.schedule(first);
    await vi.advanceTimersByTimeAsync(750);
    autosave.schedule(second);
    await vi.advanceTimersByTimeAsync(750);

    expect(save).toHaveBeenCalledTimes(1);
    firstWrite.resolve();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith(second);
  });

  it("reports failures and permits a later retry", async () => {
    const onError = vi.fn();
    const save = vi
      .fn<(request: AutosaveRequest) => Promise<void>>()
      .mockRejectedValueOnce(new Error("Disk is full"))
      .mockResolvedValueOnce();
    const autosave = new AutosaveController({
      delayMs: 750,
      save,
      onError,
    });

    autosave.schedule(first);
    await autosave.flush();
    expect(onError).toHaveBeenCalledWith(first, expect.any(Error));

    autosave.schedule(first);
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate an in-flight revision when flushed", async () => {
    const write = deferred();
    const save = vi.fn(() => write.promise);
    const autosave = new AutosaveController({ delayMs: 750, save });

    autosave.schedule(first);
    await vi.advanceTimersByTimeAsync(750);
    autosave.schedule(first);
    const flushed = autosave.flush();
    write.resolve();
    await flushed;

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("cancels only pending revisions covered by a completed save", async () => {
    const save = vi.fn(async () => {});
    const autosave = new AutosaveController({ delayMs: 750, save });

    autosave.schedule(second);
    autosave.cancelPendingThrough(second.path, 1);
    await autosave.flush();
    expect(save).toHaveBeenCalledWith(second);

    autosave.schedule({ ...second, revision: 3 });
    autosave.cancelPendingThrough(second.path, 3);
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
