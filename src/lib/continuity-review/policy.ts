import type { CanonStatus, ContinuityCertainty } from "$lib/lore/types";

export type ContinuityReviewSeverity =
  | "information"
  | "review"
  | "contradiction";

export interface ContinuityReviewStrength {
  effectiveCanon: CanonStatus | null;
  certainty: ContinuityCertainty | null;
}

export function includesRetiredEvidence(
  evidence: readonly ContinuityReviewStrength[],
): boolean {
  return evidence.some(({ effectiveCanon }) => effectiveCanon === "retired");
}

export function evidenceSupportsContradiction(
  evidence: readonly ContinuityReviewStrength[],
): boolean {
  return (
    evidence.length > 0 &&
    evidence.every(
      ({ effectiveCanon, certainty }) =>
        effectiveCanon === "canon" && certainty === "exact",
    )
  );
}

export function applyContinuitySeverityGate(
  requested: ContinuityReviewSeverity,
  evidence: readonly ContinuityReviewStrength[],
): ContinuityReviewSeverity | null {
  if (includesRetiredEvidence(evidence)) return null;
  if (requested !== "contradiction") return requested;
  return evidenceSupportsContradiction(evidence) ? "contradiction" : "review";
}
