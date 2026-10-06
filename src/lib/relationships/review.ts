import type { TimelineCalendar } from "$lib/timeline/format";
import { normalizeTimelineExpression } from "$lib/timeline/normalize";
import type { ContinuityTimeValue } from "$lib/lore/types";
import type { CanonStatus, ContinuityCertainty } from "$lib/lore/types";
import type {
  RelationshipAssertion,
  RelationshipEvidence,
  RelationshipModel,
} from "./model";

export const MAX_RELATIONSHIP_REVIEW_FINDINGS = 100;
export const MAX_PARENT_CYCLE_LINKS = 64;
export const RELATIONSHIP_REVIEW_RULE_VERSION = 1 as const;

export type RelationshipReviewRuleId =
  | "relationship.parent.cycle"
  | "relationship.assertion.duplicate"
  | "relationship.single.applicability";

export interface RelationshipReviewEvidence extends RelationshipEvidence {
  property: string;
  propertyLabel: string;
  sourceNoteId: string;
  sourceTitle: string;
  targetNoteId: string;
  targetTitle: string;
  effectiveCanon: CanonStatus | null;
  certainty: ContinuityCertainty | null;
}

export interface RelationshipReviewFinding {
  id: string;
  ruleId: RelationshipReviewRuleId;
  ruleVersion: typeof RELATIONSHIP_REVIEW_RULE_VERSION;
  severity: "review";
  summary: string;
  explanation: string;
  profileNoteIds: readonly string[];
  evidence: readonly RelationshipReviewEvidence[];
}

export interface RelationshipReviewFindingSet {
  findings: readonly RelationshipReviewFinding[];
  omittedCount: number;
}

export function deriveRelationshipReviewFindings(
  model: RelationshipModel,
  calendars: readonly TimelineCalendar[] = [],
): RelationshipReviewFindingSet {
  const findings = [
    ...parentCycleFindings(model.sourceAssertions),
    ...duplicateAssertionFindings(model.sourceAssertions),
    ...singleApplicabilityFindings(model.sourceAssertions, calendars),
  ].sort(compareFindings);
  return {
    findings: findings.slice(0, MAX_RELATIONSHIP_REVIEW_FINDINGS),
    omittedCount: Math.max(
      0,
      findings.length - MAX_RELATIONSHIP_REVIEW_FINDINGS,
    ),
  };
}

function parentCycleFindings(
  assertions: readonly RelationshipAssertion[],
): RelationshipReviewFinding[] {
  const edges = assertions.filter(({ property }) => property === "parent-of");
  const outgoing = new Map<string, RelationshipAssertion[]>();
  for (const edge of edges) {
    const values = outgoing.get(edge.source.noteId) ?? [];
    values.push(edge);
    outgoing.set(edge.source.noteId, values);
  }
  for (const values of outgoing.values()) values.sort(compareAssertions);

  const cycles = new Map<string, RelationshipAssertion[]>();
  for (const edge of edges) {
    const path = shortestParentPath(
      edge.target.noteId,
      edge.source.noteId,
      outgoing,
      MAX_PARENT_CYCLE_LINKS - 1,
    );
    if (!path) continue;
    const cycle = [edge, ...path];
    const signature = sortedFactIds(cycle).join(":");
    if (!cycles.has(signature)) cycles.set(signature, cycle);
  }

  return [...cycles.values()].map((cycle) => {
    const evidence = sortedEvidence(cycle);
    const titles = cycleTitles(cycle);
    return finding(
      "relationship.parent.cycle",
      evidence,
      `${titles.join(" → ")} forms a parent cycle`,
      `These resolved parent-of facts lead back to their starting character within the ${MAX_PARENT_CYCLE_LINKS}-link review bound. The pattern may be intentional in a story involving time loops, clones, recursive ancestry, or uncertain history.`,
      cycle.flatMap(({ source, target }) => [source.noteId, target.noteId]),
    );
  });
}

function shortestParentPath(
  startNoteId: string,
  targetNoteId: string,
  outgoing: ReadonlyMap<string, readonly RelationshipAssertion[]>,
  maximumLinks: number,
): RelationshipAssertion[] | null {
  if (startNoteId === targetNoteId) return [];
  const queue: Array<{ noteId: string; path: RelationshipAssertion[] }> = [
    { noteId: startNoteId, path: [] },
  ];
  const visitedDepth = new Map<string, number>([[startNoteId, 0]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    if (current.path.length >= maximumLinks) continue;
    for (const edge of outgoing.get(current.noteId) ?? []) {
      const path = [...current.path, edge];
      if (edge.target.noteId === targetNoteId) return path;
      const previousDepth = visitedDepth.get(edge.target.noteId);
      if (previousDepth !== undefined && previousDepth <= path.length) continue;
      visitedDepth.set(edge.target.noteId, path.length);
      queue.push({ noteId: edge.target.noteId, path });
    }
  }
  return null;
}

function duplicateAssertionFindings(
  assertions: readonly RelationshipAssertion[],
): RelationshipReviewFinding[] {
  const groups = groupBy(assertions, duplicateSignature);
  return [...groups.values()]
    .filter((values) => values.length > 1)
    .map((values) => {
      const evidence = sortedEvidence(values);
      const first = values[0]!;
      return finding(
        "relationship.assertion.duplicate",
        evidence,
        `${first.source.title} repeats the same ${first.propertyLabel.toLowerCase()} assertion`,
        "These different fact IDs have the same source, relationship type, target, canon, certainty, validity bounds, and writer note. They may be intentional separate evidence, so the app does not remove or merge them.",
        [first.source.noteId, first.target.noteId],
      );
    });
}

function singleApplicabilityFindings(
  assertions: readonly RelationshipAssertion[],
  calendars: readonly TimelineCalendar[],
): RelationshipReviewFinding[] {
  const candidates = assertions.filter(
    ({ property }) => property === "operated-by" || property === "home-port",
  );
  const groups = groupBy(
    candidates,
    ({ source, property }) => `${source.noteId}:${property}`,
  );
  const result: RelationshipReviewFinding[] = [];
  for (const values of groups.values()) {
    const components = overlapComponents(values, calendars);
    for (const component of components.filter((value) => value.length > 1)) {
      const first = component[0]!;
      const evidence = sortedEvidence(component);
      result.push(
        finding(
          "relationship.single.applicability",
          evidence,
          `${first.source.title} may have simultaneous ${first.propertyLabel.toLowerCase()} claims`,
          "These usable claims are not definitely separated by their inclusive validity bounds. Missing, imprecise, invalid, or cross-calendar bounds do not prove simultaneity, and multiple values may be intentional.",
          component.flatMap(({ source, target }) => [
            source.noteId,
            target.noteId,
          ]),
        ),
      );
    }
  }
  return result;
}

function overlapComponents(
  assertions: readonly RelationshipAssertion[],
  calendars: readonly TimelineCalendar[],
): RelationshipAssertion[][] {
  const sorted = [...assertions].sort(compareAssertions);
  const neighbors = sorted.map(() => new Set<number>());
  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      if (definitelySeparated(sorted[left]!, sorted[right]!, calendars)) continue;
      neighbors[left]!.add(right);
      neighbors[right]!.add(left);
    }
  }
  const seen = new Set<number>();
  const components: RelationshipAssertion[][] = [];
  for (let start = 0; start < sorted.length; start += 1) {
    if (seen.has(start)) continue;
    const indexes = [start];
    seen.add(start);
    for (let cursor = 0; cursor < indexes.length; cursor += 1) {
      for (const neighbor of neighbors[indexes[cursor]!]!) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        indexes.push(neighbor);
      }
    }
    components.push(indexes.map((index) => sorted[index]!));
  }
  return components;
}

function definitelySeparated(
  first: RelationshipAssertion,
  second: RelationshipAssertion,
  calendars: readonly TimelineCalendar[],
): boolean {
  return (
    boundaryBefore(first.validTo, second.validFrom, calendars) ||
    boundaryBefore(second.validTo, first.validFrom, calendars)
  );
}

function boundaryBefore(
  validTo: ContinuityTimeValue | null,
  validFrom: ContinuityTimeValue | null,
  calendars: readonly TimelineCalendar[],
): boolean {
  if (!validTo || !validFrom) return false;
  const end = normalizeTimelineExpression(
    validTo.calendar,
    validTo.expression,
    calendars,
  );
  const start = normalizeTimelineExpression(
    validFrom.calendar,
    validFrom.expression,
    calendars,
  );
  return (
    end.kind === "computable" &&
    start.kind === "computable" &&
    end.range.axis === start.range.axis &&
    end.range.latest < start.range.earliest
  );
}

function finding(
  ruleId: RelationshipReviewRuleId,
  evidence: readonly RelationshipReviewEvidence[],
  summary: string,
  explanation: string,
  profileNoteIds: readonly string[],
): RelationshipReviewFinding {
  const factIds = [...new Set(evidence.map(({ factId }) => factId))].sort();
  return {
    id: `${ruleId}:v${RELATIONSHIP_REVIEW_RULE_VERSION}:${factIds.join(":")}`,
    ruleId,
    ruleVersion: RELATIONSHIP_REVIEW_RULE_VERSION,
    severity: "review",
    summary,
    explanation,
    profileNoteIds: [...new Set(profileNoteIds)].sort(),
    evidence,
  };
}

function evidence(assertion: RelationshipAssertion): RelationshipReviewEvidence {
  return {
    ...assertion.evidence,
    property: assertion.property,
    propertyLabel: assertion.propertyLabel,
    sourceNoteId: assertion.source.noteId,
    sourceTitle: assertion.source.title,
    targetNoteId: assertion.target.noteId,
    targetTitle: assertion.target.title,
    effectiveCanon: assertion.effectiveCanon,
    certainty: assertion.certainty,
  };
}

function sortedEvidence(
  assertions: readonly RelationshipAssertion[],
): RelationshipReviewEvidence[] {
  return [...assertions]
    .sort(compareAssertions)
    .map(evidence);
}

function compareAssertions(
  left: RelationshipAssertion,
  right: RelationshipAssertion,
): number {
  return (
    compareText(left.evidence.sourcePath, right.evidence.sourcePath) ||
    left.evidence.sourceRange.start - right.evidence.sourceRange.start ||
    compareText(left.factId, right.factId)
  );
}

function compareFindings(
  left: RelationshipReviewFinding,
  right: RelationshipReviewFinding,
): number {
  return (
    ruleOrder(left.ruleId) - ruleOrder(right.ruleId) ||
    compareText(left.evidence[0]?.sourcePath ?? "", right.evidence[0]?.sourcePath ?? "") ||
    (left.evidence[0]?.sourceRange.start ?? 0) -
      (right.evidence[0]?.sourceRange.start ?? 0) ||
    compareText(left.id, right.id)
  );
}

function ruleOrder(ruleId: RelationshipReviewRuleId): number {
  if (ruleId === "relationship.parent.cycle") return 0;
  if (ruleId === "relationship.assertion.duplicate") return 1;
  return 2;
}

function duplicateSignature(assertion: RelationshipAssertion): string {
  return JSON.stringify([
    assertion.source.noteId,
    assertion.property,
    assertion.target.noteId,
    assertion.effectiveCanon,
    assertion.certainty,
    timeSignature(assertion.validFrom),
    timeSignature(assertion.validTo),
    assertion.note,
  ]);
}

function timeSignature(value: ContinuityTimeValue | null): unknown {
  return value ? [value.calendar, value.expression] : null;
}

function cycleTitles(cycle: readonly RelationshipAssertion[]): string[] {
  if (cycle.length === 0) return [];
  return [cycle[0]!.source.title, ...cycle.map(({ target }) => target.title)];
}

function sortedFactIds(assertions: readonly RelationshipAssertion[]): string[] {
  return [...new Set(assertions.map(({ factId }) => factId))].sort();
}

function groupBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const group = result.get(key(value)) ?? [];
    group.push(value);
    result.set(key(value), group);
  }
  return result;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
