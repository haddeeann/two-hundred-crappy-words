export type SaveFailureDecision = "retry" | "discard" | "cancel";

interface ResolvePendingChangesOptions {
  hasUnsavedChanges: () => boolean;
  save: () => Promise<void>;
  chooseAfterFailure: () => Promise<SaveFailureDecision>;
  discard?: () => Promise<void>;
}

export async function resolvePendingChanges({
  hasUnsavedChanges,
  save,
  chooseAfterFailure,
  discard,
}: ResolvePendingChangesOptions): Promise<boolean> {
  while (hasUnsavedChanges()) {
    await save();
    if (!hasUnsavedChanges()) return true;

    const decision = await chooseAfterFailure();
    if (decision === "discard") {
      await discard?.();
      return true;
    }
    if (decision === "cancel") return false;
  }

  return true;
}
