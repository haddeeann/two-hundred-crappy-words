import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createRecoveryRecord,
  RecoveryRepository,
  type RecoveryBackend,
} from "$lib/editor/recovery";
import type { LoreScanBackend } from "$lib/lore/scan";
import { loadContinuityReviewProject } from "$lib/continuity-review/load";
import { loadManuscriptProject } from "$lib/manuscript/source-reconciliation";
import { loadMapsProject } from "$lib/maps/load";
import { loadTimelineProject } from "$lib/timeline/load";
import { parseWorldProjectManifest } from "./manifest";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const temporaryRoots = new Set<string>();

afterEach(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

class MemoryRecoveryBackend implements RecoveryBackend {
  readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async save(): Promise<void> {}
}

function filesystemBackend(): LoreScanBackend {
  return {
    async readDirectory(path) {
      return readdirSync(path, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
        isSymlink: entry.isSymbolicLink(),
      }));
    },
    async readText(path) {
      return readFileSync(path, "utf8");
    },
    async inspectFile(path) {
      const metadata = statSync(path);
      return {
        size: metadata.size,
        revision: `${metadata.mtimeMs}:${metadata.ctimeMs}`,
      };
    },
    async join(parent, child) {
      return join(parent, child);
    },
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createPortableWorld(root: string): void {
  mkdirSync(join(root, "Daily"), { recursive: true });
  mkdirSync(join(root, "Manuscript", "01 Signal"), { recursive: true });
  mkdirSync(join(root, "Maps"), { recursive: true });

  writeJson(join(root, "200-crappy-words.project.json"), {
    format: "200-crappy-words/world-project",
    formatVersion: 1,
    projectId: PROJECT_ID,
    name: "Backup Signal",
    folders: { manuscript: "Manuscript" },
    futureWriterField: { preserved: true },
  });
  writeJson(join(root, "200-crappy-words.manuscripts.json"), {
    formatVersion: 1,
    manuscripts: [{
      id: "7339b0ee-5f87-493d-bcad-e56636d7cb26",
      title: "The Backup Signal",
      items: [{
        id: "422b34ce-2d0f-4916-a557-553fc95db31b",
        kind: "chapter",
        title: "Signal",
        folder: "Manuscript/01 Signal",
        children: [{
          id: "6eea7c60-8e12-4b9a-9716-f31cd3450eb3",
          kind: "scene",
          title: "A copied transmission",
          source: { path: "Manuscript/01 Signal/01 transmission.md" },
        }],
      }],
    }],
  });
  writeJson(join(root, "200-crappy-words.timeline.json"), {
    format: "200-crappy-words/timeline",
    formatVersion: 1,
    projectId: PROJECT_ID,
    calendars: [],
    tracks: [],
  });
  writeJson(join(root, "200-crappy-words.maps.json"), {
    format: "200-crappy-words/maps",
    formatVersion: 1,
    projectId: PROJECT_ID,
    maps: [],
  });
  writeJson(join(root, "200-crappy-words.continuity-review.json"), {
    format: "200-crappy-words/continuity-review",
    formatVersion: 1,
    projectId: PROJECT_ID,
    exceptions: [],
  });
  writeFileSync(
    join(root, "Manuscript", "01 Signal", "01 transmission.md"),
    "# A copied transmission\n\nThe receiver wakes under a red sun.\n",
  );
  writeFileSync(join(root, "Daily", "2026-10-08.md"), "A portable daily fragment.\n");
  writeFileSync(join(root, "Maps", "system.png"), new Uint8Array([1, 2, 3, 4]));
}

function fileDigests(root: string): Map<string, string> {
  const result = new Map<string, string>();
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        result.set(
          relative(root, path),
          createHash("sha256").update(readFileSync(path)).digest("hex"),
        );
      }
    }
  };
  visit(root);
  return result;
}

describe("project-folder backup and restore", () => {
  it("restores every portable source and project identity at a new path", async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "two-hundred-backup-"));
    temporaryRoots.add(temporaryRoot);
    const original = join(temporaryRoot, "original");
    const restored = join(temporaryRoot, "restored");
    mkdirSync(original);
    createPortableWorld(original);

    const expectedDigests = fileDigests(original);
    cpSync(original, restored, { recursive: true, preserveTimestamps: true });

    expect(fileDigests(restored)).toEqual(expectedDigests);
    expect([...expectedDigests.keys()]).not.toEqual(
      expect.arrayContaining([
        "settings.json",
        "workspace.json",
        "daily-progress.json",
        "recovery.json",
        ".persisted-scope",
      ]),
    );

    const manifestText = readFileSync(
      join(restored, "200-crappy-words.project.json"),
      "utf8",
    );
    const manifest = parseWorldProjectManifest(manifestText);
    expect(manifest).toMatchObject({
      kind: "valid",
      manifest: { projectId: PROJECT_ID, name: "Backup Signal" },
      source: { futureWriterField: { preserved: true } },
    });

    const backend = filesystemBackend();
    await expect(loadManuscriptProject(restored, backend)).resolves.toMatchObject({
      kind: "ready",
      reconciled: {
        manuscripts: [{ items: [{ children: [{ source: { kind: "ready" } }] }] }],
      },
    });
    await expect(loadTimelineProject(restored, backend, PROJECT_ID)).resolves.toMatchObject({
      kind: "ready",
      timeline: { projectId: PROJECT_ID },
    });
    await expect(loadMapsProject(restored, backend, PROJECT_ID)).resolves.toMatchObject({
      kind: "ready",
      mapsProject: { projectId: PROJECT_ID },
    });
    await expect(
      loadContinuityReviewProject(restored, backend, PROJECT_ID),
    ).resolves.toMatchObject({
      kind: "ready",
      continuityReviewProject: { projectId: PROJECT_ID },
    });
  });

  it("does not apply an original-path recovery draft to a restored copy", async () => {
    const repository = new RecoveryRepository(new MemoryRecoveryBackend());
    const originalPath = "/Volumes/Writing/World/scene.md";
    const restoredPath = "/Users/writer/Restored World/scene.md";
    await repository.put(createRecoveryRecord({
      path: originalPath,
      content: "Unsaved original-path text",
      persistedContent: "Saved text",
      revision: 4,
      now: new Date("2026-10-08T12:00:00.000Z"),
    }));

    expect(await repository.get(originalPath)).not.toBeNull();
    expect(await repository.get(restoredPath)).toBeNull();
  });
});
