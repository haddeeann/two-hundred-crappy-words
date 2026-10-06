import {
  continuityPropertyDefinition,
} from "$lib/lore/continuity-registry";
import type {
  LoreDocumentRecord,
  LoreProjectIndex,
  SourceRange,
} from "$lib/lore/types";
import type { ManuscriptStructure } from "$lib/manuscript/structure";
import type {
  RelationshipReviewFindingSet,
} from "$lib/relationships/review";
import type { TimelineCalendar } from "$lib/timeline/format";
import type {
  TimelineModel,
} from "$lib/timeline/model";
import type { TravelJourneyAnalysis } from "$lib/travel/journey";
import type { TravelPresenceFindingSet } from "$lib/travel/presence";
import { applyContinuitySeverityGate } from "./policy";
import { deriveNewContinuityReviewFindings } from "./rules";
import type {
  ContinuityReviewEvidence,
  ContinuityReviewFinding,
  ContinuityReviewModel,
  ContinuityReviewScope,
  ContinuitySourceProblem,
} from "./types";

export const MAX_CONTINUITY_REVIEW_FINDINGS = 200;
export const MAX_CONTINUITY_SOURCE_PROBLEMS = 500;
export const TIMELINE_APPEARANCE_RULE_VERSION = 1;
export const TRAVEL_ARRIVAL_COMPARISON_RULE_ID = "travel.arrival.comparison";
export const TRAVEL_ARRIVAL_COMPARISON_RULE_VERSION = 1;

export interface DeriveContinuityReviewInput {
  index: LoreProjectIndex;
  calendars: readonly TimelineCalendar[];
  relationshipFindings: RelationshipReviewFindingSet;
  travelPresenceFindings: TravelPresenceFindingSet;
  timeline: TimelineModel;
  travelAnalyses: readonly TravelJourneyAnalysis[];
  manuscript: ManuscriptStructure | null;
  scope?: ContinuityReviewScope;
}

export function deriveContinuityReview(
  input: DeriveContinuityReviewInput,
): ContinuityReviewModel {
  const scope = input.scope ?? { kind: "whole-world" };
  const findings = [
    ...adaptRelationshipFindings(input),
    ...adaptTravelPresenceFindings(input),
    ...adaptTimelineAppearanceFindings(input),
    ...adaptTravelArrivalFindings(input),
    ...deriveNewContinuityReviewFindings(input.index, input.calendars),
  ].filter((finding): finding is ContinuityReviewFinding => finding !== null);
  const sourceProblems = deriveSourceProblems(input.index, input.timeline);
  const scopedFindings = filterByScope(findings, scope, input.manuscript);
  const scopedProblems = filterByScope(sourceProblems, scope, input.manuscript);
  scopedFindings.sort(compareFindings);
  scopedProblems.sort(compareSourceProblems);
  const upstreamOmitted =
    input.relationshipFindings.omittedCount +
    input.travelPresenceFindings.omittedCount;
  return {
    generation: input.index.generation,
    scope,
    findings: scopedFindings.slice(0, MAX_CONTINUITY_REVIEW_FINDINGS),
    omittedFindingCount:
      upstreamOmitted +
      Math.max(0, scopedFindings.length - MAX_CONTINUITY_REVIEW_FINDINGS),
    sourceProblems: scopedProblems.slice(0, MAX_CONTINUITY_SOURCE_PROBLEMS),
    omittedSourceProblemCount: Math.max(
      0,
      scopedProblems.length - MAX_CONTINUITY_SOURCE_PROBLEMS,
    ),
  };
}

function adaptRelationshipFindings(
  input: DeriveContinuityReviewInput,
): Array<ContinuityReviewFinding | null> {
  return input.relationshipFindings.findings.map((finding) => {
    const evidence = finding.evidence.map((item) => ({
      stableId: `fact:${item.factId}`,
      role: item.property,
      factId: item.factId,
      noteId: item.sourceNoteId,
      path: item.sourcePath,
      title: item.sourceTitle,
      property: item.property,
      sourceFingerprint: item.sourceFingerprint,
      sourceRange: item.sourceRange,
      effectiveCanon: item.effectiveCanon,
      certainty: item.certainty,
    }));
    const severity = applyContinuitySeverityGate("review", evidence);
    return severity
      ? {
          id: finding.id,
          ruleId: finding.ruleId,
          ruleVersion: finding.ruleVersion,
          family: "relationship",
          severity,
          summary: finding.summary,
          explanation: finding.explanation,
          subjectNoteIds: finding.profileNoteIds,
          evidence: evidence.sort(compareEvidence),
        }
      : null;
  });
}

function adaptTravelPresenceFindings(
  input: DeriveContinuityReviewInput,
): Array<ContinuityReviewFinding | null> {
  return input.travelPresenceFindings.findings.map((finding) => {
    const evidence = finding.evidence.map((item) =>
      normalizedEvidence(input.index, {
        stableId: `fact:${item.factId}`,
        role: item.role,
        factId: item.factId,
        noteId: item.noteId,
        path: item.path,
        title: item.title,
        property: item.property,
        sourceRange: item.range,
        effectiveCanon: item.effectiveCanon,
        certainty: item.certainty,
      }),
    );
    const severity = applyContinuitySeverityGate(finding.severity, evidence);
    return severity
      ? {
          id: finding.id,
          ruleId: finding.ruleId,
          ruleVersion: finding.ruleVersion,
          family: "travel-presence",
          severity,
          summary: finding.summary,
          explanation: finding.explanation,
          subjectNoteIds: uniqueStrings([
            finding.journeyNoteId,
            finding.participantNoteId,
            finding.endpointNoteId,
            ...(finding.presenceNoteId ? [finding.presenceNoteId] : []),
          ]),
          evidence: evidence.sort(compareEvidence),
        }
      : null;
  });
}

function adaptTimelineAppearanceFindings(
  input: DeriveContinuityReviewInput,
): Array<ContinuityReviewFinding | null> {
  const findings: Array<ContinuityReviewFinding | null> = [];
  for (const subject of input.timeline.subjects) {
    for (const appearance of subject.appearances) {
      if (
        appearance.presence.kind !== "impossible-before-birth" &&
        appearance.presence.kind !== "impossible-after-death"
      ) {
        continue;
      }
      const evidence = appearance.evidence.map((item) =>
        normalizedEvidence(input.index, {
          stableId: `fact:${item.factId}`,
          role: item.role,
          factId: item.factId,
          noteId: input.index.documents.get(item.path)?.id ?? null,
          path: item.path,
          title: item.title,
          property: item.property,
          sourceRange: item.range,
          effectiveCanon: item.effectiveCanon,
          certainty: item.certainty,
        }),
      );
      const severity = applyContinuitySeverityGate("contradiction", evidence);
      if (!severity) {
        findings.push(null);
        continue;
      }
      const beforeBirth = appearance.presence.kind === "impossible-before-birth";
      const ruleId = beforeBirth
        ? "timeline.appearance.before-birth"
        : "timeline.appearance.after-death";
      findings.push({
        id: stableFindingId(ruleId, TIMELINE_APPEARANCE_RULE_VERSION, evidence),
        ruleId,
        ruleVersion: TIMELINE_APPEARANCE_RULE_VERSION,
        family: "timeline-appearance",
        severity,
        summary: `${appearance.characterTitle} appears ${beforeBirth ? "before birth" : "after death"} in ${subject.title}`,
        explanation:
          severity === "contradiction"
            ? appearance.presence.reason
            : `${appearance.presence.reason} The shared canon gate keeps this at Review unless every contributing claim is canon and explicitly exact.`,
        subjectNoteIds: uniqueStrings([
          subject.noteId,
          ...(appearance.targetNoteId ? [appearance.targetNoteId] : []),
        ]),
        evidence: evidence.sort(compareEvidence),
      });
    }
  }
  return findings;
}

function adaptTravelArrivalFindings(
  input: DeriveContinuityReviewInput,
): Array<ContinuityReviewFinding | null> {
  return input.travelAnalyses.flatMap((analysis) => {
    if (
      analysis.kind !== "computed" ||
      analysis.comparison.kind === "not-authored"
    ) {
      return [];
    }
    const evidence = analysis.evidence.map((item) =>
      normalizedEvidence(input.index, {
        stableId: `fact:${item.factId}`,
        role: item.role,
        factId: item.factId,
        noteId: item.noteId,
        path: item.path,
        title: item.title,
        property: item.property,
        sourceRange: item.range,
        effectiveCanon: item.effectiveCanon,
        certainty: item.certainty,
      }),
    );
    const requested =
      analysis.comparison.kind === "review"
        ? "contradiction"
        : "information";
    const severity = applyContinuitySeverityGate(requested, evidence);
    if (!severity) return [null];
    const summary =
      analysis.comparison.kind === "compatible"
        ? `${analysis.journey.title}'s authored and calculated arrivals overlap`
        : analysis.comparison.kind === "review"
          ? `${analysis.journey.title}'s authored and calculated arrivals do not overlap`
          : `${analysis.journey.title}'s authored arrival cannot be compared`;
    return [{
      id: stableFindingId(
        TRAVEL_ARRIVAL_COMPARISON_RULE_ID,
        TRAVEL_ARRIVAL_COMPARISON_RULE_VERSION,
        evidence,
      ),
      ruleId: TRAVEL_ARRIVAL_COMPARISON_RULE_ID,
      ruleVersion: TRAVEL_ARRIVAL_COMPARISON_RULE_VERSION,
      family: "travel-arrival" as const,
      severity,
      summary,
      explanation:
        severity === "review" && requested === "contradiction"
          ? `${analysis.comparison.reason} The shared canon gate keeps this at Review unless every contributing claim is canon and explicitly exact.`
          : analysis.comparison.reason,
      subjectNoteIds: uniqueStrings([
        analysis.journey.noteId,
        analysis.route.noteId,
      ]),
      evidence: evidence.sort(compareEvidence),
    }];
  });
}

function deriveSourceProblems(
  index: LoreProjectIndex,
  timeline: TimelineModel,
): ContinuitySourceProblem[] {
  const problems: ContinuitySourceProblem[] = [];
  const documentsById = documentsByIdMap(index);
  const duplicateFactIds = new Set(
    index.issues
      .filter(({ kind }) => kind === "duplicate-continuity-fact-id")
      .map(({ id }) => id),
  );
  for (const document of index.documents.values()) {
    for (const issue of document.parseIssues) {
      problems.push(sourceProblem(
        "metadata",
        `source:${issue.kind}`,
        issue.message,
        issue.message,
        document,
        issue.range,
        null,
      ));
    }
    for (const outgoing of document.outgoing) {
      if (outgoing.resolution.kind === "resolved") continue;
      problems.push(sourceProblem(
        "reference",
        `wiki:${outgoing.resolution.kind}`,
        outgoing.resolution.message,
        outgoing.resolution.message,
        document,
        outgoing.link.destinationRange,
        null,
      ));
    }
    for (const fact of document.facts) {
      const messages: string[] = [];
      const definition = continuityPropertyDefinition(fact.property);
      if (duplicateFactIds.has(fact.id)) {
        messages.push("This fact ID appears in more than one note.");
      }
      if (definition) {
        if (!document.type || !definition.subjectTypes.includes(document.type)) {
          messages.push(`${definition.label} is not valid for this note type.`);
        }
        if (!definition.valueKinds.includes(fact.value.kind)) {
          messages.push(`${definition.label} does not accept a ${fact.value.kind} value.`);
        }
        if (!definition.allowsValidityBounds && (fact.validFrom || fact.validTo)) {
          messages.push(`${definition.label} does not use validity bounds.`);
        }
        if (fact.value.kind === "note") {
          const targets = documentsById.get(fact.value.id) ?? [];
          if (targets.length === 0) {
            messages.push(`Referenced note ID ${fact.value.id} is unavailable.`);
          } else if (targets.length > 1) {
            messages.push(`Referenced note ID ${fact.value.id} is ambiguous.`);
          } else if (
            definition.targetTypes &&
            (!targets[0]!.type || !definition.targetTypes.includes(targets[0]!.type!))
          ) {
            messages.push(`${definition.label} points to an incompatible note type.`);
          }
        }
      }
      if (messages.length > 0) {
        problems.push(sourceProblem(
          "reference",
          "continuity:fact",
          `${document.title} has an unusable ${definition?.label.toLowerCase() ?? fact.property} fact`,
          messages.join(" "),
          document,
          fact.range,
          fact.id,
        ));
      }
    }
  }
  for (const issue of index.issues) {
    for (const path of issue.paths) {
      const document = index.documents.get(path);
      if (!document) continue;
      problems.push(sourceProblem(
        "identity",
        `identity:${issue.kind}`,
        issue.message,
        issue.message,
        document,
        startOfFileRange(),
        null,
      ));
    }
  }
  for (const subject of timeline.subjects) {
    const document = index.documents.get(subject.path);
    if (!document) continue;
    for (const issue of subject.issues) {
      if (issue.code === "missing-occurrence") continue;
      const range = issue.ranges[0] ?? startOfFileRange();
      problems.push(sourceProblem(
        "timeline",
        `timeline:${issue.code}`,
        issue.message,
        issue.message,
        document,
        range,
        issue.factIds[0] ?? null,
      ));
    }
  }
  return dedupeProblems(problems);
}

function sourceProblem(
  family: ContinuitySourceProblem["family"],
  rule: string,
  summary: string,
  explanation: string,
  document: LoreDocumentRecord,
  range: SourceRange,
  factId: string | null,
): ContinuitySourceProblem {
  const stableId = factId
    ? `fact:${factId}`
    : `source:${document.path}:${range.start}:${range.end}`;
  return {
    id: `${rule}:${stableId}`,
    family,
    summary,
    explanation,
    subjectNoteIds: document.id ? [document.id] : [],
    evidence: [{
      stableId,
      role: "source",
      factId,
      noteId: document.id,
      path: document.path,
      title: document.title,
      property: null,
      sourceFingerprint: document.fingerprint,
      sourceRange: range,
      effectiveCanon: document.canon,
      certainty: null,
    }],
  };
}

function normalizedEvidence(
  index: LoreProjectIndex,
  value: Omit<ContinuityReviewEvidence, "sourceFingerprint">,
): ContinuityReviewEvidence {
  return {
    ...value,
    sourceFingerprint: index.documents.get(value.path)?.fingerprint ?? "",
  };
}

function stableFindingId(
  ruleId: string,
  ruleVersion: number,
  evidence: readonly ContinuityReviewEvidence[],
): string {
  const stableIds = uniqueStrings(evidence.map(({ stableId }) => stableId));
  return `${ruleId}:v${ruleVersion}:${stableIds.join(":")}`;
}

function filterByScope<
  T extends {
    subjectNoteIds: readonly string[];
    evidence: readonly ContinuityReviewEvidence[];
  },
>(
  values: readonly T[],
  scope: ContinuityReviewScope,
  structure: ManuscriptStructure | null,
): T[] {
  if (scope.kind === "whole-world") return [...values];
  const manuscript = structure?.manuscripts.find(({ id }) => id === scope.manuscriptId);
  if (!manuscript) return [];
  const noteIds = new Set<string>();
  const paths = new Set<string>();
  const addBinding = (binding: { path: string; noteId?: string } | undefined) => {
    if (!binding) return;
    paths.add(binding.path);
    if (binding.noteId) noteIds.add(binding.noteId);
  };
  for (const item of manuscript.items) {
    if (item.kind === "scene") {
      addBinding(item.source);
      continue;
    }
    addBinding(item.overview);
    addBinding(item.source);
    for (const scene of item.children) addBinding(scene.source);
  }
  return values.filter(
    ({ subjectNoteIds, evidence }) =>
      subjectNoteIds.some((id) => noteIds.has(id)) ||
      evidence.some(({ noteId, path }) =>
        paths.has(path) || (noteId !== null && noteIds.has(noteId)),
      ),
  );
}

function dedupeProblems(
  problems: readonly ContinuitySourceProblem[],
): ContinuitySourceProblem[] {
  const result = new Map<string, ContinuitySourceProblem>();
  for (const problem of problems) {
    if (!result.has(problem.id)) result.set(problem.id, problem);
  }
  return [...result.values()];
}

function documentsByIdMap(
  index: LoreProjectIndex,
): ReadonlyMap<string, readonly LoreDocumentRecord[]> {
  const result = new Map<string, LoreDocumentRecord[]>();
  for (const document of index.documents.values()) {
    if (!document.id) continue;
    const values = result.get(document.id) ?? [];
    values.push(document);
    result.set(document.id, values);
  }
  return result;
}

function compareFindings(
  left: ContinuityReviewFinding,
  right: ContinuityReviewFinding,
): number {
  return (
    severityOrder(left.severity) - severityOrder(right.severity) ||
    familyOrder(left.family) - familyOrder(right.family) ||
    compareText(left.ruleId, right.ruleId) ||
    compareEvidence(left.evidence[0]!, right.evidence[0]!) ||
    compareText(left.id, right.id)
  );
}

function compareSourceProblems(
  left: ContinuitySourceProblem,
  right: ContinuitySourceProblem,
): number {
  return (
    compareEvidence(left.evidence[0]!, right.evidence[0]!) ||
    compareText(left.id, right.id)
  );
}

function compareEvidence(
  left: ContinuityReviewEvidence,
  right: ContinuityReviewEvidence,
): number {
  return (
    compareText(left.path, right.path) ||
    left.sourceRange.start - right.sourceRange.start ||
    compareText(left.stableId, right.stableId)
  );
}

function severityOrder(value: ContinuityReviewFinding["severity"]): number {
  if (value === "contradiction") return 0;
  if (value === "review") return 1;
  return 2;
}

function familyOrder(value: ContinuityReviewFinding["family"]): number {
  return [
    "relationship",
    "travel-presence",
    "timeline-appearance",
    "travel-arrival",
    "continuity-property",
    "timeline-lifespan",
  ].indexOf(value);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function startOfFileRange(): SourceRange {
  return { start: 0, end: 0, line: 1, column: 1 };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
