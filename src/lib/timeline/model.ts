import type {
  CanonStatus,
  ContinuityCertainty,
  LoreDocumentRecord,
  LoreProjectIndex,
  ParsedContinuityFact,
  SourceRange,
} from "$lib/lore/types";
import type {
  ManuscriptChapter,
  ManuscriptOutlineItem,
  ManuscriptOutlineMetadata,
  ManuscriptSourceBinding,
  ManuscriptStructure,
} from "$lib/manuscript/structure";
import type { TimelineProject, TimelineTrack } from "./format";
import {
  compareTimelineRanges,
  normalizeTimelineExpression,
  type TimelineRange,
} from "./normalize";

export type TimelineSubjectType = "event" | "scene" | "chapter";

export interface TimelineFactEvidence {
  id: string;
  property: "occurs-at" | "ends-at";
  calendar: string | null;
  expression: string | null;
  certainty: ContinuityCertainty | null;
  effectiveCanon: CanonStatus | null;
  range: SourceRange;
}

export interface TimelineSubjectIssue {
  code:
    | "missing-occurrence"
    | "invalid-fact-shape"
    | "duplicate-fact-id"
    | "multiple-occurrences"
    | "multiple-ends"
    | "end-without-occurrence"
    | "interval-with-end"
    | "different-calendars"
    | "non-computable-time"
    | "reversed-span";
  message: string;
  factIds: string[];
  ranges: SourceRange[];
}

export interface TimelineNarrativePosition {
  manuscriptId: string;
  manuscriptTitle: string;
  itemId: string;
  itemTitle: string;
  itemKind: "scene" | "chapter";
  binding: "source" | "overview";
  order: number[];
  storyDate: string | null;
}

export interface TimelineSourceDiagnostic {
  message: string;
  range: SourceRange;
}

export interface TimelineSubject {
  noteId: string;
  path: string;
  title: string;
  noteType: TimelineSubjectType;
  noteCanon: CanonStatus | null;
  status: "computable" | "needs-time";
  range: TimelineRange | null;
  evidence: TimelineFactEvidence[];
  issues: TimelineSubjectIssue[];
  sourceDiagnostics: TimelineSourceDiagnostic[];
  trackIds: string[];
  narrative: TimelineNarrativePosition[];
}

export interface TimelineExcludedSource {
  path: string;
  title: string;
  noteId: string | null;
  noteType: TimelineSubjectType;
  reason: string;
}

export interface TimelineTrackMembershipIssue {
  noteId: string;
  message: string;
}

export interface TimelineTrackModel {
  id: string;
  title: string;
  color: string | null;
  subjectIds: string[];
  issues: TimelineTrackMembershipIssue[];
}

export interface TimelineCalendarGroup {
  axis: TimelineRange["axis"];
  subjectIds: string[];
}

export interface TimelineModel {
  subjects: TimelineSubject[];
  excludedSources: TimelineExcludedSource[];
  tracks: TimelineTrackModel[];
  unassignedSubjectIds: string[];
  calendarGroups: TimelineCalendarGroup[];
  needsTimeSubjectIds: string[];
}

interface CandidateFact {
  fact: ParsedContinuityFact;
  evidence: TimelineFactEvidence;
}

const SUBJECT_TYPES = new Set<TimelineSubjectType>(["event", "scene", "chapter"]);

export function deriveTimelineModel(
  index: LoreProjectIndex,
  timeline: TimelineProject | null,
  manuscript: ManuscriptStructure | null,
): TimelineModel {
  const duplicateNoteIds = new Set(
    index.issues
      .filter(({ kind }) => kind === "duplicate-note-id")
      .map(({ id }) => id),
  );
  const duplicateFactIds = new Set(
    index.issues
      .filter(({ kind }) => kind === "duplicate-continuity-fact-id")
      .map(({ id }) => id),
  );
  const narrative = narrativePositions(manuscript);
  const excludedSources: TimelineExcludedSource[] = [];
  const subjects: TimelineSubject[] = [];

  for (const document of [...index.documents.values()].sort(compareDocuments)) {
    if (!isTimelineSubjectType(document.type)) continue;
    if (!document.id) {
      excludedSources.push({
        path: document.path,
        title: document.title,
        noteId: null,
        noteType: document.type,
        reason: "This timeline note has no stable note ID.",
      });
      continue;
    }
    if (duplicateNoteIds.has(document.id)) {
      excludedSources.push({
        path: document.path,
        title: document.title,
        noteId: document.id,
        noteType: document.type,
        reason: "This stable note ID appears in more than one file.",
      });
      continue;
    }
    subjects.push(
      deriveSubject(
        document,
        duplicateFactIds,
        timeline?.calendars ?? [],
        narrative.get(document.id) ?? [],
      ),
    );
  }

  const subjectById = new Map(subjects.map((subject) => [subject.noteId, subject]));
  const documentIds = countDocumentIds(index);
  const tracks = (timeline?.tracks ?? []).map((track) =>
    resolveTrack(track, subjectById, documentIds, duplicateNoteIds),
  );
  for (const track of tracks) {
    for (const subjectId of track.subjectIds) {
      subjectById.get(subjectId)!.trackIds.push(track.id);
    }
  }

  const unassignedSubjectIds = subjects
    .filter(({ trackIds }) => trackIds.length === 0)
    .sort(compareSubjectsWithoutTime)
    .map(({ noteId }) => noteId);
  const needsTimeSubjectIds = subjects
    .filter(({ status }) => status === "needs-time")
    .sort(compareSubjectsWithoutTime)
    .map(({ noteId }) => noteId);
  const calendarGroups = buildCalendarGroups(subjects);

  return {
    subjects,
    excludedSources,
    tracks,
    unassignedSubjectIds,
    calendarGroups,
    needsTimeSubjectIds,
  };
}

function deriveSubject(
  document: LoreDocumentRecord,
  duplicateFactIds: ReadonlySet<string>,
  calendars: TimelineProject["calendars"],
  narrative: TimelineNarrativePosition[],
): TimelineSubject {
  const relevant = document.facts.filter(
    ({ property }) => property === "occurs-at" || property === "ends-at",
  );
  const evidence = relevant.map((fact) => factEvidence(fact, document.canon));
  const issues: TimelineSubjectIssue[] = [];
  const candidates: CandidateFact[] = [];

  for (let index = 0; index < relevant.length; index += 1) {
    const fact = relevant[index]!;
    const itemEvidence = evidence[index]!;
    if (duplicateFactIds.has(fact.id)) {
      issues.push(issue(
        "duplicate-fact-id",
        "This fact ID appears in more than one note and is unavailable for timeline calculations.",
        [itemEvidence],
      ));
      continue;
    }
    if (fact.value.kind !== "time" || fact.validFrom || fact.validTo) {
      issues.push(issue(
        "invalid-fact-shape",
        `${fact.property} must contain one time value without validity bounds.`,
        [itemEvidence],
      ));
      continue;
    }
    candidates.push({ fact, evidence: itemEvidence });
  }

  const occurs = candidates.filter(({ fact }) => fact.property === "occurs-at");
  const ends = candidates.filter(({ fact }) => fact.property === "ends-at");
  let computedRange: TimelineRange | null = null;

  if (relevant.length === 0) {
    issues.push(issue(
      "missing-occurrence",
      "This timeline note has no occurs-at fact yet.",
      [],
    ));
  } else if (issues.length === 0) {
    if (occurs.length === 0 && ends.length > 0) {
      issues.push(issue(
        "end-without-occurrence",
        "An ends-at fact cannot place a subject without one occurs-at fact.",
        ends.map(({ evidence }) => evidence),
      ));
    } else if (occurs.length === 0) {
      issues.push(issue(
        "missing-occurrence",
        "This timeline note has no usable occurs-at fact.",
        [],
      ));
    } else if (occurs.length > 1) {
      issues.push(issue(
        "multiple-occurrences",
        "More than one occurs-at claim is present; the timeline will not choose one.",
        occurs.map(({ evidence }) => evidence),
      ));
    } else if (ends.length > 1) {
      issues.push(issue(
        "multiple-ends",
        "More than one ends-at claim is present; the timeline will not choose one.",
        ends.map(({ evidence }) => evidence),
      ));
    } else {
      computedRange = computeSubjectRange(occurs[0]!, ends[0] ?? null, calendars, issues);
    }
  }

  return {
    noteId: document.id!,
    path: document.path,
    title: document.title,
    noteType: document.type as TimelineSubjectType,
    noteCanon: document.canon,
    status: computedRange ? "computable" : "needs-time",
    range: computedRange,
    evidence,
    issues,
    sourceDiagnostics: document.parseIssues
      .filter(({ kind }) =>
        kind === "frontmatter-malformed" ||
        kind === "frontmatter-field" ||
        kind === "duplicate-metadata",
      )
      .map(({ message, range }) => ({ message, range })),
    trackIds: [],
    narrative: [...narrative],
  };
}

function computeSubjectRange(
  occurs: CandidateFact,
  ends: CandidateFact | null,
  calendars: TimelineProject["calendars"],
  issues: TimelineSubjectIssue[],
): TimelineRange | null {
  const occursValue = occurs.fact.value;
  if (occursValue.kind !== "time") return null;
  const start = normalizeTimelineExpression(
    occursValue.calendar,
    occursValue.expression,
    calendars,
  );
  if (start.kind !== "computable") {
    issues.push(issue("non-computable-time", start.reason, [occurs.evidence]));
    return null;
  }
  if (!ends) return start.range;
  if (start.range.interval) {
    issues.push(issue(
      "interval-with-end",
      "occurs-at already contains a complete interval and cannot also use ends-at.",
      [occurs.evidence, ends.evidence],
    ));
    return null;
  }
  const endsValue = ends.fact.value;
  if (endsValue.kind !== "time") return null;
  const finish = normalizeTimelineExpression(
    endsValue.calendar,
    endsValue.expression,
    calendars,
  );
  if (finish.kind !== "computable") {
    issues.push(issue("non-computable-time", finish.reason, [ends.evidence]));
    return null;
  }
  if (finish.range.interval) {
    issues.push(issue(
      "invalid-fact-shape",
      "ends-at must contain one date rather than an interval.",
      [ends.evidence],
    ));
    return null;
  }
  if (occursValue.calendar !== endsValue.calendar) {
    issues.push(issue(
      "different-calendars",
      "occurs-at and ends-at must use the same calendar.",
      [occurs.evidence, ends.evidence],
    ));
    return null;
  }
  if (start.range.earliest > finish.range.latest) {
    issues.push(issue(
      "reversed-span",
      "The earliest possible start is after the latest possible end.",
      [occurs.evidence, ends.evidence],
    ));
    return null;
  }
  return {
    ...start.range,
    expression: `${occursValue.expression}/${endsValue.expression}`,
    latest: finish.range.latest,
    endPrecision: finish.range.endPrecision,
    interval: true,
    anchored: start.range.anchored && finish.range.anchored,
  };
}

function factEvidence(
  fact: ParsedContinuityFact,
  noteCanon: CanonStatus | null,
): TimelineFactEvidence {
  return {
    id: fact.id,
    property: fact.property as "occurs-at" | "ends-at",
    calendar: fact.value.kind === "time" ? fact.value.calendar : null,
    expression: fact.value.kind === "time" ? fact.value.expression : null,
    certainty: fact.certainty,
    effectiveCanon: fact.canon ?? noteCanon,
    range: fact.range,
  };
}

function issue(
  code: TimelineSubjectIssue["code"],
  message: string,
  evidence: readonly TimelineFactEvidence[],
): TimelineSubjectIssue {
  return {
    code,
    message,
    factIds: evidence.map(({ id }) => id),
    ranges: evidence.map(({ range }) => range),
  };
}

function resolveTrack(
  track: TimelineTrack,
  subjects: ReadonlyMap<string, TimelineSubject>,
  documentIds: ReadonlyMap<string, number>,
  duplicateNoteIds: ReadonlySet<string>,
): TimelineTrackModel {
  const subjectIds: string[] = [];
  const issues: TimelineTrackMembershipIssue[] = [];
  for (const noteId of track.noteIds) {
    if (subjects.has(noteId)) {
      subjectIds.push(noteId);
      continue;
    }
    const message = duplicateNoteIds.has(noteId)
      ? "This membership points to a note ID that appears in more than one file."
      : documentIds.has(noteId)
        ? "This membership points to a note that is not an eligible event, scene, or chapter subject."
        : "This membership points to a note ID that is not present in the current index.";
    issues.push({ noteId, message });
  }
  return {
    id: track.id,
    title: track.title,
    color: track.color ?? null,
    subjectIds,
    issues,
  };
}

function narrativePositions(
  manuscript: ManuscriptStructure | null,
): Map<string, TimelineNarrativePosition[]> {
  const positions = new Map<string, TimelineNarrativePosition[]>();
  if (!manuscript) return positions;
  for (let manuscriptIndex = 0; manuscriptIndex < manuscript.manuscripts.length; manuscriptIndex += 1) {
    const definition = manuscript.manuscripts[manuscriptIndex]!;
    for (let itemIndex = 0; itemIndex < definition.items.length; itemIndex += 1) {
      const item = definition.items[itemIndex]!;
      addItemNarrativePosition(
        positions,
        definition.id,
        definition.title,
        item,
        [manuscriptIndex, itemIndex],
      );
    }
  }
  return positions;
}

function addItemNarrativePosition(
  positions: Map<string, TimelineNarrativePosition[]>,
  manuscriptId: string,
  manuscriptTitle: string,
  item: ManuscriptOutlineItem,
  order: number[],
): void {
  if (item.kind === "scene") {
    addBindingPosition(
      positions,
      item.source,
      manuscriptId,
      manuscriptTitle,
      item,
      "source",
      order,
    );
    return;
  }
  if (item.source) {
    addBindingPosition(
      positions,
      item.source,
      manuscriptId,
      manuscriptTitle,
      item,
      "source",
      order,
    );
  }
  if (item.overview) {
    addBindingPosition(
      positions,
      item.overview,
      manuscriptId,
      manuscriptTitle,
      item,
      "overview",
      order,
    );
  }
  for (let childIndex = 0; childIndex < item.children.length; childIndex += 1) {
    addItemNarrativePosition(
      positions,
      manuscriptId,
      manuscriptTitle,
      item.children[childIndex]!,
      [...order, childIndex],
    );
  }
}

function addBindingPosition(
  positions: Map<string, TimelineNarrativePosition[]>,
  binding: ManuscriptSourceBinding,
  manuscriptId: string,
  manuscriptTitle: string,
  item: ManuscriptOutlineItem | ManuscriptChapter,
  bindingKind: "source" | "overview",
  order: number[],
): void {
  if (!binding.noteId) return;
  const values = positions.get(binding.noteId) ?? [];
  values.push({
    manuscriptId,
    manuscriptTitle,
    itemId: item.id,
    itemTitle: item.title,
    itemKind: item.kind,
    binding: bindingKind,
    order: [...order],
    storyDate: storyDate(item),
  });
  positions.set(binding.noteId, values);
}

function storyDate(metadata: ManuscriptOutlineMetadata): string | null {
  return metadata.storyDate ?? null;
}

function buildCalendarGroups(subjects: readonly TimelineSubject[]): TimelineCalendarGroup[] {
  const grouped = new Map<TimelineRange["axis"], TimelineSubject[]>();
  for (const subject of subjects) {
    if (!subject.range) continue;
    const values = grouped.get(subject.range.axis) ?? [];
    values.push(subject);
    grouped.set(subject.range.axis, values);
  }
  return [...grouped.entries()]
    .sort(([first], [second]) => compareAxes(first, second))
    .map(([axis, values]) => ({
      axis,
      subjectIds: values.sort(compareComputableSubjects).map(({ noteId }) => noteId),
    }));
}

function compareComputableSubjects(first: TimelineSubject, second: TimelineSubject): number {
  const temporal = compareTimelineRanges(first.range!, second.range!);
  if (temporal.kind === "comparable" && temporal.order !== 0) return temporal.order;
  return compareSubjectsWithoutTime(first, second);
}

function compareSubjectsWithoutTime(first: TimelineSubject, second: TimelineSubject): number {
  return first.title.localeCompare(second.title) ||
    first.path.localeCompare(second.path) ||
    first.noteId.localeCompare(second.noteId);
}

function compareAxes(first: TimelineRange["axis"], second: TimelineRange["axis"]): number {
  if (first === "gregorian") return second === "gregorian" ? 0 : -1;
  if (second === "gregorian") return 1;
  return first.localeCompare(second);
}

function countDocumentIds(index: LoreProjectIndex): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { id } of index.documents.values()) {
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function compareDocuments(first: LoreDocumentRecord, second: LoreDocumentRecord): number {
  return first.path.localeCompare(second.path);
}

function isTimelineSubjectType(value: string | null): value is TimelineSubjectType {
  return value !== null && SUBJECT_TYPES.has(value as TimelineSubjectType);
}
