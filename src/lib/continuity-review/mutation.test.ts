import { describe, expect, it } from "vitest";

import {
  CONTINUITY_REVIEW_FORMAT,
  parseContinuityReviewProject,
} from "./format";
import {
  planContinuityExceptionMutation,
  type ContinuityExceptionMutationRequest,
} from "./mutation";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const OTHER_PROJECT_ID = "aef84aa7-fd7d-42de-9c94-6df548a6471f";
const EXCEPTION_ID = "6d2434f0-39df-4d76-bb0e-a69b4f939a6e";
const OTHER_EXCEPTION_ID = "fc1ff0cf-b917-4e19-90c4-728827176e74";
const FIRST_FACT = "fact:1c91608d-e09a-4538-aae0-92fe2a28f0a4";
const SECOND_FACT = "fact:86e1392b-79ef-4a61-9553-52699b7eeaa8";
const THIRD_FACT = "fact:f61ae770-5358-4727-93bf-c41ca02837e7";

const addRequest: ContinuityExceptionMutationRequest = {
  kind: "add-exception",
  exceptionId: EXCEPTION_ID,
  severity: "contradiction",
  ruleId: "timeline.lifespan.order",
  ruleVersion: 1,
  evidenceIds: [SECOND_FACT, FIRST_FACT],
  explanation: "  Intentional nonlinear history.  ",
};

function source(overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    format: CONTINUITY_REVIEW_FORMAT,
    formatVersion: 1,
    projectId: PROJECT_ID,
    exceptions: [{
      id: EXCEPTION_ID,
      ruleId: "timeline.lifespan.order",
      ruleVersion: 1,
      evidenceIds: [FIRST_FACT, SECOND_FACT],
      explanation: "Intentional nonlinear history.",
      futureException: { retained: true },
    }],
    futureRoot: ["kept"],
    ...overrides,
  }, null, 2)}\n`;
}

describe("guarded continuity-exception mutation planning", () => {
  it("creates the optional file only while marking an eligible finding intentional", () => {
    const plan = planContinuityExceptionMutation(null, PROJECT_ID, addRequest);
    expect(plan).toMatchObject({
      kind: "ready",
      operation: "add-exception",
      originalText: null,
      originalFingerprint: null,
      summary: "Mark the contradiction finding from timeline.lifespan.order intentional.",
    });
    if (plan.kind !== "ready") return;
    expect(parseContinuityReviewProject(plan.updatedText)).toMatchObject({
      kind: "valid",
      continuityReviewProject: {
        exceptions: [{
          evidenceIds: [FIRST_FACT, SECOND_FACT],
          explanation: "Intentional nonlinear history.",
        }],
      },
    });
  });

  it("refuses edit or remove work while the optional file is absent", () => {
    expect(planContinuityExceptionMutation(null, PROJECT_ID, {
      kind: "update-explanation",
      exceptionId: EXCEPTION_ID,
      explanation: "Changed.",
    })).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("does not exist") });
    expect(planContinuityExceptionMutation(null, PROJECT_ID, {
      kind: "remove-exception",
      exceptionId: EXCEPTION_ID,
    })).toMatchObject({ kind: "unavailable" });
  });

  it("updates only the explanation and preserves supported-version unknown fields", () => {
    const plan = planContinuityExceptionMutation(source(), PROJECT_ID, {
      kind: "update-explanation",
      exceptionId: EXCEPTION_ID,
      explanation: "  A revised writer explanation.  ",
    });
    expect(plan).toMatchObject({ kind: "ready", operation: "update-explanation" });
    if (plan.kind !== "ready") return;
    expect(JSON.parse(plan.updatedText)).toMatchObject({
      futureRoot: ["kept"],
      exceptions: [{
        explanation: "A revised writer explanation.",
        futureException: { retained: true },
      }],
    });
  });

  it("removes only the requested exception", () => {
    const value = JSON.parse(source());
    value.exceptions.push({
      ...structuredClone(value.exceptions[0]),
      id: OTHER_EXCEPTION_ID,
      ruleId: "relationship.parent-cycle",
    });
    const plan = planContinuityExceptionMutation(`${JSON.stringify(value, null, 2)}\n`, PROJECT_ID, {
      kind: "remove-exception",
      exceptionId: EXCEPTION_ID,
    });
    expect(plan).toMatchObject({ kind: "ready", summary: expect.stringContaining("timeline.lifespan.order") });
    if (plan.kind !== "ready") return;
    expect(JSON.parse(plan.updatedText).exceptions).toEqual([value.exceptions[1]]);
  });

  it("freezes reactive-proxy-shaped requests through the JSON data boundary", () => {
    const request = new Proxy({
      ...addRequest,
      exceptionId: OTHER_EXCEPTION_ID,
      evidenceIds: [THIRD_FACT],
    }, {}) as ContinuityExceptionMutationRequest;
    expect(() => structuredClone(request)).toThrow();
    expect(planContinuityExceptionMutation(source(), PROJECT_ID, request)).toMatchObject({
      kind: "ready",
      request: { exceptionId: OTHER_EXCEPTION_ID },
    });
  });

  it("refuses mismatched, malformed, invalid, missing, duplicate, and invalid proposed work", () => {
    expect(planContinuityExceptionMutation(source({ projectId: OTHER_PROJECT_ID }), PROJECT_ID, {
      kind: "remove-exception",
      exceptionId: EXCEPTION_ID,
    })).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("different world") });
    expect(planContinuityExceptionMutation("{", PROJECT_ID, {
      kind: "remove-exception",
      exceptionId: EXCEPTION_ID,
    })).toMatchObject({ kind: "unavailable" });
    expect(planContinuityExceptionMutation(source({ format: "wrong" }), PROJECT_ID, {
      kind: "remove-exception",
      exceptionId: EXCEPTION_ID,
    })).toMatchObject({ kind: "blocked" });
    expect(planContinuityExceptionMutation(source(), PROJECT_ID, {
      kind: "remove-exception",
      exceptionId: OTHER_EXCEPTION_ID,
    })).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("no longer present") });
    expect(planContinuityExceptionMutation(source(), PROJECT_ID, addRequest)).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("stable ID"),
    });
    expect(planContinuityExceptionMutation(source(), PROJECT_ID, {
      ...addRequest,
      exceptionId: OTHER_EXCEPTION_ID,
    })).toMatchObject({
      kind: "blocked",
      issues: expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("Duplicate rule/version/evidence tuple") }),
      ]),
    });
    expect(planContinuityExceptionMutation(source(), PROJECT_ID, {
      kind: "update-explanation",
      exceptionId: EXCEPTION_ID,
      explanation: "   ",
    })).toMatchObject({ kind: "blocked" });
  });

  it("reports unchanged explanations without manufacturing consent", () => {
    expect(planContinuityExceptionMutation(source(), PROJECT_ID, {
      kind: "update-explanation",
      exceptionId: EXCEPTION_ID,
      explanation: "  Intentional nonlinear history. ",
    })).toEqual({
      kind: "unchanged",
      summary: "The writer explanation is already unchanged.",
    });
  });
});
