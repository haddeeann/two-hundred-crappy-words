import { describe, expect, it } from "vitest";

import {
  createProjectNavigationState,
  createRecentProject,
  isSafeProjectRelativePath,
  MAX_RECENT_PROJECTS,
  projectRelativePath,
  WorkspaceRepository,
  type WorkspaceBackend,
} from "./workspace";

class MemoryBackend implements WorkspaceBackend {
  values = new Map<string, unknown>();
  saves = 0;

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async save(): Promise<void> {
    this.saves += 1;
  }
}

const NOW = new Date("2026-08-22T12:00:00.000Z");

function recent(
  index: number,
  overrides: Partial<Parameters<typeof createRecentProject>[0]> = {},
) {
  return createRecentProject({
    projectKey: `project:${index}`,
    path: `/world/${index}`,
    name: `World ${index}`,
    kind: "world-project",
    now: new Date(NOW.getTime() + index),
    ...overrides,
  });
}

describe("workspace path safety", () => {
  it.each([
    ["/world", "/world", ""],
    ["/world", "/world/Lore/mars.md", "Lore/mars.md"],
    ["/", "/world/Lore/mars.md", "world/Lore/mars.md"],
    ["C:\\World", "C:\\World\\Lore\\mars.md", "Lore/mars.md"],
    ["/world", "/world-copy/mars.md", null],
    ["/world", "/other/world/mars.md", null],
  ] as const)("derives only contained paths", (root, absolute, expected) => {
    expect(projectRelativePath(root, absolute)).toBe(expected);
  });

  it.each(["../secret", "Lore/../secret", "/absolute", "Lore\\mars.md", "Lore//mars.md"])(
    "rejects unsafe relative path %j",
    (path) => expect(isSafeProjectRelativePath(path, false)).toBe(false),
  );
});

describe("workspace repository", () => {
  it("updates a moved world by stable key without duplicating it", async () => {
    const backend = new MemoryBackend();
    const repository = new WorkspaceRepository(backend);
    await repository.rememberProject(recent(1));
    await repository.rememberProject(
      recent(1, { path: "/moved/world", name: "Moved World" }),
    );

    expect(await repository.listRecent()).toEqual([
      expect.objectContaining({
        projectKey: "project:1",
        path: "/moved/world",
        name: "Moved World",
      }),
    ]);
  });

  it("requires ordinary folders to use their absolute path as identity", () => {
    expect(() =>
      createRecentProject({
        projectKey: "ordinary:wrong",
        path: "/world/ordinary",
        name: "Ordinary",
        kind: "ordinary",
      }),
    ).toThrow(/project key/);
    expect(() => recent(1, { path: "relative/world" })).toThrow(/required/);
  });

  it("keeps a bounded newest-first list and discards evicted navigation", async () => {
    const backend = new MemoryBackend();
    const repository = new WorkspaceRepository(backend);
    await repository.setNavigation(
      createProjectNavigationState({
        projectKey: "project:0",
        selectedDirectory: "",
        activeFile: null,
        expandedDirectories: [],
        now: NOW,
      }),
    );
    for (let index = 0; index <= MAX_RECENT_PROJECTS; index += 1) {
      await repository.rememberProject(recent(index));
    }

    const projects = await repository.listRecent();
    expect(projects).toHaveLength(MAX_RECENT_PROJECTS);
    expect(projects[0]?.projectKey).toBe(`project:${MAX_RECENT_PROJECTS}`);
    expect(projects.at(-1)?.projectKey).toBe("project:1");
    expect(await repository.getNavigation("project:0")).toBeNull();
  });

  it("persists sanitized navigation and removes it with a recent entry", async () => {
    const backend = new MemoryBackend();
    const repository = new WorkspaceRepository(backend);
    await repository.rememberProject(recent(2));
    const state = createProjectNavigationState({
      projectKey: "project:2",
      selectedDirectory: "Manuscript",
      activeFile: "Manuscript/chapter-one.md",
      expandedDirectories: ["Lore/Deep", "Manuscript", "Lore", "Lore"],
      now: NOW,
    });
    await repository.setNavigation(state);

    expect(await new WorkspaceRepository(backend).getNavigation("project:2"))
      .toEqual({
        ...state,
        expandedDirectories: ["Lore", "Manuscript", "Lore/Deep"],
      });
    await repository.removeProject("project:2");
    expect(await repository.listRecent()).toEqual([]);
    expect(await repository.getNavigation("project:2")).toBeNull();
  });

  it("ignores malformed stored entries and traversal state", async () => {
    const backend = new MemoryBackend();
    backend.values.set("recentProjects", [{ nope: true }, recent(1)]);
    backend.values.set("navigationStates", {
      "project:1": {
        version: 1,
        projectKey: "project:1",
        selectedDirectory: "../outside",
        activeFile: null,
        expandedDirectories: [],
        updatedAt: NOW.toISOString(),
      },
    });
    const repository = new WorkspaceRepository(backend);

    expect(await repository.listRecent()).toHaveLength(1);
    expect(await repository.getNavigation("project:1")).toBeNull();
  });
});
