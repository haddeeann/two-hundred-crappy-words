import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "./index";
import {
  applyLoreCompletion,
  findWikiLinkCompletion,
  loreCompletionCandidates,
} from "./completion";

describe("wiki-link completion", () => {
  it("detects only an open, unescaped target at a collapsed UTF-16 caret", () => {
    expect(findWikiLinkCompletion("Signal [[Mar", 12)).toMatchObject({
      mode: "note",
      query: "Mar",
      replaceStart: 9,
      replaceEnd: 12,
    });
    expect(findWikiLinkCompletion("\\[[Mar", 6)).toBeNull();
    expect(findWikiLinkCompletion("[[Mara]]", 5)).toBeNull();
    expect(findWikiLinkCompletion("[[Mara|capt", 11)).toBeNull();
    expect(findWikiLinkCompletion("[[Mar\na", 7)).toBeNull();
    expect(findWikiLinkCompletion("[[one [[two", 11)).toBeNull();
    expect(findWikiLinkCompletion("[[Mar", 3, 5)).toBeNull();
    expect(findWikiLinkCompletion("🚀 [[Mar", 8)).toMatchObject({
      replaceStart: 5,
      replaceEnd: 8,
    });
  });

  it("detects note and same-file heading queries with escaped delimiters", () => {
    expect(findWikiLinkCompletion("[[Mara#Early", 12)).toMatchObject({
      mode: "heading",
      noteTarget: "Mara",
      query: "Early",
      replaceStart: 7,
    });
    expect(findWikiLinkCompletion("[[#After", 8)).toMatchObject({
      mode: "heading",
      noteTarget: "",
      query: "After",
    });
    expect(findWikiLinkCompletion("[[Mara\\#Prime", 13)).toMatchObject({
      mode: "note",
      query: "Mara#Prime",
    });
  });

  it("ranks title, word-prefix, substring, alias, and path matches deterministically", () => {
    const index = buildLoreProjectIndex([
      { path: "Lore/mara.md", text: "---\ntitle: \"Mara Venn\"\naliases:\n  - \"Commander Venn\"\n---" },
      { path: "Lore/marathon.md", text: "# Marathon Station" },
      { path: "Lore/people.md", text: "# The Mara Collective" },
      { path: "Appendix/mara.md", text: "# Archived Mara" },
    ]);
    const context = findWikiLinkCompletion("[[mar", 5)!;
    const candidates = loreCompletionCandidates(index, "Lore/people.md", context);

    expect(candidates.map(({ label }) => label)).toEqual([
      "Mara Venn",
      "Marathon Station",
      "Archived Mara",
      "The Mara Collective",
    ]);
    expect(candidates[0]).toMatchObject({
      insertText: "Mara Venn",
      targetPath: "Lore/mara.md",
    });
  });

  it("inserts a rooted path when a matched name collides", () => {
    const index = buildLoreProjectIndex([
      { path: "Lore/one.md", text: "# Mara" },
      { path: "Archive/two.md", text: "---\ntitle: \"Two\"\naliases:\n  - \"Mara\"\n---" },
    ]);
    const candidates = loreCompletionCandidates(
      index,
      "Lore/one.md",
      findWikiLinkCompletion("[[Mara", 6)!,
    );
    expect(candidates.map(({ insertText }) => insertText)).toEqual([
      "Lore/one",
      "Archive/two",
    ]);
  });

  it("offers headings only after the note target resolves uniquely", () => {
    const index = buildLoreProjectIndex([
      { path: "source.md", text: "# Source\n## Aftermath" },
      { path: "Lore/mara.md", text: "# Mara\n## Early life\n## Later years" },
    ]);
    const named = loreCompletionCandidates(
      index,
      "source.md",
      findWikiLinkCompletion("[[Mara#ear", 10)!,
    );
    const sameFile = loreCompletionCandidates(
      index,
      "source.md",
      findWikiLinkCompletion("[[#aft", 6)!,
    );

    expect(named[0]).toMatchObject({
      kind: "heading",
      label: "Early life",
      insertText: "Early life",
    });
    expect(sameFile).toMatchObject([
      { targetPath: "source.md", label: "Aftermath" },
    ]);
  });

  it("replaces exactly the live target range and leaves link punctuation writer-owned", () => {
    const context = findWikiLinkCompletion("Before [[Mar after", 12)!;
    const result = applyLoreCompletion("Before [[Mar after", context, {
      key: "note:mara.md",
      kind: "note",
      label: "Mara Venn",
      detail: "mara.md",
      insertText: "Mara Venn",
      targetPath: "mara.md",
      headingStart: null,
    });
    expect(result).toEqual({
      text: "Before [[Mara Venn after",
      caret: 18,
    });
  });
});
