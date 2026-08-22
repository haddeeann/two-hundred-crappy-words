import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "./frontmatter";

const NOTE_ID = "2cd59970-6ab4-46f9-b54b-a0e35af5b9e1";

describe("safe connected-lore frontmatter", () => {
  it("reads approved scalar metadata and aliases", () => {
    const parsed = parseFrontmatter(`---\nid: "${NOTE_ID}"\ntype: "character"\ntitle: "Mara Venn"\naliases:\n  - "Mara"\n  - "Commander Venn"\n---\n# Mara\n`);

    expect(parsed).toMatchObject({
      id: NOTE_ID,
      type: "character",
      title: "Mara Venn",
      aliases: ["Mara", "Commander Venn"],
      bodyStart: 129,
    });
    expect(parsed.range).toMatchObject({ start: 0, end: 129, line: 1, column: 1 });
    expect(parsed.issues).toEqual([]);
  });

  it("ignores unsupported fields without evaluating them", () => {
    const parsed = parseFrontmatter(`---\ntitle: "Safe"\ncustom: !!js/function "danger"\nnested: &anchor\n  child: value\n---\nBody`);

    expect(parsed.title).toBe("Safe");
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]?.message).toMatch(/Unsupported frontmatter syntax/);
  });

  it("rejects duplicate or invalid metadata non-destructively", () => {
    const parsed = parseFrontmatter(`---\nid: "bad"\ntype: "Character Name"\ntitle: "First"\ntitle: "Second"\naliases: ["Inline"]\n---\n`);

    expect(parsed).toMatchObject({ id: null, type: null, title: null, aliases: [] });
    expect(parsed.issues.map(({ kind }) => kind)).toEqual([
      "frontmatter-field",
      "frontmatter-field",
      "duplicate-metadata",
      "frontmatter-field",
    ]);
  });

  it("deduplicates aliases by normalized case and enforces bounds", () => {
    const tooLong = "x".repeat(121);
    const parsed = parseFrontmatter(`---\naliases:\n  - "Mara"\n  - "mara"\n  - "  "\n  - "${tooLong}"\n---\n`);

    expect(parsed.aliases).toEqual(["Mara"]);
    expect(parsed.issues.map(({ kind }) => kind)).toEqual([
      "duplicate-alias",
      "frontmatter-field",
      "frontmatter-field",
    ]);
  });

  it("reports an unclosed opening block and searches after its delimiter", () => {
    const parsed = parseFrontmatter("---\ntitle: \"Lost\"\n[[Still prose]]");

    expect(parsed.range).toBeNull();
    expect(parsed.bodyStart).toBe(4);
    expect(parsed.issues[0]).toMatchObject({
      kind: "frontmatter-malformed",
      range: { start: 0, end: 3, line: 1, column: 1 },
    });
  });

  it("does not merge duplicate aliases blocks", () => {
    const parsed = parseFrontmatter(`---\naliases:\n  - "First"\naliases:\n  - "Second"\n---\n`);

    expect(parsed.aliases).toEqual([]);
    expect(parsed.issues).toMatchObject([
      { kind: "duplicate-metadata", range: { line: 4 } },
    ]);
  });
});
