import type { FileTreeEntry } from "$lib/editor/file-tree";
import { validateFolderName } from "$lib/editor/file-tree";
import {
  MANUSCRIPT_STRUCTURE_FILE,
  serializeManuscriptStructure,
  type ManuscriptStructure,
} from "$lib/manuscript/structure";
import {
  createWorldProjectManifest,
  serializeWorldProjectManifest,
  WORLD_PROJECT_MANIFEST_FILE,
} from "$lib/project/manifest";

export const SAMPLE_PROJECT_NAME = "The Quiet Signal";
export const SAMPLE_PROJECT_FOLDER = "The Quiet Signal Sample";

export interface SampleProjectFile {
  path: string;
  text: string;
}

export type SampleProjectPlan =
  | { kind: "blocked"; folderName: string }
  | {
      kind: "ready";
      folderName: string;
      directories: readonly string[];
      files: readonly SampleProjectFile[];
      manifestText: string;
      paths: readonly string[];
    };

export type SampleProjectResult =
  | { kind: "complete" }
  | {
      kind: "failed";
      failedAt: string;
      message: string;
      retainedPaths: string[];
      rollbackIssues: string[];
    };

const IDS = {
  manuscript: "4e98dbb1-1cf9-438b-9b39-307ccbb9740c",
  chapter: "f405d494-4158-4eec-8d4a-32861e490c0b",
  chapterNote: "b086b4c9-3438-4305-abfd-a12b453b02a2",
  firstScene: "bb6fa04c-27d8-4a2f-95ea-b0d9b4ab769e",
  firstSceneNote: "0ca8013d-63d1-4f8e-bd65-6be26e40b20f",
  secondScene: "64a872a9-0c39-40f2-8664-aac2cd2d00b2",
  secondSceneNote: "59e93113-5647-4eb2-bfca-eb28462108a9",
  mara: "d72fa159-64a8-4883-aae5-e6d7150f1f4a",
  station: "cda5e75b-4768-4ab8-b396-f1d5cce900ae",
  glass: "f13c47f1-4fc7-450a-ab9e-11215d056f62",
  bornFact: "44d2b981-2326-4fcc-9d48-20bfa073763a",
  locatedFact: "66631f73-e587-4e84-bea0-467af40e46f7",
} as const;

const DIRECTORIES = [
  "Daily",
  "Manuscript",
  "Manuscript/01 Arrival",
  "Characters",
  "Locations",
  "Technology",
] as const;

export function planSampleProject({
  parentEntries,
  projectId,
  folderName = SAMPLE_PROJECT_FOLDER,
}: {
  parentEntries: readonly FileTreeEntry[];
  projectId: string;
  folderName?: string;
}): SampleProjectPlan {
  const normalizedFolderName = folderName.trim();
  const issue = validateFolderName(normalizedFolderName);
  if (issue) throw new RangeError(issue);
  if (
    parentEntries.some(
      (entry) =>
        entry.name.localeCompare(normalizedFolderName, undefined, {
          sensitivity: "base",
        }) === 0,
    )
  ) {
    return { kind: "blocked", folderName: normalizedFolderName };
  }

  const manifest = createWorldProjectManifest({
    projectId,
    name: SAMPLE_PROJECT_NAME,
    folders: {
      manuscript: "Manuscript",
      characters: "Characters",
      locations: "Locations",
      technology: "Technology",
    },
  });
  const files = createSampleFiles();
  const paths = [
    ...DIRECTORIES.map((path) => `${path}/`),
    ...files.map(({ path }) => path),
    WORLD_PROJECT_MANIFEST_FILE,
  ];
  return {
    kind: "ready",
    folderName: normalizedFolderName,
    directories: DIRECTORIES,
    files,
    manifestText: serializeWorldProjectManifest(manifest),
    paths,
  };
}

export async function executeSampleProject(
  plan: Extract<SampleProjectPlan, { kind: "ready" }>,
  operations: {
    createRoot: () => Promise<void>;
    createDirectory: (relativePath: string) => Promise<void>;
    createFile: (relativePath: string, text: string) => Promise<void>;
    createManifest: (text: string) => Promise<void>;
    removeFile: (relativePath: string) => Promise<void>;
    removeDirectory: (relativePath: string) => Promise<void>;
    removeRoot: () => Promise<void>;
  },
): Promise<SampleProjectResult> {
  let rootCreated = false;
  const createdDirectories: string[] = [];
  const createdFiles: string[] = [];
  let failedAt = plan.folderName;

  try {
    await operations.createRoot();
    rootCreated = true;
    for (const path of plan.directories) {
      failedAt = path;
      await operations.createDirectory(path);
      createdDirectories.push(path);
    }
    for (const file of plan.files) {
      failedAt = file.path;
      await operations.createFile(file.path, file.text);
      createdFiles.push(file.path);
    }
    failedAt = WORLD_PROJECT_MANIFEST_FILE;
    await operations.createManifest(plan.manifestText);
    return { kind: "complete" };
  } catch (cause) {
    const rollbackIssues: string[] = [];
    const retained = new Set<string>(createdFiles);
    for (const path of [...createdFiles].reverse()) {
      try {
        await operations.removeFile(path);
        retained.delete(path);
      } catch (rollbackCause) {
        rollbackIssues.push(`${path}: ${formatError(rollbackCause)}`);
      }
    }
    for (const path of [...createdDirectories].reverse()) {
      try {
        await operations.removeDirectory(path);
      } catch (rollbackCause) {
        retained.add(`${path}/`);
        rollbackIssues.push(`${path}/: ${formatError(rollbackCause)}`);
      }
    }
    if (rootCreated) {
      try {
        await operations.removeRoot();
      } catch (rollbackCause) {
        retained.add(`${plan.folderName}/`);
        rollbackIssues.push(`${plan.folderName}/: ${formatError(rollbackCause)}`);
      }
    }
    return {
      kind: "failed",
      failedAt,
      message: formatError(cause),
      retainedPaths: [...retained],
      rollbackIssues,
    };
  }
}

function createSampleFiles(): SampleProjectFile[] {
  const structure: ManuscriptStructure = {
    formatVersion: 1,
    manuscripts: [
      {
        id: IDS.manuscript,
        title: SAMPLE_PROJECT_NAME,
        items: [
          {
            id: IDS.chapter,
            kind: "chapter",
            title: "Arrival",
            folder: "Manuscript/01 Arrival",
            overview: {
              path: "Manuscript/01 Arrival/chapter.md",
              noteId: IDS.chapterNote,
            },
            synopsis: "Mara follows a patient signal into an abandoned listening station.",
            status: "sample",
            includeInCompile: true,
            children: [
              {
                id: IDS.firstScene,
                kind: "scene",
                title: "The signal",
                source: {
                  path: "Manuscript/01 Arrival/01 the-signal.md",
                  noteId: IDS.firstSceneNote,
                },
                pov: "Mara Venn",
                location: "Quiet Station",
                status: "sample",
                includeInCompile: true,
              },
              {
                id: IDS.secondScene,
                kind: "scene",
                title: "A remembered voice",
                source: {
                  path: "Manuscript/01 Arrival/02 remembered-voice.md",
                  noteId: IDS.secondSceneNote,
                },
                pov: "Mara Venn",
                location: "Quiet Station",
                status: "sample",
                includeInCompile: true,
              },
            ],
          },
        ],
      },
    ],
  };

  return [
    {
      path: "README.md",
      text: `# ${SAMPLE_PROJECT_NAME}\n\nThis is an optional, completely editable sample world. Explore the files, try **Write today**, follow the wiki links, open the manuscript corkboard, or run Continuity review.\n\nTo remove it, close the app and move the complete **${SAMPLE_PROJECT_FOLDER}** folder to Trash. To keep your version, copy or rename the complete folder; the app can make a copied world independent from Writing tools.\n`,
    },
    {
      path: "Daily/Start here.md",
      text: "# A daily spark\n\nWhat did the signal sound like before Mara understood it was a voice? Write badly and find out.\n",
    },
    {
      path: "Manuscript/01 Arrival/chapter.md",
      text: note(IDS.chapterNote, "chapter", "Arrival", "## Chapter notes\n\nThe signal should feel inviting before it feels impossible. Keep the station quiet enough that every mechanical sound matters."),
    },
    {
      path: "Manuscript/01 Arrival/01 the-signal.md",
      text: note(IDS.firstSceneNote, "scene", "The signal", "Mara Venn heard the signal through the hull before the instruments admitted it existed. Three patient tones crossed the dark between her ship and [[Quiet Station]].\n\nShe should have reported it. Instead, she matched her breathing to the pulse and guided the ship toward the station's unlit dock."),
    },
    {
      path: "Manuscript/01 Arrival/02 remembered-voice.md",
      text: note(IDS.secondSceneNote, "scene", "A remembered voice", "Inside the observation ring, frost silvered every console except one. A shard of [[Memory Glass]] waited there, warm beneath Mara's glove.\n\nThe next signal came in her own voice: *You already know why they left.*"),
    },
    {
      path: "Characters/Mara Venn.md",
      text: `---\nid: "${IDS.mara}"\ntype: "character"\ntitle: "Mara Venn"\ncanon: "canon"\nfacts:\n  - id: "${IDS.bornFact}"\n    property: "born"\n    value:\n      kind: "time"\n      calendar: "gregorian"\n      expression: "2134-04-06"\n    certainty: "exact"\n  - id: "${IDS.locatedFact}"\n    property: "located-at"\n    value:\n      kind: "note"\n      id: "${IDS.station}"\n    certainty: "exact"\n---\n\n# Mara Venn\n\nA salvage pilot who trusts patient machines more readily than hurried people. She came to [[Quiet Station]] because no one else believed its signal was real.\n\n## Open question\n\nWhy does the voice in the [[Memory Glass]] sound like her?\n`,
    },
    {
      path: "Locations/Quiet Station.md",
      text: note(IDS.station, "location", "Quiet Station", "An abandoned listening station on the cold edge of a mapped system. Its observation ring is dark, but one console still protects a piece of [[Memory Glass]]."),
    },
    {
      path: "Technology/Memory Glass.md",
      text: note(IDS.glass, "technology", "Memory Glass", "A crystal storage medium that replays sensory fragments only when warmed by a living hand. Copies lose the emotional layer, which makes every original politically dangerous."),
    },
    { path: MANUSCRIPT_STRUCTURE_FILE, text: serializeManuscriptStructure(structure) },
  ];
}

function note(id: string, type: string, title: string, body: string): string {
  return `---\nid: "${id}"\ntype: "${type}"\ntitle: "${title}"\ncanon: "canon"\n---\n\n# ${title}\n\n${body}\n`;
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
