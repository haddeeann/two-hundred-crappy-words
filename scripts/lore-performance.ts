import { performance } from "node:perf_hooks";

import {
  buildLoreProjectIndexCooperatively,
  type LoreSourceDocument,
} from "../src/lib/lore/index";
import { LoreIndexSession } from "../src/lib/lore/session";

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
      text: `# Note ${index}\n\n## Arrival\n\n[[Lore/Sector-${Math.floor(next / 100)}/Note-${next}|next signal]]\n\n${body}`,
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

const result = {
  files: sources.length,
  acceptedMiB: Number((acceptedBytes / (1024 * 1024)).toFixed(2)),
  indexedDocuments: index.documents.size,
  fullMilliseconds: Number(fullMilliseconds.toFixed(2)),
  longestWorkChunkMilliseconds: Number(longestWorkChunkMilliseconds.toFixed(2)),
  singleUpdateMilliseconds: Number(updateMilliseconds.toFixed(2)),
  warmQueryMilliseconds: Number(warmQueryMilliseconds.toFixed(4)),
  targets: {
    fullMilliseconds: 3_000,
    longestWorkChunkMilliseconds: 50,
    singleUpdateMilliseconds: 100,
    warmQueryMilliseconds: 50,
  },
};

console.log(JSON.stringify(result, null, 2));

if (
  index.documents.size !== FILE_COUNT ||
  fullMilliseconds > result.targets.fullMilliseconds ||
  longestWorkChunkMilliseconds > result.targets.longestWorkChunkMilliseconds ||
  updateMilliseconds > result.targets.singleUpdateMilliseconds ||
  warmQueryMilliseconds > result.targets.warmQueryMilliseconds
) {
  process.exitCode = 1;
}
