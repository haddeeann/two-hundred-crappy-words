import { performance } from "node:perf_hooks";

import {
  buildLoreProjectIndexCooperatively,
  type LoreSourceDocument,
} from "../src/lib/lore/index";
import { LoreIndexSession } from "../src/lib/lore/session";
import {
  findWikiLinkCompletion,
  loreCompletionCandidates,
} from "../src/lib/lore/completion";
import { searchProjectLore } from "../src/lib/lore/search";
import { activeLoreMentions } from "../src/lib/lore/mentions";

const FILE_COUNT = 2_000;
const TARGET_BYTES = 25 * 1024 * 1024;
const PER_FILE_BODY = Math.floor(TARGET_BYTES / FILE_COUNT) - 180;

function fixture(): LoreSourceDocument[] {
  const repeated = "A patient signal crosses the quiet system. ";
  return Array.from({ length: FILE_COUNT }, (_, index) => {
    const next = (index + 1) % FILE_COUNT;
    const body = repeated.repeat(Math.ceil(PER_FILE_BODY / repeated.length)).slice(0, PER_FILE_BODY);
    return {
      path: `Lore/Sector-${Math.floor(index / 100)}/Note-${index}.md`,
      text: `# Note ${index}\n\n## Arrival\n\n[[Lore/Sector-${Math.floor(next / 100)}/Note-${next}|next signal]]\n\n${index === 0 ? "Note 1000 crosses the archive.\n\n" : ""}${body}`,
    };
  });
}

const sources = fixture();
const acceptedBytes = sources.reduce(
  (total, source) => total + new TextEncoder().encode(source.text).byteLength,
  0,
);

const fullStart = performance.now();
let lastYield = fullStart;
let longestWorkChunkMilliseconds = 0;
const index = await buildLoreProjectIndexCooperatively(sources, 1, {
  yieldControl: async () => {
    const now = performance.now();
    longestWorkChunkMilliseconds = Math.max(longestWorkChunkMilliseconds, now - lastYield);
    await new Promise<void>((resolve) => setImmediate(resolve));
    lastYield = performance.now();
  },
});
const fullMilliseconds = performance.now() - fullStart;
longestWorkChunkMilliseconds = Math.max(
  longestWorkChunkMilliseconds,
  performance.now() - lastYield,
);

const session = new LoreIndexSession();
await session.rebuild(async () => sources);
const updateStart = performance.now();
session.replaceDiskSource(
  sources[0]!.path,
  `${sources[0]!.text}\n\nA changed link to [[Note 25]].`,
);
const updateMilliseconds = performance.now() - updateStart;

const queryStart = performance.now();
for (let iteration = 0; iteration < 1_000; iteration += 1) {
  index.documents.get("Lore/Sector-10/Note-1000.md");
  index.backlinks.get("Lore/Sector-10/Note-1000.md");
}
const warmQueryMilliseconds = (performance.now() - queryStart) / 1_000;

const completionContext = findWikiLinkCompletion("[[Note 1", 8)!;
const firstCompletionStart = performance.now();
const firstCompletion = loreCompletionCandidates(
  index,
  sources[0]!.path,
  completionContext,
);
const firstCompletionMilliseconds = performance.now() - firstCompletionStart;
const warmCompletionStart = performance.now();
for (let iteration = 0; iteration < 100; iteration += 1) {
  loreCompletionCandidates(index, sources[0]!.path, completionContext);
}
const warmCompletionMilliseconds =
  (performance.now() - warmCompletionStart) / 100;

const firstSearchStart = performance.now();
const firstSearch = searchProjectLore(index, "patient signal");
const firstSearchMilliseconds = performance.now() - firstSearchStart;
const warmSearchStart = performance.now();
for (let iteration = 0; iteration < 25; iteration += 1) {
  searchProjectLore(index, "Note 1000");
}
const warmSearchMilliseconds = (performance.now() - warmSearchStart) / 25;

const firstMentionStart = performance.now();
const firstMentions = activeLoreMentions(index, sources[0]!.path);
const firstMentionMilliseconds = performance.now() - firstMentionStart;
const warmMentionStart = performance.now();
for (let iteration = 0; iteration < 25; iteration += 1) {
  activeLoreMentions(index, sources[0]!.path);
}
const warmMentionMilliseconds = (performance.now() - warmMentionStart) / 25;

const result = {
  files: sources.length,
  acceptedMiB: Number((acceptedBytes / (1024 * 1024)).toFixed(2)),
  indexedDocuments: index.documents.size,
  fullMilliseconds: Number(fullMilliseconds.toFixed(2)),
  longestWorkChunkMilliseconds: Number(longestWorkChunkMilliseconds.toFixed(2)),
  singleUpdateMilliseconds: Number(updateMilliseconds.toFixed(2)),
  warmQueryMilliseconds: Number(warmQueryMilliseconds.toFixed(4)),
  firstCompletionMilliseconds: Number(firstCompletionMilliseconds.toFixed(2)),
  warmCompletionMilliseconds: Number(warmCompletionMilliseconds.toFixed(2)),
  firstSearchMilliseconds: Number(firstSearchMilliseconds.toFixed(2)),
  warmSearchMilliseconds: Number(warmSearchMilliseconds.toFixed(2)),
  firstMentionMilliseconds: Number(firstMentionMilliseconds.toFixed(2)),
  warmMentionMilliseconds: Number(warmMentionMilliseconds.toFixed(2)),
  targets: {
    fullMilliseconds: 3_000,
    longestWorkChunkMilliseconds: 50,
    singleUpdateMilliseconds: 100,
    warmQueryMilliseconds: 50,
    firstCompletionMilliseconds: 50,
    warmCompletionMilliseconds: 50,
    firstSearchMilliseconds: 50,
    warmSearchMilliseconds: 50,
    firstMentionMilliseconds: 50,
    warmMentionMilliseconds: 50,
  },
};

console.log(JSON.stringify(result, null, 2));

if (
  index.documents.size !== FILE_COUNT ||
  fullMilliseconds > result.targets.fullMilliseconds ||
  longestWorkChunkMilliseconds > result.targets.longestWorkChunkMilliseconds ||
  updateMilliseconds > result.targets.singleUpdateMilliseconds ||
  warmQueryMilliseconds > result.targets.warmQueryMilliseconds ||
  firstCompletion.length === 0 ||
  firstCompletion.length > 8 ||
  firstCompletionMilliseconds > result.targets.firstCompletionMilliseconds ||
  warmCompletionMilliseconds > result.targets.warmCompletionMilliseconds ||
  firstSearch.length === 0 ||
  firstSearch.length > 30 ||
  firstSearchMilliseconds > result.targets.firstSearchMilliseconds ||
  warmSearchMilliseconds > result.targets.warmSearchMilliseconds ||
  firstMentions.length === 0 ||
  firstMentions.length > 20 ||
  firstMentionMilliseconds > result.targets.firstMentionMilliseconds ||
  warmMentionMilliseconds > result.targets.warmMentionMilliseconds
) {
  process.exitCode = 1;
}
