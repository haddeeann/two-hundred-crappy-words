import { describe, expect, it } from "vitest";

import { correctDailyProgressRecord } from "./correction";
import { assessGoalCompletion } from "./daily-goal";
import { createDailyProgressRecord, resolveDailyProgress } from "./daily-ledger";
import { createWritingHistory } from "./history";
import { applyDailyPracticeEdit, beginDailyPractice } from "./word-count";

describe("daily practice lifecycle", () => {
  it("keeps credit, completion, history, goal changes, restart, and correction coherent", () => {
    const dateKey = "2026-08-21";
    const baseline = "Existing words are only a baseline.\n";
    const fiveWordEdit = `${baseline}Persistence crosses the silent dark.`;
    let practice = beginDailyPractice(baseline);

    practice = applyDailyPracticeEdit(practice, fiveWordEdit);
    expect(practice.dailyWords).toBe(5);

    const completion = assessGoalCompletion({
      dailyWords: practice.dailyWords,
      target: 5,
      completedAt: null,
      now: new Date("2026-08-21T12:00:00.000Z"),
    });
    expect(completion.shouldAnnounce).toBe(true);

    const completedRecord = createDailyProgressRecord({
      projectPath: "/world/andromeda",
      dateKey,
      creditedWords: practice.dailyWords,
      revision: 1,
      completedAt: completion.completedAt,
      completedTarget: 5,
      target: 5,
    });
    const raisedGoalRecord = createDailyProgressRecord({
      ...completedRecord,
      revision: 2,
      completedTarget: 5,
      target: 8,
    });

    expect(createWritingHistory({ [dateKey]: raisedGoalRecord })[0]).toMatchObject({
      creditedWords: 5,
      target: 5,
      completed: true,
    });
    expect(
      assessGoalCompletion({
        dailyWords: 5,
        target: 8,
        completedAt: raisedGoalRecord.completedAt ?? null,
      }).shouldAnnounce,
    ).toBe(false);

    const restored = resolveDailyProgress(
      { [dateKey]: raisedGoalRecord },
      new Date(2026, 7, 21, 13),
    );
    practice = beginDailyPractice(fiveWordEdit, restored.creditedWords);
    expect(practice.dailyWords).toBe(5);

    const corrected = correctDailyProgressRecord(raisedGoalRecord, 3);
    expect(corrected).toMatchObject({
      creditedWords: 3,
      completedAt: null,
      completedTarget: null,
    });

    practice = beginDailyPractice(fiveWordEdit, corrected.creditedWords);
    practice = applyDailyPracticeEdit(practice, `${fiveWordEdit} Still listening.`);
    expect(practice.dailyWords).toBe(5);
    const correctedCompletion = assessGoalCompletion({
      dailyWords: practice.dailyWords,
      target: 5,
      completedAt: corrected.completedAt ?? null,
    });
    expect(correctedCompletion.shouldAnnounce).toBe(true);

    const completedAfterCorrection = createDailyProgressRecord({
      ...corrected,
      creditedWords: practice.dailyWords,
      revision: corrected.revision + 1,
      completedAt: correctedCompletion.completedAt,
      completedTarget: 5,
      target: 5,
    });
    expect(createWritingHistory({ [dateKey]: completedAfterCorrection })[0])
      .toMatchObject({
        creditedWords: 5,
        completed: true,
        correctionCount: 1,
      });
  });
});
