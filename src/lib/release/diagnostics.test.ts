import { describe, expect, it } from "vitest";
import {
  createDiagnosticSnapshot,
  serializeDiagnosticSnapshot,
} from "./diagnostics";

describe("content-free diagnostics", () => {
  it("allowlists coarse application and session state only", () => {
    const serialized = serializeDiagnosticSnapshot(createDiagnosticSnapshot({
      generatedAt: new Date("2026-10-12T21:00:00.000Z"),
      appVersion: "0.8.0",
      tauriVersion: "2.8.5",
      projectState: "world-project",
      activeSurface: "editor",
      documentState: "unsaved",
      loreIndexState: "ready",
      manuscriptState: "ready",
      timelineState: "absent",
      mapsState: "unavailable",
    }));

    expect(JSON.parse(serialized)).toEqual({
      format: "ministry-of-elsewhere/diagnostics",
      formatVersion: 1,
      generatedAt: "2026-10-12T21:00:00.000Z",
      application: {
        name: "Ministry of Elsewhere",
        version: "0.8.0",
        tauriVersion: "2.8.5",
      },
      session: {
        projectState: "world-project",
        activeSurface: "editor",
        documentState: "unsaved",
        loreIndexState: "ready",
        manuscriptState: "ready",
        timelineState: "absent",
        mapsState: "unavailable",
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
    });
    expect(serialized).not.toMatch(/\/Users\/|projectId|creditedWords|recovery.json/);
  });

  it("refuses malformed version strings and invalid timestamps", () => {
    const base = {
      generatedAt: new Date("2026-10-12T21:00:00.000Z"),
      appVersion: "0.8.0",
      tauriVersion: "2.8.5",
      projectState: "none" as const,
      activeSurface: "help" as const,
      documentState: "none" as const,
      loreIndexState: "idle" as const,
      manuscriptState: "absent" as const,
      timelineState: "absent" as const,
      mapsState: "absent" as const,
    };
    expect(() => createDiagnosticSnapshot({ ...base, appVersion: "bad\npath" })).toThrow();
    expect(() => createDiagnosticSnapshot({ ...base, generatedAt: new Date("bad") })).toThrow();
  });
});
