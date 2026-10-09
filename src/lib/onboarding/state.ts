export interface GettingStartedState {
  startupComplete: boolean;
  hasProject: boolean;
  explicitlyOpen: boolean;
  dismissedForSession: boolean;
}

export function shouldShowGettingStarted({
  startupComplete,
  hasProject,
  explicitlyOpen,
  dismissedForSession,
}: GettingStartedState): boolean {
  return (
    explicitlyOpen ||
    (startupComplete && !hasProject && !dismissedForSession)
  );
}
