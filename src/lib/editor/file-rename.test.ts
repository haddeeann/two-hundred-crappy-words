import { describe, expect, it } from "vitest";
import { planFileDelete, planFileRename } from "./file-rename";

function plan(
  requestedName: string,
  overrides: Partial<Parameters<typeof planFileRename>[0]> = {},
) {
  return planFileRename({
    currentName: "draft.txt",
    requestedName,
    siblingNames: ["draft.txt", "notes.txt"],
    atProjectRoot: false,
    ...overrides,
  });
}

describe("file-tree rename planning", () => {
  it("accepts a portable absent sibling name", () => {
    expect(plan("chapter-one.txt")).toEqual({
      kind: "ready",
      targetName: "chapter-one.txt",
    });
  });

  it("rejects unchanged, case-only, invalid, and colliding names", () => {
    expect(plan("draft.txt")).toMatchObject({ kind: "unavailable" });
    expect(plan("DRAFT.TXT")).toMatchObject({ kind: "unavailable" });
    expect(plan("folder/draft.txt")).toMatchObject({ kind: "unavailable" });
    expect(plan("NOTES.txt")).toMatchObject({ kind: "unavailable" });
  });

  it("protects root project metadata names in both directions", () => {
    expect(
      plan("renamed.json", {
        currentName: "200-crappy-words.project.json",
        atProjectRoot: true,
      }),
    ).toMatchObject({ kind: "unavailable" });
    expect(
      plan("200-CRAPPY-WORDS.MANUSCRIPTS.JSON", { atProjectRoot: true }),
    ).toMatchObject({ kind: "unavailable" });
    expect(
      plan("renamed.json", {
        currentName: "200-crappy-words.timeline.json",
        atProjectRoot: true,
      }),
    ).toMatchObject({ kind: "unavailable" });
    expect(
      plan("renamed.json", {
        currentName: "200-crappy-words.project.json",
        atProjectRoot: false,
      }),
    ).toMatchObject({ kind: "ready" });
  });
});

describe("file-tree delete planning", () => {
  it("allows an ordinary regular file", () => {
    expect(
      planFileDelete({
        name: "draft.txt",
        atProjectRoot: true,
        isDirectory: false,
        isSymlink: false,
      }),
    ).toEqual({ kind: "ready" });
  });

  it("refuses folders, symlinks, and root project metadata", () => {
    expect(
      planFileDelete({
        name: "Drafts",
        atProjectRoot: true,
        isDirectory: true,
        isSymlink: false,
      }),
    ).toMatchObject({ kind: "unavailable" });
    expect(
      planFileDelete({
        name: "shortcut.txt",
        atProjectRoot: true,
        isDirectory: false,
        isSymlink: true,
      }),
    ).toMatchObject({ kind: "unavailable" });
    expect(
      planFileDelete({
        name: "200-CRAPPY-WORDS.PROJECT.JSON",
        atProjectRoot: true,
        isDirectory: false,
        isSymlink: false,
      }),
    ).toMatchObject({ kind: "unavailable" });
    expect(
      planFileDelete({
        name: "200-CRAPPY-WORDS.TIMELINE.JSON",
        atProjectRoot: true,
        isDirectory: false,
        isSymlink: false,
      }),
    ).toMatchObject({ kind: "unavailable" });
  });
});
