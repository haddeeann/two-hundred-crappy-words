export const RECOVERY_STORE_FILE = "recovery.json";
const RECOVERY_RECORDS_KEY = "records";

export interface RecoveryRecord {
  version: 1;
  path: string;
  content: string;
  baseFingerprint: string;
  updatedAt: string;
  revision: number;
}

export type RecoveryAssessment =
  | { kind: "none" }
  | { kind: "identical"; record: RecoveryRecord }
  | {
      kind: "recoverable";
      record: RecoveryRecord;
      fileChangedSinceRecoveryBegan: boolean;
    };

export interface RecoveryBackend {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  save(): Promise<void>;
}

type RecoveryRecords = Record<string, RecoveryRecord>;

export function fingerprintContent(content: string): string {
  // FNV-1a is used only as a compact change detector, never as a security or
  // integrity guarantee. Exact content equality protects automatic cleanup.
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${content.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createRecoveryRecord({
  path,
  content,
  persistedContent,
  revision,
  now = new Date(),
}: {
  path: string;
  content: string;
  persistedContent: string;
  revision: number;
  now?: Date;
}): RecoveryRecord {
  return {
    version: 1,
    path,
    content,
    baseFingerprint: fingerprintContent(persistedContent),
    updatedAt: now.toISOString(),
    revision,
  };
}

export function assessRecovery(
  record: RecoveryRecord | null,
  fileContent: string,
): RecoveryAssessment {
  if (!record) return { kind: "none" };
  if (record.content === fileContent) return { kind: "identical", record };
  return {
    kind: "recoverable",
    record,
    fileChangedSinceRecoveryBegan:
      record.baseFingerprint !== fingerprintContent(fileContent),
  };
}

export function formatRecoveryPreview(
  fileContent: string,
  recoveryContent: string,
  limit = 320,
): string {
  const excerpt = (value: string) => {
    const normalized = value.trim() || "(empty)";
    return normalized.length <= limit
      ? normalized
      : `${normalized.slice(0, limit).trimEnd()}…`;
  };

  return `FILE ON DISK\n${excerpt(fileContent)}\n\nRECOVERY DRAFT\n${excerpt(recoveryContent)}`;
}

function isRecoveryRecord(value: unknown): value is RecoveryRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RecoveryRecord>;
  return (
    record.version === 1 &&
    typeof record.path === "string" &&
    typeof record.content === "string" &&
    typeof record.baseFingerprint === "string" &&
    typeof record.updatedAt === "string" &&
    typeof record.revision === "number" &&
    Number.isInteger(record.revision) &&
    record.revision >= 1
  );
}

export class RecoveryRepository {
  private readonly backend: RecoveryBackend;
  private operations: Promise<void> = Promise.resolve();

  constructor(backend: RecoveryBackend) {
    this.backend = backend;
  }

  async get(path: string): Promise<RecoveryRecord | null> {
    await this.operations;
    const records = await this.readRecords();
    return records[path] ?? null;
  }

  put(record: RecoveryRecord): Promise<void> {
    return this.enqueue(async () => {
      const records = await this.readRecords();
      const existing = records[record.path];
      if (existing && existing.revision > record.revision) return;

      records[record.path] = record;
      await this.backend.set(RECOVERY_RECORDS_KEY, records);
      await this.backend.save();
    });
  }

  remove(path: string, throughRevision = Number.POSITIVE_INFINITY): Promise<void> {
    return this.enqueue(async () => {
      const records = await this.readRecords();
      const existing = records[path];
      if (!existing || existing.revision > throughRevision) return;

      delete records[path];
      if (Object.keys(records).length === 0) {
        await this.backend.delete(RECOVERY_RECORDS_KEY);
      } else {
        await this.backend.set(RECOVERY_RECORDS_KEY, records);
      }
      await this.backend.save();
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operations.catch(() => {}).then(operation);
    this.operations = next.catch(() => {});
    return next;
  }

  private async readRecords(): Promise<RecoveryRecords> {
    const stored = await this.backend.get<unknown>(RECOVERY_RECORDS_KEY);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(stored).filter(
        (entry): entry is [string, RecoveryRecord] =>
          isRecoveryRecord(entry[1]) && entry[0] === entry[1].path,
      ),
    );
  }
}
