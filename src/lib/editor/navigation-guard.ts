export type SaveFailureDecision = "retry" | "discard" | "cancel";

interface ResolvePendingChangesOptions {
  hasUnsavedChanges: () => boolean;
  save: () => Promise<void>;
  chooseAfterFailure: () => Promise<SaveFailureDecision>;
}

export async function resolvePendingChanges({
  hasUnsavedChanges,
  save,
  chooseAfterFailure,
}: ResolvePendingChangesOptions): Promise<boolean> {
  while (hasUnsavedChanges()) {
    await save();
    if (!hasUnsavedChanges()) return true;

    const decision = await chooseAfterFailure();
    if (decision === "discard") return true;
    if (decision === "cancel") return false;
  }

  return true;
}
