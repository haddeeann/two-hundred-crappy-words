import type { ContinuityException } from "./format";
import { exceptionMatchKey } from "./format";
import type { ContinuityReviewFinding } from "./types";

export type StaleContinuityExceptionReason =
  | "rule-version-changed"
  | "evidence-changed"
  | "evidence-unavailable"
  | "finding-unavailable"
  | "finding-ineligible";

export interface IntentionalContinuityFinding {
  finding: ContinuityReviewFinding;
  exception: ContinuityException;
}

export interface StaleContinuityException {
  exception: ContinuityException;
  reason: StaleContinuityExceptionReason;
  explanation: string;
}

export interface MatchedContinuityExceptions {
  activeFindings: readonly ContinuityReviewFinding[];
  intentionalFindings: readonly IntentionalContinuityFinding[];
  staleExceptions: readonly StaleContinuityException[];
}

export function matchContinuityExceptions(
  findings: readonly ContinuityReviewFinding[],
  exceptions: readonly ContinuityException[],
): MatchedContinuityExceptions {
  const findingByKey = new Map<string, ContinuityReviewFinding>();
  const allEvidenceIds = new Set<string>();
  for (const finding of findings) {
    findingByKey.set(findingMatchKey(finding), finding);
    for (const evidence of finding.evidence) allEvidenceIds.add(evidence.stableId);
  }

  const matchedFindingIds = new Set<string>();
  const intentionalFindings: IntentionalContinuityFinding[] = [];
  const staleExceptions: StaleContinuityException[] = [];
  for (const exception of exceptions) {
    const exact = findingByKey.get(
      exceptionMatchKey(exception.ruleId, exception.ruleVersion, exception.evidenceIds),
    );
    if (exact && (exact.severity === "review" || exact.severity === "contradiction")) {
      matchedFindingIds.add(exact.id);
      intentionalFindings.push({ finding: exact, exception });
      continue;
    }
    const reason = staleReason(exception, findings, allEvidenceIds, exact);
    staleExceptions.push({
      exception,
      reason,
      explanation: staleReasonExplanation(reason),
    });
  }

  return {
    activeFindings: findings.filter((finding) => !matchedFindingIds.has(finding.id)),
    intentionalFindings,
    staleExceptions,
  };
}

function staleReason(
  exception: ContinuityException,
  findings: readonly ContinuityReviewFinding[],
  allEvidenceIds: ReadonlySet<string>,
  exact: ContinuityReviewFinding | undefined,
): StaleContinuityExceptionReason {
  if (exact) return "finding-ineligible";
  const exceptionEvidenceKey = sortedIdentityKey(exception.evidenceIds);
  if (findings.some(
    (finding) =>
      finding.ruleId === exception.ruleId &&
      finding.ruleVersion !== exception.ruleVersion &&
      sortedIdentityKey(finding.evidence.map(({ stableId }) => stableId)) === exceptionEvidenceKey,
  )) {
    return "rule-version-changed";
  }
  if (exception.evidenceIds.some((evidenceId) => !allEvidenceIds.has(evidenceId))) {
    return "evidence-unavailable";
  }
  if (findings.some(
    (finding) =>
      finding.ruleId === exception.ruleId &&
      finding.ruleVersion === exception.ruleVersion &&
      finding.evidence.some(({ stableId }) => exception.evidenceIds.includes(stableId)),
  )) {
    return "evidence-changed";
  }
  return "finding-unavailable";
}

function staleReasonExplanation(reason: StaleContinuityExceptionReason): string {
  switch (reason) {
    case "rule-version-changed":
      return "The same evidence is now evaluated by a different rule version. Review it before deciding whether a new exception is appropriate.";
    case "evidence-changed":
      return "A finding from this rule now uses a different evidence set. The old exception was not silently retargeted.";
    case "evidence-unavailable":
      return "At least one saved evidence identity is no longer present in the current review findings.";
    case "finding-ineligible":
      return "The exact finding is now Information, which is not eligible for an intentional exception.";
    case "finding-unavailable":
      return "No current eligible finding has this exact rule, version, and evidence identity tuple.";
  }
}

function findingMatchKey(finding: ContinuityReviewFinding): string {
  return exceptionMatchKey(
    finding.ruleId,
    finding.ruleVersion,
    finding.evidence.map(({ stableId }) => stableId),
  );
}

function sortedIdentityKey(identities: readonly string[]): string {
  return JSON.stringify([...identities].sort((a, b) => a.localeCompare(b)));
}
