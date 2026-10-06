import type {
  CanonStatus,
  ContinuityCertainty,
  SourceRange,
} from "$lib/lore/types";
import type { ContinuityReviewSeverity } from "./policy";

export interface ContinuityReviewEvidence {
  stableId: string;
  role: string;
  factId: string | null;
  noteId: string | null;
  path: string;
  title: string;
  property: string | null;
  sourceFingerprint: string;
  sourceRange: SourceRange;
  effectiveCanon: CanonStatus | null;
  certainty: ContinuityCertainty | null;
}

export interface ContinuityReviewFinding {
  id: string;
  ruleId: string;
  ruleVersion: number;
  family:
    | "relationship"
    | "travel-presence"
    | "timeline-appearance"
    | "travel-arrival"
    | "continuity-property"
    | "timeline-lifespan";
  severity: ContinuityReviewSeverity;
  summary: string;
  explanation: string;
  subjectNoteIds: readonly string[];
  evidence: readonly ContinuityReviewEvidence[];
}

export interface ContinuitySourceProblem {
  id: string;
  family: "metadata" | "identity" | "reference" | "timeline";
  summary: string;
  explanation: string;
  subjectNoteIds: readonly string[];
  evidence: readonly ContinuityReviewEvidence[];
}

export type ContinuityReviewScope =
  | { kind: "whole-world" }
  | { kind: "manuscript"; manuscriptId: string };

export interface ContinuityReviewModel {
  generation: number;
  scope: ContinuityReviewScope;
  findings: readonly ContinuityReviewFinding[];
  omittedFindingCount: number;
  sourceProblems: readonly ContinuitySourceProblem[];
  omittedSourceProblemCount: number;
}
