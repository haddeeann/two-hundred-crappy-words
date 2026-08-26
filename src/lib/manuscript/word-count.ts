import { parseFrontmatter } from "$lib/lore/frontmatter";
import { countWords } from "$lib/practice/word-count";
import type {
  ManuscriptSourceState,
  ReconciledManuscript,
  ReconciledManuscriptChapter,
  ReconciledManuscriptScene,
} from "./source-reconciliation";

export interface ManuscriptWordCountSummary {
  verifiedWords: number;
  includedWords: number;
  excludedWords: number;
  unavailableSources: number;
  includedUnavailableSources: number;
}

export interface ManuscriptItemWordCountSummary extends ManuscriptWordCountSummary {
  itemId: string;
  kind: "chapter" | "scene";
  effectiveIncluded: boolean;
  targetWords?: number;
}

export interface ManuscriptWordCountIndex {
  manuscript: ManuscriptWordCountSummary;
  items: ReadonlyMap<string, ManuscriptItemWordCountSummary>;
}

export interface ManuscriptWordCountDisplayOptions {
  targetWords?: number;
  effectiveIncluded?: boolean;
}

/** Count the Markdown body while excluding only a valid leading metadata block. */
export function countManuscriptSourceWords(text: string): number {
  const frontmatter = parseFrontmatter(text);
  return countWords(frontmatter.range ? text.slice(frontmatter.bodyStart) : text);
}

export function buildManuscriptWordCountIndex(
  manuscript: ReconciledManuscript,
): ManuscriptWordCountIndex {
  const items = new Map<string, ManuscriptItemWordCountSummary>();
  const manuscriptSummary = emptySummary();

  for (const item of manuscript.items) {
    const summary = "children" in item
      ? summarizeChapter(item, items)
      : summarizeScene(item, true);
    items.set(item.item.id, summary);
    addSummary(manuscriptSummary, summary);
  }

  return { manuscript: manuscriptSummary, items };
}

export function formatManuscriptWordCount(
  summary: ManuscriptWordCountSummary,
  options: ManuscriptWordCountDisplayOptions = {},
): string {
  const effectiveIncluded = options.effectiveIncluded ?? true;
  const words = effectiveIncluded ? summary.includedWords : summary.verifiedWords;
  const unavailable = effectiveIncluded
    ? summary.includedUnavailableSources
    : summary.unavailableSources;
  const partial = unavailable > 0;
  const target = options.targetWords;
  let label: string;

  if (partial && words === 0) {
    label = "Word count unavailable";
    if (target !== undefined) label += ` · Target ${formatNumber(target)} words`;
  } else if (target !== undefined) {
    label = partial
      ? `${formatNumber(words)}+ verified / ${formatNumber(target)} target words`
      : `${formatNumber(words)} / ${formatNumber(target)} words`;
  } else if (summary.excludedWords > 0 && effectiveIncluded) {
    label = `${formatNumber(words)}${partial ? "+ verified" : ""} included words`;
  } else {
    label = `${formatNumber(words)}${partial ? "+ verified" : ""} words`;
  }

  if (unavailable > 0) {
    label += ` · ${formatNumber(unavailable)} ${unavailable === 1 ? "source" : "sources"} unavailable`;
  }
  const excludedUnavailable = summary.unavailableSources - summary.includedUnavailableSources;
  if (effectiveIncluded && excludedUnavailable > 0) {
    label += ` · ${formatNumber(excludedUnavailable)} excluded ${excludedUnavailable === 1 ? "source" : "sources"} unavailable`;
  }
  if (effectiveIncluded && summary.excludedWords > 0) {
    label += ` · ${formatNumber(summary.excludedWords)} excluded`;
  }
  if (!effectiveIncluded) label += " · Excluded from compile";
  return label;
}

function summarizeChapter(
  chapter: ReconciledManuscriptChapter,
  items: Map<string, ManuscriptItemWordCountSummary>,
): ManuscriptItemWordCountSummary {
  const effectiveIncluded = chapter.item.includeInCompile;
  const summary = itemSummary(
    chapter.item.id,
    "chapter",
    effectiveIncluded,
    chapter.item.targetWords,
  );

  if (chapter.source) {
    addSource(summary, chapter.source, effectiveIncluded);
  }
  for (const scene of chapter.children) {
    const sceneSummary = summarizeScene(scene, effectiveIncluded);
    items.set(scene.item.id, sceneSummary);
    addSummary(summary, sceneSummary);
  }
  return summary;
}

function summarizeScene(
  scene: ReconciledManuscriptScene,
  parentIncluded: boolean,
): ManuscriptItemWordCountSummary {
  const effectiveIncluded = parentIncluded && scene.item.includeInCompile;
  const summary = itemSummary(
    scene.item.id,
    "scene",
    effectiveIncluded,
    scene.item.targetWords,
  );
  addSource(summary, scene.source, effectiveIncluded);
  return summary;
}

function itemSummary(
  itemId: string,
  kind: "chapter" | "scene",
  effectiveIncluded: boolean,
  targetWords: number | undefined,
): ManuscriptItemWordCountSummary {
  return {
    ...emptySummary(),
    itemId,
    kind,
    effectiveIncluded,
    ...(targetWords === undefined ? {} : { targetWords }),
  };
}

function emptySummary(): ManuscriptWordCountSummary {
  return {
    verifiedWords: 0,
    includedWords: 0,
    excludedWords: 0,
    unavailableSources: 0,
    includedUnavailableSources: 0,
  };
}

function addSource(
  summary: ManuscriptWordCountSummary,
  source: ManuscriptSourceState,
  included: boolean,
): void {
  if (source.kind !== "ready") {
    summary.unavailableSources += 1;
    if (included) summary.includedUnavailableSources += 1;
    return;
  }
  summary.verifiedWords += source.wordCount;
  if (included) summary.includedWords += source.wordCount;
  else summary.excludedWords += source.wordCount;
}

function addSummary(
  destination: ManuscriptWordCountSummary,
  source: ManuscriptWordCountSummary,
): void {
  destination.verifiedWords += source.verifiedWords;
  destination.includedWords += source.includedWords;
  destination.excludedWords += source.excludedWords;
  destination.unavailableSources += source.unavailableSources;
  destination.includedUnavailableSources += source.includedUnavailableSources;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}
