import type { DailyPracticeState } from "./word-count";
import { DEFAULT_DAILY_TARGET, validateDailyTarget } from "./daily-goal";

export { DEFAULT_DAILY_TARGET } from "./daily-goal";

export interface PracticePresentation {
  documentLabel: string;
  dailyLabel: string;
  accessibleDailyLabel: string;
  progressValue: number;
}

export function presentPractice(
  state: DailyPracticeState,
  target = DEFAULT_DAILY_TARGET,
): PracticePresentation {
  validateDailyTarget(target);

  const documentUnit = state.documentWords === 1 ? "word" : "words";

  return {
    documentLabel: `${state.documentWords} ${documentUnit}`,
    dailyLabel: `Today · ${state.dailyWords} / ${target}`,
    accessibleDailyLabel: `Today: ${state.dailyWords} of ${target} words`,
    progressValue: Math.min(state.dailyWords, target),
  };
}
