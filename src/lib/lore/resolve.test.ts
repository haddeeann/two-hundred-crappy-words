import { describe, expect, it } from "vitest";

import { parseMarkdownNote } from "./markdown";
import { createResolutionCatalog, resolveWikiLink } from "./resolve";

function catalog(...sources: [path: string, text: string][]) {
  return createResolutionCatalog(sources.map(([path, text]) => parseMarkdownNote(path, text)));
}

function link(sourcePath: string, sourceText: string, targetCatalog: ReturnType<typeof catalog>) {
  const parsed = parseMarkdownNote(sourcePath, sourceText);
  return resolveWikiLink(sourcePath, parsed.links[0]!, targetCatalog);
}

describe("connected-lore link resolution", () => {
  it("resolves unique title, alias, filename, and rooted path names", () => {
    const notes = catalog(
      ["Manuscript/chapter.md", "# Chapter"],
      [
        "Lore/People/mara.md",
        `---\ntitle: "Mara Venn"\naliases:\n  - "Commander Venn"\n---\n# Biography`,
      ],
    );

    for (const target of [
      "Mara Venn",
      "Commander Venn",
      "mara",
      "Lore/People/mara",
      "lore/people/MARA.MD",
    ]) {
      expect(link("Manuscript/chapter.md", `[[${target}]]`, notes)).toMatchObject({
        kind: "resolved",
        targetPath: "Lore/People/mara.md",
      });
    }
  });

  it("never silently prioritizes a title over another note's alias", () => {
    const notes = catalog(
      ["source.md", ""],
      ["one.md", `---\ntitle: "Mara"\n---`],
      ["two.md", `---\ntitle: "Venn"\naliases:\n  - "Mara"\n---`],
    );

    expect(link("source.md", "[[Mara]]", notes)).toEqual({
      kind: "ambiguous-note",
      candidatePaths: ["one.md", "two.md"],
      message: "“Mara” matches more than one indexed note. Use a project-relative path to disambiguate it.",
    });
  });

  it("treats Unicode and case collisions as ambiguous", () => {
    const notes = catalog(
      ["source.md", ""],
      ["one.md", "# Élan"],
      ["two.md", "# E\u0301LAN"],
    );

    expect(link("source.md", "[[élan]]", notes)).toMatchObject({
      kind: "ambiguous-note",
      candidatePaths: ["one.md", "two.md"],
    });
  });

  it("reports invalid and broken paths distinctly", () => {
    const notes = catalog(["source.md", ""]);

    expect(link("source.md", "[[Lore/../secret]]", notes).kind).toBe("invalid-target");
    expect(link("source.md", "[[Lore\\secret]]", notes).kind).toBe("invalid-target");
    expect(link("source.md", "[[Lore/Missing]]", notes).kind).toBe("broken-note");
  });

  it("resolves unique headings and exposes missing or duplicate headings", () => {
    const notes = catalog(
      ["source.md", "# Start\n## Aftermath"],
      ["target.md", "# Target\n## Early *life*\n## Repeated\n## Repeated"],
    );

    expect(link("source.md", "[[target#Early life]]", notes)).toMatchObject({
      kind: "resolved",
      targetPath: "target.md",
      heading: { text: "Early *life*" },
    });
    expect(link("source.md", "[[target#Missing]]", notes).kind).toBe("broken-heading");
    expect(link("source.md", "[[target#Repeated]]", notes).kind).toBe("ambiguous-heading");
    expect(link("source.md", "[[#Aftermath]]", notes)).toMatchObject({
      kind: "resolved",
      targetPath: "source.md",
    });
  });
});
