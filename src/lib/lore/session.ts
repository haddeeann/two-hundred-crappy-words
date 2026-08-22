import { buildLoreProjectIndex, type LoreSourceDocument } from "./index";
import type { LoreProjectIndex } from "./types";

export type LoreIndexLoadResult =
  | { kind: "committed"; index: LoreProjectIndex }
  | { kind: "stale" };

export class LoreIndexSession {
  private revision = 0;
  private generation = 0;
  private diskSources = new Map<string, string>();
  private overlays = new Map<string, string>();
  private index: LoreProjectIndex | null = null;

  current(): LoreProjectIndex | null {
    return this.index;
  }

  async rebuild(
    load: () => Promise<readonly LoreSourceDocument[]>,
  ): Promise<LoreIndexLoadResult> {
    const revision = ++this.revision;
    const sources = await load();
    if (revision !== this.revision) return { kind: "stale" };

    this.diskSources = new Map(sources.map((source) => [source.path, source.text]));
    this.overlays.clear();
    return { kind: "committed", index: this.reindex() };
  }

  invalidatePendingWork(): void {
    this.revision += 1;
  }

  replaceDiskSource(path: string, text: string): LoreProjectIndex {
    this.revision += 1;
    this.diskSources.set(path, text);
    this.overlays.delete(path);
    return this.reindex();
  }

  removeDiskSource(path: string): LoreProjectIndex {
    this.revision += 1;
    this.diskSources.delete(path);
    this.overlays.delete(path);
    return this.reindex();
  }

  setActiveOverlay(path: string, text: string): LoreProjectIndex {
    this.revision += 1;
    this.overlays.set(path, text);
    return this.reindex();
  }

  clearActiveOverlay(path: string): LoreProjectIndex {
    this.revision += 1;
    this.overlays.delete(path);
    return this.reindex();
  }

  private reindex(): LoreProjectIndex {
    const paths = new Set([...this.diskSources.keys(), ...this.overlays.keys()]);
    const sources = [...paths]
      .sort((first, second) => first.localeCompare(second))
      .map((path) => ({ path, text: this.overlays.get(path) ?? this.diskSources.get(path)! }));
    this.index = buildLoreProjectIndex(sources, ++this.generation);
    return this.index;
  }
}
