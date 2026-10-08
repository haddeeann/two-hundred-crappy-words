import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import { searchProjectLore } from "$lib/lore/search";
import { countWords } from "$lib/practice/word-count";

const LARGE_PROJECT_DOCUMENTS = 5_000;
const INDEX_BUDGET_MS = 2_500;
const SEARCH_BUDGET_MS = 100;
const TYPING_DERIVATION_BUDGET_MS = 16;

describe("local performance budgets", () => {
  it("indexes and searches the supported 5,000-note project boundary", () => {
    const sources = Array.from({ length: LARGE_PROJECT_DOCUMENTS }, (_, index) => ({
      path: `Lore/note-${String(index).padStart(4, "0")}.md`,
      text: `# Signal ${index}\n\n${"A quiet relay crosses Mars. ".repeat(360)}marker-${index}`,
    }));

    const indexStarted = performance.now();
    const project = buildLoreProjectIndex(sources);
    const indexElapsed = performance.now() - indexStarted;

    const searchStarted = performance.now();
    const results = searchProjectLore(project, "marker-4999");
    const searchElapsed = performance.now() - searchStarted;

    expect(project.documents.size).toBe(LARGE_PROJECT_DOCUMENTS);
    expect(results[0]?.path).toBe("Lore/note-4999.md");
    expect(indexElapsed).toBeLessThan(INDEX_BUDGET_MS);
    expect(searchElapsed).toBeLessThan(SEARCH_BUDGET_MS);
  });

  it("keeps per-keystroke word derivation inside one 60 Hz frame for 10,000 words", () => {
    const draft = `${"signal ".repeat(9_999)}arrival`;

    // Warm the regular expressions and JavaScript engine before measuring the
    // same whole-document operation used by the active editor.
    expect(countWords("warm up")).toBe(2);
    const started = performance.now();
    const words = countWords(draft);
    const elapsed = performance.now() - started;

    expect(words).toBe(10_000);
    expect(elapsed).toBeLessThan(TYPING_DERIVATION_BUDGET_MS);
  });
});
