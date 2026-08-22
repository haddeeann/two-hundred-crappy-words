import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "./index";
import {
  MAX_LORE_SEARCH_CODE_POINTS,
  searchProjectLore,
} from "./search";

describe("project lore search", () => {
  const index = buildLoreProjectIndex([
    {
      path: "Lore/mara.md",
      text: "---\ntitle: \"Mara Venn\"\naliases:\n  - \"Commander Venn\"\n---\n# Mara Venn\n## Early life\nA cartographer follows the quiet signal.",
    },
    { path: "Lore/commander.md", text: "# Commander Station" },
    { path: "Archive/mara.md", text: "# Archived Mara" },
    { path: "chapter.md", text: "# Chapter One\nThe quiet signal reaches Mars." },
  ]);

  it("ranks exact title, alias/path, heading, prefix, word, substring, then content", () => {
    expect(searchProjectLore(index, "Mara").map(({ title, kind }) => ({ title, kind }))).toEqual([
      { title: "Archived Mara", kind: "filename" },
      { title: "Mara Venn", kind: "filename" },
    ]);
    expect(searchProjectLore(index, "Commander Venn")[0]).toMatchObject({
      title: "Mara Venn",
      kind: "alias",
    });
    expect(searchProjectLore(index, "Early life")[0]).toMatchObject({
      title: "Mara Venn",
      kind: "heading",
      range: { line: 7, column: 4 },
    });
    expect(searchProjectLore(index, "quiet signal").map(({ path, kind }) => ({ path, kind }))).toEqual([
      { path: "chapter.md", kind: "content" },
      { path: "Lore/mara.md", kind: "content" },
    ]);
  });

  it("returns one explained best result per document with stable path ties", () => {
    const collisions = buildLoreProjectIndex([
      { path: "zeta.md", text: "# Twin" },
      { path: "alpha.md", text: "# Twin" },
    ]);
    expect(searchProjectLore(collisions, "Twin")).toMatchObject([
      { path: "alpha.md", reason: "Note title" },
      { path: "zeta.md", reason: "Note title" },
    ]);
  });

  it("maps normalized Unicode prose matches back to exact UTF-16 source ranges", () => {
    const unicode = buildLoreProjectIndex([
      { path: "unicode.md", text: "# Log\n🚀 E\u0301lan crosses." },
    ]);
    const result = searchProjectLore(unicode, "élan")[0]!;
    expect(result).toMatchObject({
      kind: "content",
      context: "🚀 Élan crosses.",
      range: { start: 9, end: 14, line: 2, column: 4 },
    });
  });

  it("bounds results and offers stable title choices for an empty query", () => {
    expect(searchProjectLore(index, "", 2).map(({ path }) => path)).toEqual([
      "Archive/mara.md",
      "chapter.md",
    ]);
    expect(() => searchProjectLore(index, "x", 0)).toThrow(RangeError);
    expect(() =>
      searchProjectLore(index, "x".repeat(MAX_LORE_SEARCH_CODE_POINTS + 1)),
    ).toThrow(RangeError);
  });
});
