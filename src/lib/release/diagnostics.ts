export const DIAGNOSTIC_FORMAT = "ministry-of-elsewhere/diagnostics";

export interface DiagnosticSnapshotInput {
  generatedAt: Date;
  appVersion: string;
  tauriVersion: string;
  projectState: "none" | "ordinary" | "world-project" | "manifest-problem";
  activeSurface:
    | "help"
    | "home"
    | "close-desk"
    | "editor"
    | "timeline"
    | "maps"
    | "continuity-review";
  documentState: "none" | "saved" | "unsaved" | "saving" | "save-error";
  loreIndexState: "idle" | "indexing" | "ready" | "stale" | "error";
  manuscriptState: "absent" | "ready" | "unavailable";
  timelineState: "absent" | "ready" | "unavailable";
  mapsState: "absent" | "ready" | "unavailable";
}

export interface DiagnosticSnapshot {
  format: typeof DIAGNOSTIC_FORMAT;
  formatVersion: 1;
  generatedAt: string;
  application: {
    name: "Ministry of Elsewhere";
    version: string;
    tauriVersion: string;
  };
  session: Omit<DiagnosticSnapshotInput, "generatedAt" | "appVersion" | "tauriVersion">;
  privacy: {
    creativeTextIncluded: false;
    fileNamesIncluded: false;
    pathsIncluded: false;
    projectNamesOrIdsIncluded: false;
    practiceTotalsIncluded: false;
    recoveryTextIncluded: false;
    permissionScopesIncluded: false;
    logsIncluded: false;
    uploadedAutomatically: false;
  };
}

export function createDiagnosticSnapshot(
  input: DiagnosticSnapshotInput,
): DiagnosticSnapshot {
  if (Number.isNaN(input.generatedAt.getTime())) {
    throw new RangeError("A valid diagnostic generation time is required.");
  }
  if (!safeVersion(input.appVersion) || !safeVersion(input.tauriVersion)) {
    throw new RangeError("Diagnostic versions must be short printable values.");
  }
  return {
    format: DIAGNOSTIC_FORMAT,
    formatVersion: 1,
    generatedAt: input.generatedAt.toISOString(),
    application: {
      name: "Ministry of Elsewhere",
      version: input.appVersion,
      tauriVersion: input.tauriVersion,
    },
    session: {
      projectState: input.projectState,
      activeSurface: input.activeSurface,
      documentState: input.documentState,
      loreIndexState: input.loreIndexState,
      manuscriptState: input.manuscriptState,
      timelineState: input.timelineState,
      mapsState: input.mapsState,
    },
    privacy: {
      creativeTextIncluded: false,
      fileNamesIncluded: false,
      pathsIncluded: false,
      projectNamesOrIdsIncluded: false,
      practiceTotalsIncluded: false,
      recoveryTextIncluded: false,
      permissionScopesIncluded: false,
      logsIncluded: false,
      uploadedAutomatically: false,
    },
  };
}

export function serializeDiagnosticSnapshot(snapshot: DiagnosticSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function safeVersion(value: string): boolean {
  return value.length > 0 && value.length <= 80 && !/[\u0000-\u001f\u007f]/.test(value);
}
