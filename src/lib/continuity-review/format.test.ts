import { describe, expect, it } from "vitest";

import {
  CONTINUITY_REVIEW_FILE,
  CONTINUITY_REVIEW_FORMAT,
  MAX_CONTINUITY_EXCEPTIONS,
  MAX_CONTINUITY_EXCEPTION_EVIDENCE,
  MAX_CONTINUITY_EXCEPTION_EXPLANATION_CODE_POINTS,
  MAX_CONTINUITY_REVIEW_BYTES,
  MAX_CONTINUITY_REVIEW_FORMAT_ISSUES,
  exceptionMatchKey,
  parseContinuityReviewProject,
} from "./format";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const EXCEPTION_ID = "6d2434f0-39df-4d76-bb0e-a69b4f939a6e";
const FIRST_FACT = "fact:1c91608d-e09a-4538-aae0-92fe2a28f0a4";
const SECOND_FACT = "fact:86e1392b-79ef-4a61-9553-52699b7eeaa8";

function validValue(overrides: Record<string, unknown> = {}) {
  return {
    format: CONTINUITY_REVIEW_FORMAT,
    formatVersion: 1,
    projectId: PROJECT_ID,
    exceptions: [
      {
        id: EXCEPTION_ID,
        ruleId: "timeline.lifespan.order",
        ruleVersion: 1,
        evidenceIds: [FIRST_FACT, SECOND_FACT],
        explanation: "The character is reborn backward through the local timeline.",
      },
    ],
    ...overrides,
  };
}

describe("portable continuity-review project", () => {
  it("uses the approved root filename and exact portable fields", () => {
    expect(CONTINUITY_REVIEW_FILE).toBe("200-crappy-words.continuity-review.json");
    expect(parseContinuityReviewProject(JSON.stringify(validValue()))).toMatchObject({
      kind: "valid",
      continuityReviewProject: {
        format: CONTINUITY_REVIEW_FORMAT,
        projectId: PROJECT_ID,
        exceptions: [{
          id: EXCEPTION_ID,
          ruleId: "timeline.lifespan.order",
          ruleVersion: 1,
          evidenceIds: [FIRST_FACT, SECOND_FACT],
        }],
      },
    });
  });

  it("deep-clones unknown supported-version fields", () => {
    const original = validValue({ extension: { owner: "writer" } }) as ReturnType<typeof validValue> & {
      extension: { owner: string };
      exceptions: Array<Record<string, unknown>>;
    };
    original.exceptions[0]!.future = { retained: true };
    const result = parseContinuityReviewProject(JSON.stringify(original));
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;
    original.extension.owner = "changed";
    expect(result.source).toMatchObject({
      extension: { owner: "writer" },
      exceptions: [{ future: { retained: true } }],
    });
  });

  it("separates malformed, invalid, and unsupported versions", () => {
    expect(parseContinuityReviewProject("{")).toMatchObject({ kind: "malformed" });
    expect(parseContinuityReviewProject("[]")).toMatchObject({ kind: "invalid" });
    expect(parseContinuityReviewProject(JSON.stringify({ formatVersion: 2 }))).toEqual({
      kind: "unsupported-version",
      version: 2,
    });
  });

  it("requires canonical unique exception identities and exact match tuples", () => {
    const duplicateId = validValue();
    duplicateId.exceptions.push(structuredClone(duplicateId.exceptions[0]!));
    const idResult = parseContinuityReviewProject(JSON.stringify(duplicateId));
    expect(idResult).toMatchObject({ kind: "invalid" });
    if (idResult.kind === "invalid") {
      expect(idResult.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("Duplicate exception id") }),
        expect.objectContaining({ message: expect.stringContaining("Duplicate rule/version/evidence tuple") }),
      ]));
    }

    const duplicateTuple = validValue();
    duplicateTuple.exceptions.push({
      ...structuredClone(duplicateTuple.exceptions[0]!),
      id: "fc1ff0cf-b917-4e19-90c4-728827176e74",
    });
    expect(parseContinuityReviewProject(JSON.stringify(duplicateTuple))).toMatchObject({
      kind: "invalid",
      issues: expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("Duplicate rule/version/evidence tuple") }),
      ]),
    });
  });

  it("requires bounded rule identity and a positive rule version", () => {
    for (const ruleId of ["Timeline.Lifespan", "timeline lifespan", ".timeline", "timeline."]) {
      const value = validValue();
      value.exceptions[0]!.ruleId = ruleId;
      expect(parseContinuityReviewProject(JSON.stringify(value))).toMatchObject({ kind: "invalid" });
    }
    const value = validValue();
    value.exceptions[0]!.ruleVersion = 0;
    expect(parseContinuityReviewProject(JSON.stringify(value))).toMatchObject({ kind: "invalid" });
  });

  it("requires bounded, sorted, unique, namespaced stable evidence identities", () => {
    for (const evidenceIds of [
      [],
      [SECOND_FACT, FIRST_FACT],
      [FIRST_FACT, FIRST_FACT],
      ["fact:not-a-uuid"],
      ["Fact:1c91608d-e09a-4538-aae0-92fe2a28f0a4"],
      Array.from({ length: MAX_CONTINUITY_EXCEPTION_EVIDENCE + 1 }, () => FIRST_FACT),
    ]) {
      const value = validValue();
      value.exceptions[0]!.evidenceIds = evidenceIds;
      expect(parseContinuityReviewProject(JSON.stringify(value))).toMatchObject({ kind: "invalid" });
    }
  });

  it("requires a bounded nonblank explanation while allowing line breaks and tabs", () => {
    for (const explanation of ["   ", "contains\u0000control", "x".repeat(MAX_CONTINUITY_EXCEPTION_EXPLANATION_CODE_POINTS + 1)]) {
      const value = validValue();
      value.exceptions[0]!.explanation = explanation;
      expect(parseContinuityReviewProject(JSON.stringify(value))).toMatchObject({ kind: "invalid" });
    }
    const value = validValue();
    value.exceptions[0]!.explanation = "First line.\n\tSecond line.";
    expect(parseContinuityReviewProject(JSON.stringify(value))).toMatchObject({ kind: "valid" });
  });

  it("caps exception entries and reports how many were not inspected", () => {
    const exceptions = Array.from({ length: MAX_CONTINUITY_EXCEPTIONS + 4 }, (_, index) => ({
      ...structuredClone(validValue().exceptions[0]!),
      id: index === 0 ? EXCEPTION_ID : "invalid",
    }));
    const result = parseContinuityReviewProject(JSON.stringify(validValue({ exceptions })));
    expect(result).toMatchObject({ kind: "invalid" });
    if (result.kind !== "invalid") return;
    expect(result.issues[0]).toMatchObject({ message: expect.stringContaining("4 additional entries were not inspected") });
    expect(result.issues.length).toBe(MAX_CONTINUITY_REVIEW_FORMAT_ISSUES + 1);
    expect(result.issues.at(-1)?.message).toContain("omitted");
  });

  it("refuses JSON beyond the approved byte boundary before parsing", () => {
    const result = parseContinuityReviewProject(`{"padding":"${"x".repeat(MAX_CONTINUITY_REVIEW_BYTES)}"}`);
    expect(result).toMatchObject({
      kind: "invalid",
      issues: [{ message: expect.stringContaining("must not exceed") }],
    });
  });

  it("derives a canonical key without depending on evidence input order", () => {
    expect(exceptionMatchKey("timeline.lifespan.order", 1, [SECOND_FACT, FIRST_FACT])).toBe(
      exceptionMatchKey("timeline.lifespan.order", 1, [FIRST_FACT, SECOND_FACT]),
    );
  });
});
