export type WritingLayoutMode = "standard" | "focus";

export interface WritingLayoutState {
  mode: WritingLayoutMode;
}

export type WritingLayoutEvent =
  | { kind: "enter-focus"; hasActiveDraft: boolean; corkboardOpen: boolean }
  | { kind: "exit-focus" }
  | { kind: "project-replaced" };

export function initialWritingLayout(): WritingLayoutState {
  return { mode: "standard" };
}

export function transitionWritingLayout(
  state: WritingLayoutState,
  event: WritingLayoutEvent,
): WritingLayoutState {
  if (event.kind === "enter-focus") {
    return event.hasActiveDraft && !event.corkboardOpen
      ? { mode: "focus" }
      : state;
  }
  return { mode: "standard" };
}
