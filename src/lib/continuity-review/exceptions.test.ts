import { describe, expect, it } from "vitest";

import type { ContinuityException } from "./format";
import { matchContinuityExceptions } from "./exceptions";
import type { ContinuityReviewSeverity } from "./policy";
import type { ContinuityReviewFinding } from "./types";

const FIRST_FACT = "fact:1c91608d-e09a-4538-aae0-92fe2a28f0a4";
const SECOND_FACT = "fact:86e1392b-79ef-4a61-9553-52699b7eeaa8";
const THIRD_FACT = "fact:f61ae770-5358-4727-93bf-c41ca02837e7";

function finding(
  overrides: Partial<ContinuityReviewFinding> = {},
): ContinuityReviewFinding {
  const severity: ContinuityReviewSeverity = overrides.severity ?? "contradiction";
  return {
    id: "finding:one",
    ruleId: "timeline.lifespan.order",
    ruleVersion: 1,
    family: "timeline-lifespan",
    severity,
    summary: "Death is before birth",
    explanation: "Exact evidence does not overlap.",
    subjectNoteIds: [],
    evidence: [FIRST_FACT, SECOND_FACT].map((stableId) => ({
      stableId,
      role: "time",
      factId: stableId.slice("fact:".length),
      noteId: null,
      path: "Characters/Ari.md",
      title: "Ari",
      property: "born",
      sourceFingerprint: "1:a",
      sourceRange: {
        start: 0,
        end: 1,
        line: 1,
        column: 1,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 2,
      },
      effectiveCanon: "canon",
      certainty: "exact",
    })),
    ...overrides,
  };
}

function exception(overrides: Partial<ContinuityException> = {}): ContinuityException {
  return {
    id: "6d2434f0-39df-4d76-bb0e-a69b4f939a6e",
    ruleId: "timeline.lifespan.order",
    ruleVersion: 1,
    evidenceIds: [FIRST_FACT, SECOND_FACT],
    explanation: "Intentional nonlinear rebirth.",
    ...overrides,
  };
}

describe("continuity exception matching", () => {
  it("moves only an exact eligible tuple from active to intentional", () => {
    const other = finding({ id: "finding:other", ruleId: "timeline.appearance.before-birth" });
    expect(matchContinuityExceptions([finding(), other], [exception()])).toEqual({
      activeFindings: [other],
      intentionalFindings: [{ finding: finding(), exception: exception() }],
      staleExceptions: [],
    });
  });

  it("does not depend on finding evidence order", () => {
    const reversed = finding({ evidence: [...finding().evidence].reverse() });
    expect(matchContinuityExceptions([reversed], [exception()]).intentionalFindings).toHaveLength(1);
  });

  it("keeps an exact Information finding active and marks its exception stale", () => {
    const information = finding({ severity: "information" });
    expect(matchContinuityExceptions([information], [exception()])).toMatchObject({
      activeFindings: [information],
      intentionalFindings: [],
      staleExceptions: [{ reason: "finding-ineligible" }],
    });
  });

  it("distinguishes changed rule versions from changed evidence", () => {
    const versionChanged = finding({ ruleVersion: 2 });
    expect(matchContinuityExceptions([versionChanged], [exception()]).staleExceptions).toMatchObject([
      { reason: "rule-version-changed" },
    ]);

    const evidenceChanged = finding({
      id: "finding:changed",
      evidence: [finding().evidence[1]!, { ...finding().evidence[0]!, stableId: THIRD_FACT }],
    });
    const saved = exception({ evidenceIds: [FIRST_FACT, THIRD_FACT] });
    expect(matchContinuityExceptions([finding(), evidenceChanged], [saved]).staleExceptions).toMatchObject([
      { reason: "evidence-changed" },
    ]);
  });

  it("distinguishes disappeared evidence from an unavailable finding", () => {
    const disappeared = exception({ evidenceIds: [FIRST_FACT, THIRD_FACT] });
    expect(matchContinuityExceptions([finding()], [disappeared]).staleExceptions).toMatchObject([
      { reason: "evidence-unavailable" },
    ]);
    const unrelatedRule = exception({ ruleId: "relationship.parent-cycle" });
    expect(matchContinuityExceptions([finding()], [unrelatedRule]).staleExceptions).toMatchObject([
      { reason: "finding-unavailable" },
    ]);
  });

  it("preserves deterministic finding and file order", () => {
    const first = finding({ id: "finding:first" });
    const second = finding({ id: "finding:second", ruleId: "relationship.parent-cycle" });
    const staleOne = exception({ id: "56e1c854-5326-4d8f-ad17-d1950703421c", ruleId: "missing.one" });
    const staleTwo = exception({ id: "fd5c5fbb-ad37-44ca-a91d-c8b063c4380b", ruleId: "missing.two" });
    const result = matchContinuityExceptions([first, second], [staleOne, exception(), staleTwo]);
    expect(result.activeFindings).toEqual([second]);
    expect(result.intentionalFindings.map(({ finding }) => finding.id)).toEqual(["finding:first"]);
    expect(result.staleExceptions.map(({ exception }) => exception.id)).toEqual([
      staleOne.id,
      staleTwo.id,
    ]);
  });
});
