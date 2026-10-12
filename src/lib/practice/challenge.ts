import type { DailyProgressRecords } from "./daily-ledger";

export const MAX_CHALLENGE_NAME_LENGTH = 80;
export const MAX_CHALLENGE_TARGET = 10_000_000;
const CHALLENGES_KEY = "challenges";

export interface WritingChallenge {
  version: 1;
  id: string;
  name: string;
  target: number;
  validFrom: string;
  validTo: string;
  createdAt: string;
  updatedAt: string;
}

export interface WritingChallengeDraft {
  name: string;
  target: number;
  validFrom: string;
  validTo: string;
}

export interface WritingChallengeProgress {
  creditedWords: number;
  participatedDays: number;
  availableDays: number;
  status: "upcoming" | "active" | "complete" | "ended";
}

export interface WritingChallengeBackend {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

export function createWritingChallenge(
  draft: WritingChallengeDraft,
  existing?: WritingChallenge | null,
  now = new Date(),
  id: string = crypto.randomUUID(),
): WritingChallenge {
  validateWritingChallengeDraft(draft);
  const timestamp = now.toISOString();
  return {
    version: 1,
    id: existing?.id ?? id,
    name: draft.name.trim(),
    target: draft.target,
    validFrom: draft.validFrom,
    validTo: draft.validTo,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function validateWritingChallengeDraft(
  draft: WritingChallengeDraft,
): void {
  const name = draft.name.trim();
  if (!name || name.length > MAX_CHALLENGE_NAME_LENGTH) {
    throw new RangeError(
      `Challenge name must be between 1 and ${MAX_CHALLENGE_NAME_LENGTH} characters.`,
    );
  }
  if (
    !Number.isSafeInteger(draft.target) ||
    draft.target < 1 ||
    draft.target > MAX_CHALLENGE_TARGET
  ) {
    throw new RangeError(
      `Challenge target must be a whole number from 1 to ${MAX_CHALLENGE_TARGET}.`,
    );
  }
  dateOrdinal(draft.validFrom);
  dateOrdinal(draft.validTo);
  if (draft.validFrom > draft.validTo) {
    throw new RangeError("The final day cannot be before the first day.");
  }
}

export function writingChallengeProgress(
  challenge: WritingChallenge,
  records: DailyProgressRecords,
  todayKey: string,
): WritingChallengeProgress {
  validateWritingChallengeDraft(challenge);
  dateOrdinal(todayKey);
  let creditedWords = 0;
  let participatedDays = 0;
  for (const record of Object.values(records)) {
    if (
      record.dateKey >= challenge.validFrom &&
      record.dateKey <= challenge.validTo
    ) {
      creditedWords += record.creditedWords;
      if (record.creditedWords > 0) participatedDays += 1;
    }
  }

  const availableDays =
    dateOrdinal(challenge.validTo) - dateOrdinal(challenge.validFrom) + 1;
  const status =
    creditedWords >= challenge.target
      ? "complete"
      : todayKey < challenge.validFrom
        ? "upcoming"
        : todayKey > challenge.validTo
          ? "ended"
          : "active";
  return { creditedWords, participatedDays, availableDays, status };
}

export function challengeDefaultDates(now = new Date()): {
  validFrom: string;
  validTo: string;
} {
  if (Number.isNaN(now.getTime())) throw new RangeError("Invalid current date.");
  const year = now.getFullYear();
  const month = now.getMonth();
  return {
    validFrom: localDateKey(now),
    validTo: localDateKey(new Date(year, month + 1, 0, 12)),
  };
}

export class WritingChallengeRepository {
  private operations: Promise<void> = Promise.resolve();

  constructor(private readonly backend: WritingChallengeBackend) {}

  async get(projectPath: string): Promise<WritingChallenge | null> {
    await this.operations;
    const challenges = await this.readChallenges();
    return structuredClone(challenges[projectPath] ?? null);
  }

  set(projectPath: string, challenge: WritingChallenge): Promise<void> {
    if (!projectPath) {
      return Promise.reject(new RangeError("A project path is required."));
    }
    if (!isWritingChallenge(challenge)) {
      return Promise.reject(new RangeError("The writing challenge is invalid."));
    }
    return this.enqueue(async () => {
      const challenges = await this.readChallenges();
      challenges[projectPath] = structuredClone(challenge);
      await this.backend.set(CHALLENGES_KEY, challenges);
      await this.backend.save();
    });
  }

  clear(projectPath: string): Promise<boolean> {
    if (!projectPath) {
      return Promise.reject(new RangeError("A project path is required."));
    }
    return this.enqueue(async () => {
      const challenges = await this.readChallenges();
      if (!challenges[projectPath]) return false;
      delete challenges[projectPath];
      await this.backend.set(CHALLENGES_KEY, challenges);
      await this.backend.save();
      return true;
    });
  }

  copyProject(sourceKey: string, targetKey: string): Promise<boolean> {
    if (!sourceKey || !targetKey || sourceKey === targetKey) {
      return Promise.reject(
        new RangeError("Distinct source and target project keys are required."),
      );
    }
    return this.enqueue(async () => {
      const challenges = await this.readChallenges();
      if (challenges[targetKey] || !challenges[sourceKey]) return false;
      challenges[targetKey] = structuredClone(challenges[sourceKey]);
      await this.backend.set(CHALLENGES_KEY, challenges);
      await this.backend.save();
      return true;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operations.catch(() => {}).then(operation);
    this.operations = next.then(
      () => {},
      () => {},
    );
    return next;
  }

  private async readChallenges(): Promise<Record<string, WritingChallenge>> {
    const stored = await this.backend.get<unknown>(CHALLENGES_KEY);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored).filter(
        (entry): entry is [string, WritingChallenge] =>
          entry[0].length > 0 && isWritingChallenge(entry[1]),
      ),
    );
  }
}

function isWritingChallenge(value: unknown): value is WritingChallenge {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WritingChallenge>;
  try {
    if (
      candidate.version !== 1 ||
      typeof candidate.id !== "string" ||
      !candidate.id ||
      typeof candidate.name !== "string" ||
      typeof candidate.target !== "number" ||
      typeof candidate.validFrom !== "string" ||
      typeof candidate.validTo !== "string" ||
      typeof candidate.createdAt !== "string" ||
      typeof candidate.updatedAt !== "string" ||
      Number.isNaN(Date.parse(candidate.createdAt)) ||
      Number.isNaN(Date.parse(candidate.updatedAt))
    ) return false;
    validateWritingChallengeDraft(candidate as WritingChallengeDraft);
    return true;
  } catch {
    return false;
  }
}

function localDateKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateOrdinal(dateKey: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new RangeError("Challenge dates must be real calendar dates.");
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const candidate = new Date(timestamp);
  if (
    year < 1 ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new RangeError("Challenge dates must be real calendar dates.");
  }
  return timestamp / 86_400_000;
}
