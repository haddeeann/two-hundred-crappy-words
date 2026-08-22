import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "./index";
import {
  activeLoreMentions,
  DEFAULT_UNLINKED_MENTION_LIMIT,
  MAX_UNLINKED_MENTIONS_PER_TARGET,
} from "./mentions";

describe("unlinked lore mentions", () => {
  it("finds exact title and alias prose with source context", () => {
    const index = buildLoreProjectIndex([
      {
        path: "chapter.md",
        text: "# Departure\nMara Venn crossed Mars. Commander Venn waited.",
      },
      {
        path: "Lore/mara.md",
        text: "---\ntitle: \"Mara Venn\"\naliases:\n  - \"Commander Venn\"\n---\n# Mara Venn",
      },
      { path: "Lore/mars.md", text: "# Mars" },
    ]);

    expect(activeLoreMentions(index, "chapter.md")).toMatchObject([
      {
        targetPath: "Lore/mara.md",
        targetTitle: "Mara Venn",
        matchedText: "Mara Venn",
        matchedBy: "title",
        sourceLocation: "chapter.md:2:1",
      },
      {
        targetPath: "Lore/mars.md",
        matchedText: "Mars",
        sourceLocation: "chapter.md:2:19",
      },
      {
        targetPath: "Lore/mara.md",
        matchedText: "Commander Venn",
        matchedBy: "alias",
      },
    ]);
  });

  it("excludes links, metadata, headings, code, comments, self mentions, and partial words", () => {
    const index = buildLoreProjectIndex([
      {
        path: "chapter.md",
        text: [
          "---",
          "title: Mara Venn",
          "---",
          "# Mars and Mara Venn",
          "[[Mars]] Marshal Mara Vennish",
          "`Mara Venn` and [Mars](mars.md)",
          "<!-- Mara Venn -->",
          "```text",
          "Mars and Mara Venn",
          "```",
        ].join("\n"),
      },
      { path: "Lore/mara.md", text: "# Mara Venn" },
      { path: "Lore/mars.md", text: "# Mars" },
    ]);

    expect(activeLoreMentions(index, "chapter.md")).toEqual([]);
  });

  it("drops ambiguous names, noisy short/common terms, and overlapping shorter aliases", () => {
    const index = buildLoreProjectIndex([
      { path: "chapter.md", text: "Mara Venn met Twin in this world near Io." },
      { path: "mara.md", text: "---\ntitle: \"Mara Venn\"\naliases:\n  - \"Mara\"\n---" },
      { path: "one.md", text: "# Twin" },
      { path: "two.md", text: "# Twin" },
      { path: "world.md", text: "# World" },
      { path: "io.md", text: "# Io" },
    ]);

    expect(activeLoreMentions(index, "chapter.md").map(({ matchedText }) => matchedText)).toEqual([
      "Mara Venn",
    ]);
  });

  it("bounds the whole view and repeated mentions per target", () => {
    const sources = Array.from({ length: DEFAULT_UNLINKED_MENTION_LIMIT + 5 }, (_, index) => ({
      path: `Lore/place-${index}.md`,
      text: `# Place ${index}`,
    }));
    const prose = [
      "Mara Venn Mara Venn Mara Venn Mara Venn Mara Venn",
      ...sources.map((_, index) => `Place ${index}`),
    ].join(" ");
    const index = buildLoreProjectIndex([
      { path: "chapter.md", text: prose },
      { path: "Lore/mara.md", text: "# Mara Venn" },
      ...sources,
    ]);
    const mentions = activeLoreMentions(index, "chapter.md");

    expect(mentions).toHaveLength(DEFAULT_UNLINKED_MENTION_LIMIT);
    expect(mentions.filter(({ targetPath }) => targetPath === "Lore/mara.md")).toHaveLength(
      MAX_UNLINKED_MENTIONS_PER_TARGET,
    );
    expect(() => activeLoreMentions(index, "chapter.md", 0)).toThrow(RangeError);
  });
});
