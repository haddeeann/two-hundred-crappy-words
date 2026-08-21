import { DEFAULT_DAILY_TARGET } from "./daily-goal";
import type {
  DailyProgressCorrection,
  DailyProgressRecord,
} from "./daily-ledger";

export function parseCorrectedWords(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const words = Number(trimmed);
  return Number.isSafeInteger(words) ? words : null;
}

export function correctDailyProgressRecord(
  record: DailyProgressRecord,
  correctedWords: number,
  now = new Date(),
): DailyProgressRecord {
  if (!Number.isSafeInteger(correctedWords) || correctedWords < 0) {
    throw new RangeError("The corrected total must be a non-negative integer.");
  }
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("The correction time is invalid.");
  }
  if (record.revision >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("The progress record cannot be revised further.");
  }
  if (record.creditedWords === correctedWords) return record;

  const correctedAt = now.toISOString();
  const correction: DailyProgressCorrection = {
    previousWords: record.creditedWords,
    correctedWords,
    correctedAt,
  };
  const target = record.target ?? DEFAULT_DAILY_TARGET;
  const wasCompleted = Boolean(record.completedAt);
  const originalCompletedTarget = wasCompleted
    ? (record.completedTarget ?? record.target ?? DEFAULT_DAILY_TARGET)
    : null;
  const qualifyingTarget =
    originalCompletedTarget === null
      ? target
      : Math.min(originalCompletedTarget, target);
  const isCompleted = correctedWords >= qualifyingTarget;

  return {
    ...record,
    creditedWords: correctedWords,
    updatedAt: correctedAt,
    revision: record.revision + 1,
    completedAt: isCompleted ? (record.completedAt ?? correctedAt) : null,
    completedTarget: isCompleted
      ? originalCompletedTarget !== null && correctedWords >= originalCompletedTarget
        ? originalCompletedTarget
        : target
      : null,
    corrections: [...(record.corrections ?? []), correction],
  };
}
