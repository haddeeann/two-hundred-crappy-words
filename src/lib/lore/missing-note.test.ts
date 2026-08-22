import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "./index";
import { planMissingLoreNote } from "./missing-note";

function broken(source: string) {
  const index = buildLoreProjectIndex([{ path: "source.md", text: source }]);
  return { index, outgoing: index.documents.get("source.md")!.outgoing[0]! };
}

describe("missing lore note planning", () => {
  it("plans a root note and optional heading without rewriting the source", () => {
    const simple = broken("Before [[Missing Moon]] after");
    expect(planMissingLoreNote(simple.outgoing, simple.index)).toEqual({
      kind: "ready",
      path: "Missing Moon.md",
      title: "Missing Moon",
      text: "# Missing Moon\n",
    });
    expect(simple.index.documents.get("source.md")?.searchText).toBe(
      "Before [[Missing Moon]] after",
    );

    const heading = broken("[[Lore/Places/Missing Moon#History]]");
    expect(planMissingLoreNote(heading.outgoing, heading.index)).toMatchObject({
      kind: "ready",
      path: "Lore/Places/Missing Moon.md",
      text: "# Missing Moon\n\n## History\n",
    });
  });

  it("preserves an explicit Markdown extension", () => {
    const markdown = broken("[[Lore/Moon.markdown]]");
    expect(planMissingLoreNote(markdown.outgoing, markdown.index)).toMatchObject({
      kind: "ready",
      path: "Lore/Moon.markdown",
    });
  });

  it("refuses invalid, excluded, ambiguous, and already-existing destinations", () => {
    for (const target of [".hidden", "node_modules/Moon", "Lore/../Moon"] as const) {
      const planned = broken(`[[${target}]]`);
      expect(planMissingLoreNote(planned.outgoing, planned.index).kind).toBe("unavailable");
    }

    const ambiguousIndex = buildLoreProjectIndex([
      { path: "source.md", text: "[[Twin]]" },
      { path: "one.md", text: "# Twin" },
      { path: "two.md", text: "# Twin" },
    ]);
    expect(planMissingLoreNote(
      ambiguousIndex.documents.get("source.md")!.outgoing[0]!,
      ambiguousIndex,
    ).kind).toBe("unavailable");
  });
});
