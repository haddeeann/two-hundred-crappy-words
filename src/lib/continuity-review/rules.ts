import {
  continuityPropertyDefinition,
  type ContinuityPropertyDefinition,
} from "$lib/lore/continuity-registry";
import type {
  LoreDocumentRecord,
  LoreProjectIndex,
  ParsedContinuityFact,
} from "$lib/lore/types";
import type { TimelineCalendar } from "$lib/timeline/format";
import { normalizeTimelineExpression } from "$lib/timeline/normalize";
import { applyContinuitySeverityGate } from "./policy";
import type {
  ContinuityReviewEvidence,
  ContinuityReviewFinding,
} from "./types";

export const CONTINUITY_SINGLE_APPLICABILITY_RULE_ID =
  "continuity.single-applicability";
export const TIMELINE_LIFESPAN_ORDER_RULE_ID = "timeline.lifespan.order";
export const CONTINUITY_REVIEW_NEW_RULE_VERSION = 1;

const RELATIONSHIP_COVERED_PROPERTIES = new Set(["operated-by", "home-port"]);

interface UsableFact {
  document: LoreDocumentRecord;
  fact: ParsedContinuityFact;
  definition: ContinuityPropertyDefinition;
}

interface RuleCatalog {
  documentsById: ReadonlyMap<string, readonly LoreDocumentRecord[]>;
  duplicateFactIds: ReadonlySet<string>;
}

export function deriveNewContinuityReviewFindings(
  index: LoreProjectIndex,
  calendars: readonly TimelineCalendar[],
): ContinuityReviewFinding[] {
  const catalog = createCatalog(index);
  const usable = usableFacts(index, catalog);
  return [
    ...singleApplicabilityFindings(usable, calendars),
    ...lifespanOrderFindings(usable, calendars),
  ].sort(compareFindings);
}

function singleApplicabilityFindings(
  usable: readonly UsableFact[],
  calendars: readonly TimelineCalendar[],
): ContinuityReviewFinding[] {
  const candidates = usable.filter(
    ({ definition }) =>
      definition.simultaneousValues === "one-to-review" &&
      !RELATIONSHIP_COVERED_PROPERTIES.has(definition.key),
  );
  const groups = groupBy(
    candidates,
    ({ document, fact }) => `${document.id}:${fact.property}`,
  );
  const findings: ContinuityReviewFinding[] = [];
  for (const values of groups.values()) {
    for (const component of overlapComponents(values, calendars)) {
      if (component.length < 2) continue;
      const first = component[0]!;
      const evidence = component.map(toEvidence).sort(compareEvidence);
      const factIds = stableFactIds(evidence);
      findings.push({
        id: `${CONTINUITY_SINGLE_APPLICABILITY_RULE_ID}:v${CONTINUITY_REVIEW_NEW_RULE_VERSION}:${factIds.join(":")}`,
        ruleId: CONTINUITY_SINGLE_APPLICABILITY_RULE_ID,
        ruleVersion: CONTINUITY_REVIEW_NEW_RULE_VERSION,
        family: "continuity-property",
        severity: "review",
        summary: `${first.document.title} may have simultaneous ${first.definition.label.toLowerCase()} claims`,
        explanation:
          "These usable claims are not definitely separated by their inclusive validity bounds. Missing, imprecise, invalid, or cross-calendar bounds do not prove simultaneity, and multiple values may be intentional.",
        subjectNoteIds: [first.document.id!],
        evidence,
      });
    }
  }
  return findings;
}

function lifespanOrderFindings(
  usable: readonly UsableFact[],
  calendars: readonly TimelineCalendar[],
): ContinuityReviewFinding[] {
  const byDocument = groupBy(usable, ({ document }) => document.id!);
  const findings: ContinuityReviewFinding[] = [];
  for (const values of byDocument.values()) {
    const births = values.filter(({ fact }) => fact.property === "born");
    const deaths = values.filter(({ fact }) => fact.property === "died");
    if (births.length !== 1 || deaths.length !== 1) continue;
    const birth = births[0]!;
    const death = deaths[0]!;
    if (birth.fact.value.kind !== "time" || death.fact.value.kind !== "time") {
      continue;
    }
    const normalizedBirth = normalizeTimelineExpression(
      birth.fact.value.calendar,
      birth.fact.value.expression,
      calendars,
    );
    const normalizedDeath = normalizeTimelineExpression(
      death.fact.value.calendar,
      death.fact.value.expression,
      calendars,
    );
    if (
      normalizedBirth.kind !== "computable" ||
      normalizedDeath.kind !== "computable" ||
      normalizedBirth.range.axis !== normalizedDeath.range.axis ||
      normalizedDeath.range.latest >= normalizedBirth.range.earliest
    ) {
      continue;
    }
    const evidence = [toEvidence(birth), toEvidence(death)].sort(compareEvidence);
    const severity = applyContinuitySeverityGate("contradiction", evidence)!;
    findings.push({
      id: `${TIMELINE_LIFESPAN_ORDER_RULE_ID}:v${CONTINUITY_REVIEW_NEW_RULE_VERSION}:${stableFactIds(evidence).join(":")}`,
      ruleId: TIMELINE_LIFESPAN_ORDER_RULE_ID,
      ruleVersion: CONTINUITY_REVIEW_NEW_RULE_VERSION,
      family: "timeline-lifespan",
      severity,
      summary: `${birth.document.title}'s death is wholly before their birth`,
      explanation:
        severity === "contradiction"
          ? "The unique canon, exact, computable death range ends before the unique canon, exact birth range begins. Time loops, resurrection, clones, or disputed records may make this intentional."
          : "The unique computable death range ends before the birth range begins, but canon or certainty qualifications keep this at Review. Time loops, resurrection, clones, or disputed records may make it intentional.",
      subjectNoteIds: [birth.document.id!],
      evidence,
    });
  }
  return findings;
}

function usableFacts(
  index: LoreProjectIndex,
  catalog: RuleCatalog,
): UsableFact[] {
  const values: UsableFact[] = [];
  for (const document of index.documents.values()) {
    if (!document.id || (catalog.documentsById.get(document.id)?.length ?? 0) !== 1) {
      continue;
    }
    for (const fact of document.facts) {
      const definition = continuityPropertyDefinition(fact.property);
      if (!definition || catalog.duplicateFactIds.has(fact.id)) continue;
      if (!document.type || !definition.subjectTypes.includes(document.type)) continue;
      if (!definition.valueKinds.includes(fact.value.kind)) continue;
      if (!definition.allowsValidityBounds && (fact.validFrom || fact.validTo)) {
        continue;
      }
      if ((fact.canon ?? document.canon) === "retired") continue;
      if (fact.value.kind === "note") {
        const targets = catalog.documentsById.get(fact.value.id) ?? [];
        if (targets.length !== 1) continue;
        const target = targets[0]!;
        if (
          definition.targetTypes &&
          (!target.type || !definition.targetTypes.includes(target.type))
        ) {
          continue;
        }
      }
      values.push({ document, fact, definition });
    }
  }
  return values.sort(
    (left, right) =>
      compareText(left.document.path, right.document.path) ||
      left.fact.range.start - right.fact.range.start ||
      compareText(left.fact.id, right.fact.id),
  );
}

function overlapComponents(
  values: readonly UsableFact[],
  calendars: readonly TimelineCalendar[],
): UsableFact[][] {
  const neighbors = values.map(() => new Set<number>());
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      if (definitelySeparated(values[left]!.fact, values[right]!.fact, calendars)) {
        continue;
      }
      neighbors[left]!.add(right);
      neighbors[right]!.add(left);
    }
  }
  const seen = new Set<number>();
  const result: UsableFact[][] = [];
  for (let start = 0; start < values.length; start += 1) {
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
    result.push(indexes.map((index) => values[index]!));
  }
  return result;
}

function definitelySeparated(
  first: ParsedContinuityFact,
  second: ParsedContinuityFact,
  calendars: readonly TimelineCalendar[],
): boolean {
  return (
    boundaryBefore(first.validTo, second.validFrom, calendars) ||
    boundaryBefore(second.validTo, first.validFrom, calendars)
  );
}

function boundaryBefore(
  end: ParsedContinuityFact["validTo"],
  start: ParsedContinuityFact["validFrom"],
  calendars: readonly TimelineCalendar[],
): boolean {
  if (!end || !start) return false;
  const normalizedEnd = normalizeTimelineExpression(
    end.calendar,
    end.expression,
    calendars,
  );
  const normalizedStart = normalizeTimelineExpression(
    start.calendar,
    start.expression,
    calendars,
  );
  return (
    normalizedEnd.kind === "computable" &&
    normalizedStart.kind === "computable" &&
    normalizedEnd.range.axis === normalizedStart.range.axis &&
    normalizedEnd.range.latest < normalizedStart.range.earliest
  );
}

function toEvidence({ document, fact }: UsableFact): ContinuityReviewEvidence {
  return {
    stableId: `fact:${fact.id}`,
    role: fact.property,
    factId: fact.id,
    noteId: document.id,
    path: document.path,
    title: document.title,
    property: fact.property,
    sourceFingerprint: document.fingerprint,
    sourceRange: fact.range,
    effectiveCanon: fact.canon ?? document.canon,
    certainty: fact.certainty,
  };
}

function createCatalog(index: LoreProjectIndex): RuleCatalog {
  const documentsById = new Map<string, LoreDocumentRecord[]>();
  for (const document of index.documents.values()) {
    if (!document.id) continue;
    const values = documentsById.get(document.id) ?? [];
    values.push(document);
    documentsById.set(document.id, values);
  }
  return {
    documentsById,
    duplicateFactIds: new Set(
      index.issues
        .filter(({ kind }) => kind === "duplicate-continuity-fact-id")
        .map(({ id }) => id),
    ),
  };
}

function stableFactIds(evidence: readonly ContinuityReviewEvidence[]): string[] {
  return [...new Set(evidence.map(({ stableId }) => stableId))].sort(compareText);
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

function compareFindings(
  left: ContinuityReviewFinding,
  right: ContinuityReviewFinding,
): number {
  return (
    compareText(left.ruleId, right.ruleId) ||
    compareEvidence(left.evidence[0]!, right.evidence[0]!) ||
    compareText(left.id, right.id)
  );
}

function groupBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const valuesForKey = result.get(key(value)) ?? [];
    valuesForKey.push(value);
    result.set(key(value), valuesForKey);
  }
  return result;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
