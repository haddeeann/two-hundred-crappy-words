import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex, LORE_INDEX_FORMAT, LORE_INDEX_VERSION } from "./index";

const DUPLICATE_ID = "2cd59970-6ab4-46f9-b54b-a0e35af5b9e1";

describe("memory-only connected-lore index", () => {
  it("builds versioned records, resolutions, backlinks, and bounded context", () => {
    const index = buildLoreProjectIndex(
      [
        {
          path: "Manuscript/chapter.md",
          text: "A long-awaited meeting with [[Mara Venn|the commander]] changed everything.",
        },
        { path: "Lore/mara.md", text: "# Mara Venn\n\n## Early life" },
      ],
      7,
    );

    expect(index).toMatchObject({ format: LORE_INDEX_FORMAT, version: LORE_INDEX_VERSION, generation: 7 });
    expect(index.documents.get("Lore/mara.md")).toMatchObject({
      title: "Mara Venn",
      fingerprint: expect.stringMatching(/^26:/),
      size: 26,
    });
    expect(index.documents.get("Manuscript/chapter.md")?.outgoing[0]).toMatchObject({
      resolution: { kind: "resolved", targetPath: "Lore/mara.md" },
      context: "A long-awaited meeting with [[Mara Venn|the commander]] changed everything.",
    });
    expect(index.backlinks.get("Lore/mara.md")).toMatchObject([
      { sourcePath: "Manuscript/chapter.md", targetPath: "Lore/mara.md" },
    ]);
  });

  it("reports duplicate IDs without changing either note", () => {
    const frontmatter = `---\nid: "${DUPLICATE_ID}"\n---\n`;
    const index = buildLoreProjectIndex([
      { path: "one.md", text: `${frontmatter}# One` },
      { path: "two.md", text: `${frontmatter}# Two` },
    ]);

    expect(index.issues).toEqual([
      {
        kind: "duplicate-note-id",
        message: `Note ID ${DUPLICATE_ID} appears in more than one file and was not repaired.`,
        paths: ["one.md", "two.md"],
      },
    ]);
    expect(index.documents.get("one.md")?.id).toBe(DUPLICATE_ID);
    expect(index.documents.get("two.md")?.id).toBe(DUPLICATE_ID);
  });

  it("rejects duplicate source paths instead of overwriting a record", () => {
    expect(() =>
      buildLoreProjectIndex([
        { path: "same.md", text: "One" },
        { path: "same.md", text: "Two" },
      ]),
    ).toThrow(/Duplicate lore source path/);
  });
});
