import { describe, expect, it } from "vitest";

import { parseMarkdownNote } from "./markdown";

describe("connected-lore Markdown parser", () => {
  it("derives title precedence and ATX and Setext headings", () => {
    const parsed = parseMarkdownNote(
      "Lore/people.md",
      `---\ntitle: "Metadata Title"\n---\n# Heading *Title*\n\nEarly [life](https://example.invalid)\n---\n`,
    );

    expect(parsed.title).toBe("Metadata Title");
    expect(parsed.headings.map(({ level, text, lookupText }) => ({ level, text, lookupText }))).toEqual([
      { level: 1, text: "Heading *Title*", lookupText: "Heading Title" },
      { level: 2, text: "Early [life](https://example.invalid)", lookupText: "Early life" },
    ]);
    expect(parseMarkdownNote("Lore/no-heading.markdown", "Plain prose").title).toBe("no-heading");
  });

  it("parses labeled and heading links with decoded fields and exact offsets", () => {
    const text = "Before [[Mara\\|Venn#Early\\#life|the \\] commander]] after.";
    const parsed = parseMarkdownNote("chapter.md", text);
    const link = parsed.links[0]!;

    expect(link).toMatchObject({
      raw: "[[Mara\\|Venn#Early\\#life|the \\] commander]]",
      noteTarget: "Mara|Venn",
      headingTarget: "Early#life",
      label: "the ] commander",
      range: { start: 7, end: 50, line: 1, column: 8 },
      destinationRange: { start: 9, end: 31 },
      noteRange: { start: 9, end: 19 },
      headingRange: { start: 20, end: 31 },
      labelRange: { start: 32, end: 48 },
    });
  });

  it("supports same-file headings and suppresses escaped openings", () => {
    const parsed = parseMarkdownNote(
      "chapter.md",
      String.raw`[[#Aftermath]] \[[Ignored]] \\[[Visible]]`,
    );

    expect(parsed.links.map(({ noteTarget, headingTarget }) => ({ noteTarget, headingTarget }))).toEqual([
      { noteTarget: "", headingTarget: "Aftermath" },
      { noteTarget: "Visible", headingTarget: null },
    ]);
  });

  it("ignores links inside frontmatter, fences, inline code, and comments", () => {
    const parsed = parseMarkdownNote(
      "note.md",
      `---\ntitle: "[[Metadata]]"\n---\n\`[[inline]]\`\n\n\`\`\`md\n[[fence]]\n\`\`\`\n<!-- [[comment]] -->\n[[Visible]]`,
    );

    expect(parsed.links.map(({ noteTarget }) => noteTarget)).toEqual(["Visible"]);
  });

  it("reports malformed links, frontmatter, fences, and comments without throwing", () => {
    const cases = [
      parseMarkdownNote("a.md", "[[broken\ntext"),
      parseMarkdownNote("a.md", "[[outer [[inner]]"),
      parseMarkdownNote("a.md", "[[]] [[Note#]] [[Note|]]"),
      parseMarkdownNote("a.md", "```\n[[hidden]]"),
      parseMarkdownNote("a.md", "<!-- [[hidden]]"),
    ];

    expect(cases[0]?.issues[0]?.kind).toBe("malformed-wiki-link");
    expect(cases[1]?.issues[0]?.kind).toBe("malformed-wiki-link");
    expect(cases[2]?.issues).toHaveLength(3);
    expect(cases[3]?.issues[0]?.kind).toBe("unclosed-fence");
    expect(cases[4]?.issues[0]?.kind).toBe("unclosed-comment");
  });

  it("records UTF-16 line and column locations", () => {
    const parsed = parseMarkdownNote("emoji.md", "🚀 intro\n[[Mara]]\n## Arrival");

    expect(parsed.links[0]?.range).toMatchObject({ start: 9, line: 2, column: 1 });
    expect(parsed.headings[0]?.textRange).toMatchObject({ start: 21, line: 3, column: 4 });
  });
});
