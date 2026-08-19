export type SavePhase = "clean" | "dirty" | "saving" | "error";

export interface SaveState {
  phase: SavePhase;
  currentRevision: number;
  persistedRevision: number;
  inFlightRevision: number | null;
  error: string | null;
}

export function createSaveState(): SaveState {
  return {
    phase: "clean",
    currentRevision: 0,
    persistedRevision: 0,
    inFlightRevision: null,
    error: null,
  };
}

export function hasUnsavedChanges(state: SaveState): boolean {
  return state.currentRevision !== state.persistedRevision;
}

export function markEdited(state: SaveState): SaveState {
  return {
    ...state,
    phase: state.inFlightRevision === null ? "dirty" : "saving",
    currentRevision: state.currentRevision + 1,
    error: null,
  };
}

export function startSave(state: SaveState): SaveState {
  if (!hasUnsavedChanges(state)) return state;

  return {
    ...state,
    phase: "saving",
    inFlightRevision: state.currentRevision,
    error: null,
  };
}

export function saveSucceeded(
  state: SaveState,
  revision: number,
): SaveState {
  if (state.inFlightRevision !== revision) return state;

  const stillDirty = state.currentRevision !== revision;
  return {
    ...state,
    phase: stillDirty ? "dirty" : "clean",
    persistedRevision: revision,
    inFlightRevision: null,
    error: null,
  };
}

export function saveFailed(
  state: SaveState,
  revision: number,
  error: string,
): SaveState {
  if (state.inFlightRevision !== revision) return state;

  return {
    ...state,
    phase: "error",
    inFlightRevision: null,
    error,
  };
}
