import { DEFAULT_DAILY_TARGET } from "./daily-goal";
import type { DailyProgressRecords } from "./daily-ledger";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WritingHistoryEntry {
  dateKey: string;
  creditedWords: number;
  target: number;
  completed: boolean;
  correctionCount: number;
}

export interface StreakSummary {
  current: number;
  best: number;
  completedDays: number;
}

function dateOrdinal(dateKey: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new RangeError(`Invalid local date key: ${dateKey}`);
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    throw new RangeError(`Invalid local date key: ${dateKey}`);
  }
  const timestamp = Date.UTC(year, month - 1, day);
  const candidate = new Date(timestamp);
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid local date key: ${dateKey}`);
  }
  return timestamp / DAY_MS;
}

export function createWritingHistory(
  records: DailyProgressRecords,
): WritingHistoryEntry[] {
  return Object.values(records)
    .map((record) => ({
      dateKey: record.dateKey,
      creditedWords: record.creditedWords,
      target: record.target ?? DEFAULT_DAILY_TARGET,
      completed: Boolean(record.completedAt),
      correctionCount: record.corrections?.length ?? 0,
    }))
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey));
}

export function summarizeStreaks(
  records: DailyProgressRecords,
  todayKey: string,
): StreakSummary {
  const today = dateOrdinal(todayKey);
  const completed = Array.from(
    new Set(
      Object.values(records)
        .filter((record) => Boolean(record.completedAt))
        .map((record) => dateOrdinal(record.dateKey)),
    ),
  ).sort((left, right) => left - right);

  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of completed) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }

  const completedSet = new Set(completed);
  const endpoint = completedSet.has(today)
    ? today
    : completedSet.has(today - 1)
      ? today - 1
      : null;
  let current = 0;
  if (endpoint !== null) {
    for (let day = endpoint; completedSet.has(day); day -= 1) current += 1;
  }

  return { current, best, completedDays: completed.length };
}

export function formatStreakSummary(summary: StreakSummary): string {
  if (summary.current > 1) {
    return `${summary.current}-day rhythm · Best ${summary.best}`;
  }
  if (summary.current === 1) {
    return summary.best > 1
      ? `One day underway · Best ${summary.best}`
      : "One day underway";
  }
  return summary.best > 0
    ? `A fresh start today · Best ${summary.best}`
    : "A fresh start today";
}
