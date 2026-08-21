import type { DailyPracticeState } from "./word-count";

export const DEFAULT_DAILY_TARGET = 200;

export interface PracticePresentation {
  documentLabel: string;
  sessionLabel: string;
  accessibleSessionLabel: string;
  progressValue: number;
}

export function presentPractice(
  state: DailyPracticeState,
  target = DEFAULT_DAILY_TARGET,
): PracticePresentation {
  if (!Number.isSafeInteger(target) || target < 1) {
    throw new RangeError("The writing target must be a positive integer.");
  }

  const documentUnit = state.documentWords === 1 ? "word" : "words";

  return {
    documentLabel: `${state.documentWords} ${documentUnit}`,
    sessionLabel: `This session · ${state.dailyWords} / ${target}`,
    accessibleSessionLabel: `This session: ${state.dailyWords} of ${target} words`,
    progressValue: Math.min(state.dailyWords, target),
  };
}
