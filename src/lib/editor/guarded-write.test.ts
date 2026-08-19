import { describe, expect, it, vi } from "vitest";
import {
  ExternalFileChangeError,
  guardedWriteText,
  SourceFileUnavailableError,
} from "./guarded-write";

const request = {
  path: "/world/chapter.md",
  content: "new draft",
  expectedContent: "known disk text",
};

describe("guarded text writes", () => {
  it("writes when the source still matches the known persisted content", async () => {
    const write = vi.fn(async () => {});
    await guardedWriteText(request, {
      read: vi.fn(async () => "known disk text"),
      write,
    });

    expect(write).toHaveBeenCalledWith(request.path, request.content);
  });

  it("refuses to overwrite an externally changed file", async () => {
    const write = vi.fn(async () => {});
    const operation = guardedWriteText(request, {
      read: vi.fn(async () => "external edit"),
      write,
    });
    await expect(operation).rejects.toBeInstanceOf(ExternalFileChangeError);
    await expect(operation).rejects.toMatchObject({
      name: "ExternalFileChangeError",
      diskContent: "external edit",
    });
    expect(write).not.toHaveBeenCalled();
  });

  it("does not recreate a missing or unreadable source implicitly", async () => {
    const write = vi.fn(async () => {});
    await expect(
      guardedWriteText(request, {
        read: vi.fn(async () => {
          throw new Error("not found");
        }),
        write,
      }),
    ).rejects.toBeInstanceOf(SourceFileUnavailableError);
    expect(write).not.toHaveBeenCalled();
  });

  it("writes only after an explicit force decision", async () => {
    const read = vi.fn(async () => "external edit");
    const write = vi.fn(async () => {});
    await guardedWriteText({ ...request, force: true }, { read, write });

    expect(read).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledOnce();
  });
});
