import { describe, expect, it } from "vitest";
import {
  createSaveState,
  hasUnsavedChanges,
  markEdited,
  saveFailed,
  saveSucceeded,
  startSave,
} from "./save-state";

describe("save state", () => {
  it("starts clean", () => {
    const state = createSaveState();

    expect(state.phase).toBe("clean");
    expect(hasUnsavedChanges(state)).toBe(false);
  });

  it("becomes dirty after an edit", () => {
    const state = markEdited(createSaveState());

    expect(state.phase).toBe("dirty");
    expect(state.currentRevision).toBe(1);
    expect(hasUnsavedChanges(state)).toBe(true);
  });

  it("becomes clean when the current revision is saved", () => {
    const dirty = markEdited(createSaveState());
    const saving = startSave(dirty);
    const saved = saveSucceeded(saving, 1);

    expect(saved.phase).toBe("clean");
    expect(saved.persistedRevision).toBe(1);
    expect(hasUnsavedChanges(saved)).toBe(false);
  });

  it("stays dirty when an edit happens during a save", () => {
    const firstEdit = markEdited(createSaveState());
    const saving = startSave(firstEdit);
    const secondEdit = markEdited(saving);
    const firstSaveCompleted = saveSucceeded(secondEdit, 1);

    expect(firstSaveCompleted.phase).toBe("dirty");
    expect(firstSaveCompleted.persistedRevision).toBe(1);
    expect(firstSaveCompleted.currentRevision).toBe(2);
    expect(hasUnsavedChanges(firstSaveCompleted)).toBe(true);
  });

  it("can mark an earlier queued revision as saving", () => {
    const firstEdit = markEdited(createSaveState());
    const secondEdit = markEdited(firstEdit);
    const savingFirst = startSave(secondEdit, 1);

    expect(savingFirst.phase).toBe("saving");
    expect(savingFirst.inFlightRevision).toBe(1);
    expect(savingFirst.currentRevision).toBe(2);
  });

  it("retains unsaved state and the error after a failed save", () => {
    const saving = startSave(markEdited(createSaveState()));
    const failed = saveFailed(saving, 1, "Disk is full");

    expect(failed.phase).toBe("error");
    expect(failed.error).toBe("Disk is full");
    expect(hasUnsavedChanges(failed)).toBe(true);
  });

  it("ignores a stale save completion", () => {
    const firstSave = startSave(markEdited(createSaveState()));
    const secondSave = startSave(markEdited(firstSave));
    const staleCompletion = saveSucceeded(secondSave, 1);

    expect(staleCompletion).toEqual(secondSave);
    expect(staleCompletion.inFlightRevision).toBe(2);
  });
});
