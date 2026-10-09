import { describe, expect, it } from "vitest";
import { shouldShowGettingStarted } from "./state";

describe("Getting Started visibility", () => {
  it("waits for project restoration before showing automatically", () => {
    expect(
      shouldShowGettingStarted({
        startupComplete: false,
        hasProject: false,
        explicitlyOpen: false,
        dismissedForSession: false,
      }),
    ).toBe(false);
  });

  it("shows automatically when startup finishes without a project", () => {
    expect(
      shouldShowGettingStarted({
        startupComplete: true,
        hasProject: false,
        explicitlyOpen: false,
        dismissedForSession: false,
      }),
    ).toBe(true);
  });

  it("does not interrupt a restored project", () => {
    expect(
      shouldShowGettingStarted({
        startupComplete: true,
        hasProject: true,
        explicitlyOpen: false,
        dismissedForSession: false,
      }),
    ).toBe(false);
  });

  it("stays dismissed only for the current session", () => {
    expect(
      shouldShowGettingStarted({
        startupComplete: true,
        hasProject: false,
        explicitlyOpen: false,
        dismissedForSession: true,
      }),
    ).toBe(false);
  });

  it("can always be reopened explicitly", () => {
    expect(
      shouldShowGettingStarted({
        startupComplete: true,
        hasProject: true,
        explicitlyOpen: true,
        dismissedForSession: true,
      }),
    ).toBe(true);
  });
});
