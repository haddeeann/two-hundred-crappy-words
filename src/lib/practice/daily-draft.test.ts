import { describe, expect, it } from "vitest";

import type { FileTreeEntry } from "$lib/editor/file-tree";
import { planDailyDraft } from "./daily-draft";

function entry(
  name: string,
  overrides: Partial<FileTreeEntry> = {},
): FileTreeEntry {
  return {
    name,
    path: `/world/${name}`,
    isDirectory: false,
    isFile: true,
    isSymlink: false,
    expanded: false,
    children: null,
    ...overrides,
  };
}

describe("daily draft planning", () => {
  it("plans one portable Markdown path without requiring the folder to exist", () => {
    expect(planDailyDraft([], "2026-10-06")).toEqual({
      kind: "ready",
      dateKey: "2026-10-06",
      directoryName: "Daily",
      fileName: "2026-10-06.md",
      relativePath: "Daily/2026-10-06.md",
      directoryExists: false,
      knownFile: "absent",
    });
  });

  it("recognizes an existing draft once the folder has been inspected", () => {
    const daily = entry("Daily", {
      isDirectory: true,
      isFile: false,
      children: [entry("2026-10-06.md")],
    });

    expect(planDailyDraft([daily], "2026-10-06")).toMatchObject({
      kind: "ready",
      directoryExists: true,
      knownFile: "present",
    });
  });

  it("keeps an unloaded regular Daily directory explicit", () => {
    const daily = entry("Daily", { isDirectory: true, isFile: false });

    expect(planDailyDraft([daily], "2026-10-06")).toMatchObject({
      kind: "ready",
      knownFile: "unknown",
    });
  });

  it("refuses file, symbolic-folder, and date-file collisions", () => {
    expect(planDailyDraft([entry("Daily")], "2026-10-06")).toMatchObject({
      kind: "unavailable",
    });
    expect(
      planDailyDraft(
        [entry("Daily", { isDirectory: true, isFile: false, isSymlink: true })],
        "2026-10-06",
      ),
    ).toMatchObject({ kind: "unavailable" });
    expect(
      planDailyDraft(
        [
          entry("Daily", {
            isDirectory: true,
            isFile: false,
            children: [
              entry("2026-10-06.md", {
                isDirectory: true,
                isFile: false,
              }),
            ],
          }),
        ],
        "2026-10-06",
      ),
    ).toMatchObject({ kind: "unavailable" });
  });

  it("rejects malformed or impossible local dates", () => {
    expect(planDailyDraft([], "2026-2-03")).toMatchObject({ kind: "unavailable" });
    expect(planDailyDraft([], "2026-02-30")).toMatchObject({ kind: "unavailable" });
  });
});
