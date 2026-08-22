import { describe, expect, it } from "vitest";

import {
  LoreNavigationHistory,
  type LoreNavigationLocation,
} from "./navigation-history";

function location(
  editorPath: string,
  selectionStart = 0,
  referencePath: string | null = null,
): LoreNavigationLocation {
  return {
    editorPath,
    editorFingerprint: `${editorPath}:fingerprint`,
    selectionStart,
    selectionEnd: selectionStart,
    referencePath,
    referenceFingerprint: referencePath ? `${referencePath}:fingerprint` : null,
  };
}

describe("connected-lore navigation history", () => {
  it("moves only after a successful commit and supports back/forward", () => {
    const history = new LoreNavigationHistory();
    history.recordTransition(location("chapter.md", 4), location("chapter.md", 4, "mara.md"));
    history.recordTransition(
      location("chapter.md", 4, "mara.md"),
      location("mara.md", 10),
    );

    expect(history.peek("back")).toEqual(location("chapter.md", 4, "mara.md"));
    expect(history.peek("back")).toEqual(location("chapter.md", 4, "mara.md"));
    expect(history.commit("back")).toBe(true);
    history.replaceCurrent(location("chapter.md", 9, "mara.md"));
    expect(history.peek("back")).toEqual(location("chapter.md", 4));
    expect(history.peek("forward")).toEqual(location("mara.md", 10));
    expect(history.commit("forward")).toBe(true);
  });

  it("replaces the forward branch after new navigation", () => {
    const history = new LoreNavigationHistory();
    history.recordTransition(location("a.md"), location("b.md"));
    history.recordTransition(location("b.md"), location("c.md"));
    history.commit("back");
    history.recordTransition(location("b.md", 7), location("d.md"));

    expect(history.canGoForward).toBe(false);
    expect(history.peek("back")).toEqual(location("b.md", 7));
  });

  it("drops invalid candidates without moving into them", () => {
    const history = new LoreNavigationHistory();
    history.recordTransition(location("a.md"), location("missing.md"));
    history.recordTransition(location("missing.md"), location("c.md"));

    expect(history.dropCandidate("back")).toBe(true);
    expect(history.peek("back")).toEqual(location("a.md"));
    expect(history.commit("back")).toBe(true);
    expect(history.peek("forward")).toEqual(location("c.md"));
  });

  it("bounds entries, ignores identical transitions, and clears by project", () => {
    const history = new LoreNavigationHistory(3);
    history.recordTransition(location("a.md"), location("a.md"));
    expect(history.size).toBe(0);
    history.recordTransition(location("a.md"), location("b.md"));
    history.recordTransition(location("b.md"), location("c.md"));
    history.recordTransition(location("c.md"), location("d.md"));

    expect(history.size).toBe(3);
    history.commit("back");
    history.commit("back");
    expect(history.canGoBack).toBe(false);
    history.clear();
    expect(history.size).toBe(0);
    expect(history.canGoForward).toBe(false);
    expect(() => new LoreNavigationHistory(1)).toThrow(RangeError);
  });
});
