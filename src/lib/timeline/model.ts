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
  calculateCalendarYearAge,
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

export type TimelineAppearanceEvidenceRole =
  | "participant"
  | "valid-from"
  | "valid-to"
  | "occurrence"
  | "birth"
  | "death";

export interface TimelineAppearanceEvidence {
  role: TimelineAppearanceEvidenceRole;
  factId: string;
  path: string;
  title: string;
  property: string;
  calendar: string | null;
  expression: string | null;
  certainty: ContinuityCertainty | null;
  effectiveCanon: CanonStatus | null;
  range: SourceRange;
}

export interface TimelineCharacterAge {
  kind: "exact" | "range" | "indeterminate";
  minimumYears: string | null;
  maximumYears: string | null;
  qualified: boolean;
  reason: string;
}

export interface TimelineCharacterPresence {
  kind: "possible" | "impossible-before-birth" | "impossible-after-death" | "uncertain";
  hardContradiction: boolean;
  reason: string;
}

export interface TimelineCharacterAppearance {
  participantFactId: string;
  targetNoteId: string | null;
  characterPath: string | null;
  characterTitle: string;
  participation: "confirmed" | "potential" | "indeterminate";
  participationReason: string;
  age: TimelineCharacterAge;
  presence: TimelineCharacterPresence;
  evidence: TimelineAppearanceEvidence[];
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
  appearances: TimelineCharacterAppearance[];
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
  const documentIds = countDocumentIds(index);
  const uniqueDocuments = uniqueDocumentsById(index, documentIds);
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

  for (const subject of subjects) {
    const document = index.documents.get(subject.path);
    if (!document) continue;
    subject.appearances = deriveCharacterAppearances(
      document,
      subject,
      uniqueDocuments,
      documentIds,
      duplicateFactIds,
      timeline?.calendars ?? [],
    );
  }

  const subjectById = new Map(subjects.map((subject) => [subject.noteId, subject]));
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
    appearances: [],
  };
}

function deriveCharacterAppearances(
  document: LoreDocumentRecord,
  subject: TimelineSubject,
  uniqueDocuments: ReadonlyMap<string, LoreDocumentRecord>,
  documentIds: ReadonlyMap<string, number>,
  duplicateFactIds: ReadonlySet<string>,
  calendars: TimelineProject["calendars"],
): TimelineCharacterAppearance[] {
  const appearances: TimelineCharacterAppearance[] = [];
  for (const fact of document.facts.filter(({ property }) => property === "participant")) {
    const participantEvidence = appearanceEvidence(
      "participant",
      fact,
      document,
      fact.value.kind === "time" ? fact.value : null,
    );
    const occurrenceEvidence = subject.evidence.map((evidence) => ({
      role: "occurrence" as const,
      factId: evidence.id,
      path: subject.path,
      title: subject.title,
      property: evidence.property,
      calendar: evidence.calendar,
      expression: evidence.expression,
      certainty: evidence.certainty,
      effectiveCanon: evidence.effectiveCanon,
      range: evidence.range,
    }));
    const baseEvidence = [participantEvidence, ...validityEvidence(fact, document), ...occurrenceEvidence];
    if (duplicateFactIds.has(fact.id)) {
      appearances.push(unresolvedAppearance(
        fact,
        "This participant fact ID appears in more than one note.",
        baseEvidence,
      ));
      continue;
    }
    if (fact.value.kind !== "note") {
      appearances.push(unresolvedAppearance(
        fact,
        "A participant must point to one stable note ID.",
        baseEvidence,
      ));
      continue;
    }
    const targetCount = documentIds.get(fact.value.id) ?? 0;
    if (targetCount !== 1) {
      appearances.push(unresolvedAppearance(
        fact,
        targetCount === 0
          ? "The participant note ID is not present in the current index."
          : "The participant note ID appears in more than one source.",
        baseEvidence,
      ));
      continue;
    }
    const character = uniqueDocuments.get(fact.value.id)!;
    if (character.type !== "character") continue;
    appearances.push(deriveCharacterAppearance(
      fact,
      character,
      subject,
      duplicateFactIds,
      calendars,
      baseEvidence,
    ));
  }
  return appearances.sort((first, second) =>
    first.characterTitle.localeCompare(second.characterTitle) ||
    first.participantFactId.localeCompare(second.participantFactId)
  );
}

function deriveCharacterAppearance(
  participant: ParsedContinuityFact,
  character: LoreDocumentRecord,
  subject: TimelineSubject,
  duplicateFactIds: ReadonlySet<string>,
  calendars: TimelineProject["calendars"],
  baseEvidence: TimelineAppearanceEvidence[],
): TimelineCharacterAppearance {
  const participation = classifyParticipation(participant, subject.range, calendars);
  const birth = selectLifespanFact(character, "born", duplicateFactIds);
  const death = selectLifespanFact(character, "died", duplicateFactIds);
  const evidence = [...baseEvidence];
  for (const fact of birth.facts) {
    evidence.push(appearanceEvidence("birth", fact, character, fact.value.kind === "time" ? fact.value : null));
  }
  for (const fact of death.facts) {
    evidence.push(appearanceEvidence("death", fact, character, fact.value.kind === "time" ? fact.value : null));
  }

  const common = {
    participantFactId: participant.id,
    targetNoteId: character.id,
    characterPath: character.path,
    characterTitle: character.title,
    participation: participation.kind,
    participationReason: participation.reason,
    evidence,
  } as const;
  if (!subject.range) {
    return {
      ...common,
      age: indeterminateAge("The timeline subject has no single computable occurrence."),
      presence: uncertainPresence("Presence cannot be checked until the occurrence is computable."),
    };
  }
  if (!birth.fact || birth.fact.value.kind !== "time") {
    const reason = birth.reason ?? "The character has no born fact.";
    return {
      ...common,
      age: indeterminateAge(reason),
      presence: uncertainPresence(reason),
    };
  }

  const calculation = calculateCalendarYearAge(
    birth.fact.value.calendar,
    birth.fact.value.expression,
    subject.range,
    calendars,
  );
  const exactEvidence = claimsAreExact(participant, subject, birth.fact);
  const qualified = !exactEvidence;
  let age: TimelineCharacterAge;
  let presence: TimelineCharacterPresence;
  if (calculation.kind === "pre-birth") {
    age = indeterminateAge(calculation.reason, qualified);
    const hard = participation.kind === "confirmed" && exactEvidence;
    presence = {
      kind: "impossible-before-birth",
      hardContradiction: hard,
      reason: hard
        ? "Confirmed participation is wholly before the character's exact birth evidence."
        : "The occurrence is before the written birth range, but non-exact or potential evidence prevents a hard contradiction.",
    };
  } else if (calculation.kind === "indeterminate") {
    age = indeterminateAge(calculation.reason, qualified);
    presence = uncertainPresence(calculation.reason);
  } else {
    const exactRange = calculation.birthRange.earliest === calculation.birthRange.latest &&
      subject.range.earliest === subject.range.latest;
    age = {
      kind: exactRange && calculation.minimum === calculation.maximum ? "exact" : "range",
      minimumYears: calculation.minimum.toString(),
      maximumYears: calculation.maximum.toString(),
      qualified,
      reason: qualified
        ? "The numeric bounds are computable, but one or more source claims are not explicitly exact."
        : calculation.minimum === calculation.maximum
          ? "The source ranges resolve to one completed-calendar-year age."
          : "Reduced precision yields inclusive minimum and maximum completed-calendar-year ages.",
    };
    presence = possiblePresence();
  }

  if (presence.kind !== "impossible-before-birth" && death.fact?.value.kind === "time") {
    presence = applyDeathBoundary(
      death.fact,
      participant,
      subject,
      participation.kind,
      calendars,
      presence,
    );
  } else if (presence.kind !== "impossible-before-birth" && death.reason) {
    presence = uncertainPresence(death.reason);
  }
  if (participation.kind !== "confirmed") {
    presence = uncertainPresence(
      "Potential or indeterminate participation cannot create an impossible-appearance finding.",
    );
  }
  return { ...common, age, presence };
}

function classifyParticipation(
  fact: ParsedContinuityFact,
  occurrence: TimelineRange | null,
  calendars: TimelineProject["calendars"],
): { kind: "confirmed" | "potential" | "indeterminate"; reason: string } {
  if (!fact.validFrom && !fact.validTo) {
    return { kind: "confirmed", reason: "The participant fact has no applicability bounds." };
  }
  if (!occurrence) {
    return { kind: "indeterminate", reason: "Applicability cannot be compared until the occurrence is computable." };
  }
  const from = fact.validFrom
    ? normalizeTimelineExpression(fact.validFrom.calendar, fact.validFrom.expression, calendars)
    : null;
  const to = fact.validTo
    ? normalizeTimelineExpression(fact.validTo.calendar, fact.validTo.expression, calendars)
    : null;
  if (from?.kind === "non-computable") return { kind: "indeterminate", reason: from.reason };
  if (to?.kind === "non-computable") return { kind: "indeterminate", reason: to.reason };
  const lower = from?.range ?? null;
  const upper = to?.range ?? null;
  if ((lower && lower.axis !== occurrence.axis) || (upper && upper.axis !== occurrence.axis)) {
    return { kind: "indeterminate", reason: "The participation bounds and occurrence do not share one calendar axis." };
  }
  if (lower && upper && (lower.axis !== upper.axis || lower.earliest > upper.latest)) {
    return { kind: "indeterminate", reason: "The participation applicability bounds are reversed or incomparable." };
  }
  const definitelyInside = (!lower || occurrence.earliest >= lower.latest) &&
    (!upper || occurrence.latest <= upper.earliest);
  if (definitelyInside) {
    return { kind: "confirmed", reason: "The complete occurrence is inside the participant applicability window." };
  }
  const definitelyOutside = (lower && occurrence.latest < lower.earliest) ||
    (upper && occurrence.earliest > upper.latest);
  return {
    kind: "potential",
    reason: definitelyOutside
      ? "The occurrence is outside the participant applicability window, so this remains a potential planning participant."
      : "The occurrence only possibly or partly falls inside the participant applicability window.",
  };
}

function applyDeathBoundary(
  death: ParsedContinuityFact,
  participant: ParsedContinuityFact,
  subject: TimelineSubject,
  participation: TimelineCharacterAppearance["participation"],
  calendars: TimelineProject["calendars"],
  current: TimelineCharacterPresence,
): TimelineCharacterPresence {
  if (!subject.range || death.value.kind !== "time") return current;
  const normalized = normalizeTimelineExpression(
    death.value.calendar,
    death.value.expression,
    calendars,
  );
  if (normalized.kind !== "computable") return uncertainPresence(normalized.reason);
  if (normalized.range.axis !== subject.range.axis) {
    return uncertainPresence("The death and occurrence do not share one calendar axis.");
  }
  if (subject.range.earliest > normalized.range.latest) {
    const hard = participation === "confirmed" &&
      claimsAreExact(participant, subject, death);
    return {
      kind: "impossible-after-death",
      hardContradiction: hard,
      reason: hard
        ? "Confirmed participation is wholly after the character's exact death evidence."
        : "The occurrence is after the written death range, but non-exact or potential evidence prevents a hard contradiction.",
    };
  }
  if (subject.range.latest > normalized.range.earliest) {
    return uncertainPresence("The occurrence overlaps the possible death range.");
  }
  return current;
}

function selectLifespanFact(
  character: LoreDocumentRecord,
  property: "born" | "died",
  duplicateFactIds: ReadonlySet<string>,
): {
  fact: ParsedContinuityFact | null;
  facts: ParsedContinuityFact[];
  reason: string | null;
} {
  const facts = character.facts.filter((fact) => fact.property === property);
  if (facts.length === 0) {
    return { fact: null, facts, reason: property === "born" ? "The character has no born fact." : null };
  }
  if (facts.length > 1) {
    return { fact: null, facts, reason: `The character has more than one ${property} fact; the timeline will not choose one.` };
  }
  const fact = facts[0]!;
  if (duplicateFactIds.has(fact.id)) {
    return { fact: null, facts, reason: `The ${property} fact ID appears in more than one note.` };
  }
  if (fact.value.kind !== "time" || fact.validFrom || fact.validTo) {
    return { fact: null, facts, reason: `The ${property} fact must contain one time value without validity bounds.` };
  }
  return { fact, facts, reason: null };
}

function claimsAreExact(
  participant: ParsedContinuityFact,
  subject: TimelineSubject,
  lifespan: ParsedContinuityFact,
): boolean {
  return participant.certainty === "exact" &&
    lifespan.certainty === "exact" &&
    subject.evidence.length > 0 &&
    subject.evidence.every(({ certainty }) => certainty === "exact");
}

function appearanceEvidence(
  role: TimelineAppearanceEvidenceRole,
  fact: ParsedContinuityFact,
  document: LoreDocumentRecord,
  time: ParsedContinuityFact["validFrom"],
): TimelineAppearanceEvidence {
  return {
    role,
    factId: fact.id,
    path: document.path,
    title: document.title,
    property: fact.property,
    calendar: time?.calendar ?? null,
    expression: time?.expression ?? null,
    certainty: fact.certainty,
    effectiveCanon: fact.canon ?? document.canon,
    range: role === "valid-from" && fact.validFrom
      ? fact.validFrom.range
      : role === "valid-to" && fact.validTo
        ? fact.validTo.range
        : fact.range,
  };
}

function validityEvidence(
  fact: ParsedContinuityFact,
  document: LoreDocumentRecord,
): TimelineAppearanceEvidence[] {
  return [
    ...(fact.validFrom ? [appearanceEvidence("valid-from", fact, document, fact.validFrom)] : []),
    ...(fact.validTo ? [appearanceEvidence("valid-to", fact, document, fact.validTo)] : []),
  ];
}

function unresolvedAppearance(
  fact: ParsedContinuityFact,
  reason: string,
  evidence: TimelineAppearanceEvidence[],
): TimelineCharacterAppearance {
  return {
    participantFactId: fact.id,
    targetNoteId: fact.value.kind === "note" ? fact.value.id : null,
    characterPath: null,
    characterTitle: fact.value.kind === "note" ? fact.value.id : "Unresolved participant",
    participation: "indeterminate",
    participationReason: reason,
    age: indeterminateAge(reason),
    presence: uncertainPresence(reason),
    evidence,
  };
}

function indeterminateAge(reason: string, qualified = true): TimelineCharacterAge {
  return {
    kind: "indeterminate",
    minimumYears: null,
    maximumYears: null,
    qualified,
    reason,
  };
}

function possiblePresence(): TimelineCharacterPresence {
  return {
    kind: "possible",
    hardContradiction: false,
    reason: "The available birth and death evidence does not rule out this appearance.",
  };
}

function uncertainPresence(reason: string): TimelineCharacterPresence {
  return { kind: "uncertain", hardContradiction: false, reason };
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

function uniqueDocumentsById(
  index: LoreProjectIndex,
  counts: ReadonlyMap<string, number>,
): Map<string, LoreDocumentRecord> {
  const documents = new Map<string, LoreDocumentRecord>();
  for (const document of index.documents.values()) {
    if (document.id && counts.get(document.id) === 1) {
      documents.set(document.id, document);
    }
  }
  return documents;
}

function compareDocuments(first: LoreDocumentRecord, second: LoreDocumentRecord): number {
  return first.path.localeCompare(second.path);
}

function isTimelineSubjectType(value: string | null): value is TimelineSubjectType {
  return value !== null && SUBJECT_TYPES.has(value as TimelineSubjectType);
}
