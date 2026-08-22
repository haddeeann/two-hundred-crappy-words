import { describe, expect, it } from "vitest";

import { activeLoreConnections } from "./connections";
import { buildLoreProjectIndex } from "./index";

describe("active lore connections", () => {
  it("presents resolved, broken, and ambiguous outgoing links without guessing", () => {
    const index = buildLoreProjectIndex([
      { path: "source.md", text: "[[Mara#Life]]\n[[Missing]]\n[[Twin]]" },
      { path: "mara.md", text: "# Mara\n## Life" },
      { path: "one.md", text: "# Twin" },
      { path: "two.md", text: "# Twin" },
    ]);
    const view = activeLoreConnections(index, "source.md")!;

    expect(view.outgoing.map(({ status }) => status)).toEqual([
      "resolved",
      "broken",
      "ambiguous",
    ]);
    expect(view.outgoing[0]).toMatchObject({
      label: "Mara · Life",
      targetPath: "mara.md",
      sourceLocation: "source.md:1:1",
    });
    expect(view.outgoing[1]?.targetPath).toBeNull();
    expect(view.outgoing[2]?.detail).toContain("one.md, two.md");
  });

  it("presents source-context backlinks in stable source order", () => {
    const index = buildLoreProjectIndex([
      { path: "target.md", text: "# Target" },
      { path: "zeta.md", text: "Later [[Target]] context" },
      { path: "alpha.md", text: "Earlier [[Target]] context" },
    ]);
    const view = activeLoreConnections(index, "target.md")!;

    expect(view.backlinks.map(({ label, targetPath, context }) => ({
      label,
      targetPath,
      context,
    }))).toEqual([
      { label: "alpha", targetPath: "alpha.md", context: "Earlier [[Target]] context" },
      { label: "zeta", targetPath: "zeta.md", context: "Later [[Target]] context" },
    ]);
  });

  it("returns no surface for an unindexed or non-Markdown active file", () => {
    const index = buildLoreProjectIndex([{ path: "note.md", text: "# Note" }]);
    expect(activeLoreConnections(index, null)).toBeNull();
    expect(activeLoreConnections(index, "draft.txt")).toBeNull();
  });
});
