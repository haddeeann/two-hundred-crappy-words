export const DAILY_PROGRESS_STORE_FILE = "daily-progress.json";
const DAILY_PROGRESS_PROJECTS_KEY = "projects";

export interface DailyProgressRecord {
  version: 1;
  projectPath: string;
  dateKey: string;
  creditedWords: number;
  updatedAt: string;
  revision: number;
}

export interface DailyProgressBackend {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

export type DailyProgressRecords = Record<string, DailyProgressRecord>;
type StoredProjects = Record<string, DailyProgressRecords>;

export interface DailyProgressContext {
  dateKey: string;
  creditedWords: number;
  revision: number;
}

export function localDateKey(now = new Date()): string {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("Cannot create a local date key from an invalid date.");
  }

  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveDailyProgress(
  records: DailyProgressRecords,
  now = new Date(),
): DailyProgressContext {
  const dateKey = localDateKey(now);
  const record = records[dateKey];
  return {
    dateKey,
    creditedWords: record?.creditedWords ?? 0,
    revision: record?.revision ?? 0,
  };
}

export function createDailyProgressRecord({
  projectPath,
  dateKey,
  creditedWords,
  revision,
  now = new Date(),
}: {
  projectPath: string;
  dateKey: string;
  creditedWords: number;
  revision: number;
  now?: Date;
}): DailyProgressRecord {
  if (!projectPath) throw new RangeError("A project path is required.");
  if (!isDateKey(dateKey)) throw new RangeError("The local date key is invalid.");
  if (!isNonNegativeInteger(creditedWords)) {
    throw new RangeError("Credited words must be a non-negative integer.");
  }
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new RangeError("The ledger revision must be a positive integer.");
  }

  return {
    version: 1,
    projectPath,
    dateKey,
    creditedWords,
    updatedAt: now.toISOString(),
    revision,
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const candidate = new Date(year, month - 1, day);
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  );
}

function isDailyProgressRecord(value: unknown): value is DailyProgressRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<DailyProgressRecord>;
  return (
    record.version === 1 &&
    typeof record.projectPath === "string" &&
    record.projectPath.length > 0 &&
    isDateKey(record.dateKey) &&
    isNonNegativeInteger(record.creditedWords) &&
    typeof record.updatedAt === "string" &&
    !Number.isNaN(Date.parse(record.updatedAt)) &&
    Number.isSafeInteger(record.revision) &&
    (record.revision ?? 0) >= 1
  );
}

export class DailyProgressRepository {
  private readonly backend: DailyProgressBackend;
  private operations: Promise<void> = Promise.resolve();

  constructor(backend: DailyProgressBackend) {
    this.backend = backend;
  }

  async getProject(projectPath: string): Promise<DailyProgressRecords> {
    await this.operations;
    const projects = await this.readProjects();
    return structuredClone(projects[projectPath] ?? {});
  }

  async get(
    projectPath: string,
    dateKey: string,
  ): Promise<DailyProgressRecord | null> {
    return (await this.getProject(projectPath))[dateKey] ?? null;
  }

  put(record: DailyProgressRecord): Promise<void> {
    return this.enqueue(async () => {
      const projects = await this.readProjects();
      const project = projects[record.projectPath] ?? {};
      const existing = project[record.dateKey];
      if (existing && existing.revision > record.revision) return;

      project[record.dateKey] = record;
      projects[record.projectPath] = project;
      await this.backend.set(DAILY_PROGRESS_PROJECTS_KEY, projects);
      await this.backend.save();
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operations.catch(() => {}).then(operation);
    this.operations = next.catch(() => {});
    return next;
  }

  private async readProjects(): Promise<StoredProjects> {
    const stored = await this.backend.get<unknown>(
      DAILY_PROGRESS_PROJECTS_KEY,
    );
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return {};
    }

    const projects: StoredProjects = {};
    for (const [projectPath, value] of Object.entries(stored)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;

      const records = Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, DailyProgressRecord] =>
            isDailyProgressRecord(entry[1]) &&
            entry[0] === entry[1].dateKey &&
            projectPath === entry[1].projectPath,
        ),
      );
      if (Object.keys(records).length > 0) projects[projectPath] = records;
    }
    return projects;
  }
}
