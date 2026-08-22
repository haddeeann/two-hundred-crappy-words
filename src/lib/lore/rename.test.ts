import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "./index";
import { planLoreRename } from "./rename";

const ID = "2cd59970-6ab4-46f9-b54b-a0e35af5b9e1";

describe("safe lore rename planning", () => {
  it("updates only links that would stop resolving and previews stable edits", () => {
    const index = buildLoreProjectIndex([
      {
        path: "Lore/mara.md",
        text: `---\nid: "${ID}"\ntitle: "Mara Venn"\n---\n# Mara Venn`,
      },
      {
        path: "chapter.md",
        text: "[[Mara Venn]] meets [[Lore/mara#Mara Venn|the cartographer]].",
      },
    ]);

    const plan = planLoreRename(index, "Lore/mara.md", "People/Mara Venn.md");
    expect(plan).toMatchObject({
      kind: "ready",
      sourcePath: "Lore/mara.md",
      targetPath: "People/Mara Venn.md",
      noteId: ID,
      unchangedLinkCount: 1,
      fileEdits: [
        {
          path: "chapter.md",
          replacements: [
            {
              before: "Lore/mara",
              after: "People/Mara Venn.md",
            },
          ],
          updatedText: "[[Mara Venn]] meets [[People/Mara Venn.md#Mara Venn|the cartographer]].",
        },
      ],
    });
  });

  it("preserves headings and labels while escaping an explicit destination", () => {
    const index = buildLoreProjectIndex([
      {
        path: "old.md",
        text: `---\nid: "${ID}"\ntitle: "Target"\n---\n# Target\n## Life`,
      },
      { path: "source.md", text: "[[old#Life|Read this]]" },
    ]);
    const plan = planLoreRename(index, "old.md", "Lore/New #1.md");

    expect(plan.kind).toBe("ready");
    if (plan.kind === "ready") {
      expect(plan.fileEdits[0]?.updatedText).toBe(
        "[[Lore/New \\#1.md#Life|Read this]]",
      );
    }
  });

  it("refuses missing or duplicate IDs, unsupported metadata, path collisions, and unsafe paths", () => {
    const noId = buildLoreProjectIndex([{ path: "old.md", text: "# Old" }]);
    expect(planLoreRename(noId, "old.md", "new.md")).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("stable frontmatter ID"),
    });

    const duplicated = buildLoreProjectIndex([
      { path: "old.md", text: `---\nid: "${ID}"\n---\n# Old` },
      { path: "copy.md", text: `---\nid: "${ID}"\n---\n# Copy` },
    ]);
    expect(planLoreRename(duplicated, "old.md", "new.md")).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("duplicated"),
    });

    const invalidMetadata = buildLoreProjectIndex([
      { path: "old.md", text: `---\nid: "${ID}"\ntitle: unquoted\n---\n# Old` },
    ]);
    expect(planLoreRename(invalidMetadata, "old.md", "new.md")).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("frontmatter"),
    });

    const valid = buildLoreProjectIndex([
      { path: "old.md", text: `---\nid: "${ID}"\n---\n# Old` },
      { path: "New.md", text: "# Existing" },
    ]);
    expect(planLoreRename(valid, "old.md", "new.md")).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("already uses"),
    });
    expect(planLoreRename(valid, "old.md", "../new.md")).toMatchObject({
      kind: "unavailable",
    });
    expect(planLoreRename(valid, "old.md", ".hidden/new.md")).toMatchObject({
      kind: "unavailable",
    });
    expect(planLoreRename(valid, "old.md", "new.txt")).toMatchObject({
      kind: "unavailable",
    });
  });
});
