export const DEFAULT_DAILY_TARGET = 200;
export const MIN_DAILY_TARGET = 1;
export const MAX_DAILY_TARGET = 100_000;
const DAILY_TARGETS_KEY = "targets";

export interface DailyGoalBackend {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

export interface GoalCompletionState {
  completedAt: string | null;
  shouldAnnounce: boolean;
}

export function validateDailyTarget(target: number): number {
  if (
    !Number.isSafeInteger(target) ||
    target < MIN_DAILY_TARGET ||
    target > MAX_DAILY_TARGET
  ) {
    throw new RangeError(
      `The daily goal must be a whole number from ${MIN_DAILY_TARGET} to ${MAX_DAILY_TARGET}.`,
    );
  }
  return target;
}

export function parseDailyTarget(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const target = Number(trimmed);
  try {
    return validateDailyTarget(target);
  } catch {
    return null;
  }
}

/**
 * Return a one-way completion transition. Once completedAt exists, changing
 * the goal or revisiting the date never announces completion a second time.
 */
export function assessGoalCompletion({
  dailyWords,
  target,
  completedAt,
  now = new Date(),
}: {
  dailyWords: number;
  target: number;
  completedAt: string | null;
  now?: Date;
}): GoalCompletionState {
  validateDailyTarget(target);
  if (!Number.isSafeInteger(dailyWords) || dailyWords < 0) {
    throw new RangeError("Daily words must be a non-negative integer.");
  }
  if (completedAt) return { completedAt, shouldAnnounce: false };
  if (dailyWords < target) return { completedAt: null, shouldAnnounce: false };

  return {
    completedAt: now.toISOString(),
    shouldAnnounce: true,
  };
}

export class DailyGoalRepository {
  private readonly backend: DailyGoalBackend;
  private operations: Promise<void> = Promise.resolve();

  constructor(backend: DailyGoalBackend) {
    this.backend = backend;
  }

  async get(projectPath: string): Promise<number> {
    await this.operations;
    const targets = await this.readTargets();
    return targets[projectPath] ?? DEFAULT_DAILY_TARGET;
  }

  set(projectPath: string, target: number): Promise<void> {
    validateDailyTarget(target);
    if (!projectPath) {
      return Promise.reject(new RangeError("A project path is required."));
    }

    return this.enqueue(async () => {
      const targets = await this.readTargets();
      targets[projectPath] = target;
      await this.backend.set(DAILY_TARGETS_KEY, targets);
      await this.backend.save();
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operations.catch(() => {}).then(operation);
    this.operations = next.catch(() => {});
    return next;
  }

  private async readTargets(): Promise<Record<string, number>> {
    const stored = await this.backend.get<unknown>(DAILY_TARGETS_KEY);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(stored).filter(
        (entry): entry is [string, number] =>
          entry[0].length > 0 &&
          Number.isSafeInteger(entry[1]) &&
          (entry[1] as number) >= MIN_DAILY_TARGET &&
          (entry[1] as number) <= MAX_DAILY_TARGET,
      ),
    );
  }
}
