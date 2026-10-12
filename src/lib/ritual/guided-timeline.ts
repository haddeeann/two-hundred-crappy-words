import type { ContinuityCertainty } from "$lib/lore/types";
import type { ContinuityMutationRequest } from "$lib/lore/continuity-mutation";

export const GUIDED_TIMELINE_ANCHOR_KEYS = [
  "story-start",
  "prior-event",
  "deadline",
] as const;

export type GuidedTimelineAnchorKey =
  (typeof GUIDED_TIMELINE_ANCHOR_KEYS)[number];

export interface GuidedTimelineAnchorDefinition {
  key: GuidedTimelineAnchorKey;
  eyebrow: string;
  title: string;
  description: string;
  namePrompt: string;
  summaryPrompt: string;
}

export const GUIDED_TIMELINE_ANCHORS: readonly GuidedTimelineAnchorDefinition[] = [
  {
    key: "story-start",
    eyebrow: "Anchor one",
    title: "Where the story begins",
    description: "The event or situation readers first step into.",
    namePrompt: "What do you call the beginning?",
    summaryPrompt: "What is happening as this story opens?",
  },
  {
    key: "prior-event",
    eyebrow: "Anchor two",
    title: "Something important before",
    description: "A past event whose consequences still shape the story.",
    namePrompt: "What do people call this earlier event?",
    summaryPrompt: "What happened, and why does it still matter?",
  },
  {
    key: "deadline",
    eyebrow: "Anchor three",
    title: "Something approaching",
    description: "A deadline, arrival, danger, ceremony, or promised change.",
    namePrompt: "What is approaching?",
    summaryPrompt: "What will happen, and what pressure does it create?",
  },
] as const;

export type GuidedTimelineDateKind =
  | "exact"
  | "approximate"
  | "fictional";

export interface GuidedTimelineDateDraft {
  kind: GuidedTimelineDateKind;
  calendar: string;
  expression: string;
}

export interface GuidedTimelineAnchorProgress {
  key: GuidedTimelineAnchorKey;
  status: "pending" | "skipped" | "created";
  title: string;
  path: string;
  absolutePath: string;
  noteId: string;
  dateStatus: "pending" | "unknown" | "linked";
}

export interface GuidedTimelinePreviewDisplay {
  anchorKey: GuidedTimelineAnchorKey;
  before: string;
  after: string;
  firstLine: number;
}

export function initialGuidedTimelineAnchors(): GuidedTimelineAnchorProgress[] {
  return GUIDED_TIMELINE_ANCHOR_KEYS.map((key) => ({
    key,
    status: "pending",
    title: "",
    path: "",
    absolutePath: "",
    noteId: "",
    dateStatus: "pending",
  }));
}

export function guidedTimelineDateRequest(
  noteId: string,
  factId: string,
  draft: GuidedTimelineDateDraft,
): ContinuityMutationRequest {
  const calendar = draft.kind === "fictional" ? draft.calendar.trim() : "gregorian";
  const expression = draft.expression.trim();
  if (!calendar) throw new RangeError("Name the fictional calendar before previewing this date.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(calendar) || [...calendar].length > 80) {
    throw new RangeError("A fictional calendar ID must use at most 80 lowercase kebab-case characters.");
  }
  if (!expression) throw new RangeError("Write a date before previewing this change.");
  const certainty: ContinuityCertainty =
    draft.kind === "approximate" ? "approximate" : "exact";
  return {
    operation: "add-fact",
    noteId,
    draft: {
      id: factId,
      property: "occurs-at",
      value: { kind: "time", calendar, expression },
      certainty,
      note: null,
    },
  };
}
