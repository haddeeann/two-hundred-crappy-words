import { describe, expect, it } from "vitest";

import type {
  ManuscriptSourceState,
  ReconciledManuscript,
  ReconciledManuscriptChapter,
  ReconciledManuscriptScene,
} from "./source-reconciliation";
import {
  buildManuscriptWordCountIndex,
  countManuscriptSourceWords,
  formatManuscriptWordCount,
} from "./word-count";

function ready(wordCount: number): ManuscriptSourceState {
  return {
    kind: "ready",
    declaredPath: "scene.md",
    resolvedPath: "scene.md",
    fingerprint: `words:${wordCount}`,
    bytes: wordCount,
    wordCount,
  };
}

function unavailable(): ManuscriptSourceState {
  return {
    kind: "missing",
    declaredPath: "missing.md",
    message: "Missing",
  };
}

function scene(
  id: string,
  source: ManuscriptSourceState,
  includeInCompile = true,
  targetWords?: number,
): ReconciledManuscriptScene {
  return {
    item: {
      kind: "scene",
      id,
      title: id,
      source: { path: `${id}.md` },
      includeInCompile,
      ...(targetWords === undefined ? {} : { targetWords }),
    },
    source,
  };
}

function chapter(
  id: string,
  children: ReconciledManuscriptScene[],
  includeInCompile = true,
  source: ManuscriptSourceState | null = null,
  overview: ManuscriptSourceState | null = null,
): ReconciledManuscriptChapter {
  return {
    item: {
      kind: "chapter",
      id,
      title: id,
      children: children.map(({ item }) => item),
      includeInCompile,
    },
    folder: null,
    overview,
    source,
    children,
  };
}

function manuscript(items: ReconciledManuscript["items"]): ReconciledManuscript {
  return {
    manuscript: { id: "book", title: "Book", items: items.map(({ item }) => item) },
    items,
  };
}

describe("manuscript structural word counts", () => {
  it("uses the shared tokenizer but excludes valid structured frontmatter", () => {
    expect(countManuscriptSourceWords("---\nid: \"note\"\ntitle: \"Not prose\"\n---\n\nFour body words here.\n")).toBe(4);
    expect(countManuscriptSourceWords("---\nunclosed metadata words\nActual prose\n")).toBe(5);
  });

  it("summarizes included, excluded, targeted, and unavailable scenes", () => {
    const included = scene("included", ready(120), true, 200);
    const excluded = scene("excluded", ready(30), false);
    const missing = scene("missing", unavailable());
    const counts = buildManuscriptWordCountIndex(
      manuscript([chapter("chapter", [included, excluded, missing])]),
    );

    expect(counts.items.get("included")).toMatchObject({
      verifiedWords: 120,
      includedWords: 120,
      excludedWords: 0,
      targetWords: 200,
      effectiveIncluded: true,
    });
    expect(counts.items.get("excluded")).toMatchObject({
      verifiedWords: 30,
      includedWords: 0,
      excludedWords: 30,
      effectiveIncluded: false,
    });
    expect(counts.items.get("chapter")).toMatchObject({
      verifiedWords: 150,
      includedWords: 120,
      excludedWords: 30,
      unavailableSources: 1,
      includedUnavailableSources: 1,
    });
    expect(counts.manuscript).toEqual({
      verifiedWords: 150,
      includedWords: 120,
      excludedWords: 30,
      unavailableSources: 1,
      includedUnavailableSources: 1,
    });
  });

  it("excludes an entire chapter from aggregates while retaining verified item counts", () => {
    const child = scene("child", ready(40));
    const excludedChapter = chapter("chapter", [child], false, null, ready(999));
    const counts = buildManuscriptWordCountIndex(manuscript([excludedChapter]));

    expect(counts.items.get("child")).toMatchObject({
      verifiedWords: 40,
      includedWords: 0,
      excludedWords: 40,
      effectiveIncluded: false,
    });
    expect(counts.items.get("chapter")).toMatchObject({
      verifiedWords: 40,
      includedWords: 0,
      excludedWords: 40,
    });
    expect(counts.manuscript).toMatchObject({
      verifiedWords: 40,
      includedWords: 0,
      excludedWords: 40,
      unavailableSources: 0,
    });
  });

  it("counts one-file chapter prose but never counts chapter overview notes", () => {
    const oneFile = chapter("chapter", [], true, ready(75), ready(500));
    const counts = buildManuscriptWordCountIndex(manuscript([oneFile]));

    expect(counts.items.get("chapter")).toMatchObject({
      verifiedWords: 75,
      includedWords: 75,
      unavailableSources: 0,
    });
    expect(counts.manuscript.verifiedWords).toBe(75);
  });

  it("formats complete, partial, targeted, and excluded totals honestly", () => {
    expect(formatManuscriptWordCount({
      verifiedWords: 150,
      includedWords: 120,
      excludedWords: 30,
      unavailableSources: 1,
      includedUnavailableSources: 1,
    }, { targetWords: 1_000 })).toBe(
      "120+ verified / 1,000 target words · 1 source unavailable · 30 excluded",
    );
    expect(formatManuscriptWordCount({
      verifiedWords: 0,
      includedWords: 0,
      excludedWords: 0,
      unavailableSources: 1,
      includedUnavailableSources: 1,
    }, { targetWords: 200 })).toBe(
      "Word count unavailable · Target 200 words · 1 source unavailable",
    );
    expect(formatManuscriptWordCount({
      verifiedWords: 75,
      includedWords: 0,
      excludedWords: 75,
      unavailableSources: 0,
      includedUnavailableSources: 0,
    }, { targetWords: 100, effectiveIncluded: false })).toBe(
      "75 / 100 words · Excluded from compile",
    );
    expect(formatManuscriptWordCount({
      verifiedWords: 10,
      includedWords: 10,
      excludedWords: 0,
      unavailableSources: 1,
      includedUnavailableSources: 0,
    })).toBe("10 words · 1 excluded source unavailable");
  });
});
