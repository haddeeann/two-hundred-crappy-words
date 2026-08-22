export const WORKSPACE_STORE_FILE = "workspace.json";
export const MAX_RECENT_PROJECTS = 12;
const RECENT_PROJECTS_KEY = "recentProjects";
const NAVIGATION_STATES_KEY = "navigationStates";

export interface WorkspaceBackend {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

export interface RecentProject {
  version: 1;
  projectKey: string;
  path: string;
  name: string;
  kind: "ordinary" | "world-project";
  lastOpenedAt: string;
}

export interface ProjectNavigationState {
  version: 1;
  projectKey: string;
  selectedDirectory: string;
  activeFile: string | null;
  expandedDirectories: string[];
  updatedAt: string;
}

export function createRecentProject({
  projectKey,
  path,
  name,
  kind,
  now = new Date(),
}: {
  projectKey: string;
  path: string;
  name: string;
  kind: RecentProject["kind"];
  now?: Date;
}): RecentProject {
  if (!projectKey || !isAbsoluteProjectPath(path) || !name.trim()) {
    throw new RangeError("A project key, path, and name are required.");
  }
  if (kind === "ordinary" && projectKey !== path) {
    throw new RangeError("An ordinary folder's project key must be its path.");
  }
  return {
    version: 1,
    projectKey,
    path,
    name: name.trim(),
    kind,
    lastOpenedAt: now.toISOString(),
  };
}

export function createProjectNavigationState({
  projectKey,
  selectedDirectory,
  activeFile,
  expandedDirectories,
  now = new Date(),
}: {
  projectKey: string;
  selectedDirectory: string;
  activeFile: string | null;
  expandedDirectories: readonly string[];
  now?: Date;
}): ProjectNavigationState {
  if (!projectKey) throw new RangeError("A project key is required.");
  if (!isSafeProjectRelativePath(selectedDirectory, true)) {
    throw new RangeError("The selected directory must stay inside the project.");
  }
  if (activeFile !== null && !isSafeProjectRelativePath(activeFile, false)) {
    throw new RangeError("The active file must stay inside the project.");
  }

  const expanded = [...new Set(expandedDirectories)];
  if (expanded.some((path) => !isSafeProjectRelativePath(path, false))) {
    throw new RangeError("Expanded directories must stay inside the project.");
  }
  expanded.sort((first, second) => {
    const depth = pathDepth(first) - pathDepth(second);
    return depth || first.localeCompare(second);
  });

  return {
    version: 1,
    projectKey,
    selectedDirectory,
    activeFile,
    expandedDirectories: expanded,
    updatedAt: now.toISOString(),
  };
}

export function projectRelativePath(
  rootPath: string,
  absolutePath: string,
): string | null {
  const root = normalizeAbsolutePath(rootPath);
  const absolute = normalizeAbsolutePath(absolutePath);
  if (!root || !absolute) return null;
  if (absolute === root) return "";
  const prefix = root === "/" ? "/" : `${root}/`;
  if (!absolute.startsWith(prefix)) return null;

  const relative = absolute.slice(prefix.length);
  return isSafeProjectRelativePath(relative, false) ? relative : null;
}

export function isSafeProjectRelativePath(
  path: string,
  allowRoot: boolean,
): boolean {
  if (path === "") return allowRoot;
  if (path.startsWith("/") || path.includes("\\")) return false;
  const segments = path.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

export class WorkspaceRepository {
  private readonly backend: WorkspaceBackend;
  private operations: Promise<void> = Promise.resolve();

  constructor(backend: WorkspaceBackend) {
    this.backend = backend;
  }

  async listRecent(): Promise<RecentProject[]> {
    await this.operations;
    return this.readRecentProjects();
  }

  rememberProject(project: RecentProject): Promise<void> {
    if (!isRecentProject(project)) {
      return Promise.reject(new RangeError("The recent project is invalid."));
    }

    return this.enqueue(async () => {
      const previous = await this.readRecentProjects();
      const recent = [
        structuredClone(project),
        ...previous.filter((entry) => entry.projectKey !== project.projectKey),
      ].slice(0, MAX_RECENT_PROJECTS);
      const retainedKeys = new Set(recent.map((entry) => entry.projectKey));
      const navigation = await this.readNavigationStates();
      for (const key of Object.keys(navigation)) {
        if (!retainedKeys.has(key)) delete navigation[key];
      }

      await this.backend.set(RECENT_PROJECTS_KEY, recent);
      await this.backend.set(NAVIGATION_STATES_KEY, navigation);
      await this.backend.save();
    });
  }

  removeProject(projectKey: string): Promise<void> {
    if (!projectKey) {
      return Promise.reject(new RangeError("A project key is required."));
    }
    return this.enqueue(async () => {
      const recent = (await this.readRecentProjects()).filter(
        (entry) => entry.projectKey !== projectKey,
      );
      const navigation = await this.readNavigationStates();
      delete navigation[projectKey];
      await this.backend.set(RECENT_PROJECTS_KEY, recent);
      await this.backend.set(NAVIGATION_STATES_KEY, navigation);
      await this.backend.save();
    });
  }

  async getNavigation(
    projectKey: string,
  ): Promise<ProjectNavigationState | null> {
    await this.operations;
    const navigation = await this.readNavigationStates();
    return navigation[projectKey] ?? null;
  }

  setNavigation(state: ProjectNavigationState): Promise<void> {
    if (!isProjectNavigationState(state)) {
      return Promise.reject(new RangeError("The navigation state is invalid."));
    }
    return this.enqueue(async () => {
      const navigation = await this.readNavigationStates();
      navigation[state.projectKey] = structuredClone(state);
      await this.backend.set(NAVIGATION_STATES_KEY, navigation);
      await this.backend.save();
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operations.catch(() => {}).then(operation);
    this.operations = next.catch(() => {});
    return next;
  }

  private async readRecentProjects(): Promise<RecentProject[]> {
    const stored = await this.backend.get<unknown>(RECENT_PROJECTS_KEY);
    if (!Array.isArray(stored)) return [];
    const seen = new Set<string>();
    return stored
      .filter(isRecentProject)
      .filter((entry) => {
        if (seen.has(entry.projectKey)) return false;
        seen.add(entry.projectKey);
        return true;
      })
      .slice(0, MAX_RECENT_PROJECTS)
      .map((entry) => structuredClone(entry));
  }

  private async readNavigationStates(): Promise<
    Record<string, ProjectNavigationState>
  > {
    const stored = await this.backend.get<unknown>(NAVIGATION_STATES_KEY);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(stored).filter(
        (entry): entry is [string, ProjectNavigationState] =>
          isProjectNavigationState(entry[1]) &&
          entry[0] === entry[1].projectKey,
      ),
    );
  }
}

function isRecentProject(value: unknown): value is RecentProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<RecentProject>;
  return (
    project.version === 1 &&
    typeof project.projectKey === "string" &&
    project.projectKey.length > 0 &&
    typeof project.path === "string" &&
    isAbsoluteProjectPath(project.path) &&
    typeof project.name === "string" &&
    project.name.trim().length > 0 &&
    (project.kind === "ordinary" || project.kind === "world-project") &&
    (project.kind !== "ordinary" || project.projectKey === project.path) &&
    isIsoDate(project.lastOpenedAt)
  );
}

function isProjectNavigationState(
  value: unknown,
): value is ProjectNavigationState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<ProjectNavigationState>;
  return (
    state.version === 1 &&
    typeof state.projectKey === "string" &&
    state.projectKey.length > 0 &&
    typeof state.selectedDirectory === "string" &&
    isSafeProjectRelativePath(state.selectedDirectory, true) &&
    (state.activeFile === null ||
      (typeof state.activeFile === "string" &&
        isSafeProjectRelativePath(state.activeFile, false))) &&
    Array.isArray(state.expandedDirectories) &&
    state.expandedDirectories.every(
      (path) =>
        typeof path === "string" && isSafeProjectRelativePath(path, false),
    ) &&
    isIsoDate(state.updatedAt)
  );
}

function normalizeAbsolutePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized || "/";
}

function isAbsoluteProjectPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

function pathDepth(path: string): number {
  return path.split("/").length;
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
