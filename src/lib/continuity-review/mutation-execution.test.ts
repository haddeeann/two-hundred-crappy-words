import { describe, expect, it } from "vitest";

import { fingerprintContent } from "$lib/editor/recovery";
import { CONTINUITY_REVIEW_FORMAT, parseContinuityReviewProject } from "./format";
import type { ContinuityReviewProjectLoadResult } from "./load";
import {
  executeContinuityExceptionMutation,
  undoContinuityExceptionMutation,
  type ContinuityExceptionMutationIo,
} from "./mutation-execution";
import {
  planContinuityExceptionMutation,
  type ContinuityExceptionMutationRequest,
} from "./mutation";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const EXCEPTION_ID = "6d2434f0-39df-4d76-bb0e-a69b4f939a6e";
const EVIDENCE_ID = "fact:1c91608d-e09a-4538-aae0-92fe2a28f0a4";

const addRequest: ContinuityExceptionMutationRequest = {
  kind: "add-exception",
  exceptionId: EXCEPTION_ID,
  severity: "contradiction",
  ruleId: "timeline.lifespan.order",
  ruleVersion: 1,
  evidenceIds: [EVIDENCE_ID],
  explanation: "Intentional nonlinear history.",
};

function source(explanation = "Intentional nonlinear history."): string {
  return `${JSON.stringify({
    format: CONTINUITY_REVIEW_FORMAT,
    formatVersion: 1,
    projectId: PROJECT_ID,
    exceptions: [{
      id: EXCEPTION_ID,
      ruleId: "timeline.lifespan.order",
      ruleVersion: 1,
      evidenceIds: [EVIDENCE_ID],
      explanation,
    }],
  }, null, 2)}\n`;
}

function ready(
  text: string,
): Extract<ContinuityReviewProjectLoadResult, { kind: "ready" }> {
  const parsed = parseContinuityReviewProject(text);
  if (parsed.kind !== "valid") throw new Error("invalid fixture");
  return {
    kind: "ready",
    fingerprint: fingerprintContent(text),
    text,
    source: parsed.source,
    continuityReviewProject: parsed.continuityReviewProject,
  };
}

function memoryIo(initial: string | null): ContinuityExceptionMutationIo & {
  current(): string | null;
  external(text: string | null): void;
} {
  let text = initial;
  return {
    current: () => text,
    external: (value) => { text = value; },
    async reload() { return text === null ? { kind: "absent" } : ready(text); },
    async createNew(value) {
      if (text !== null) throw new Error("collision");
      text = value;
    },
    async replaceAtomic(expected, value) {
      if (text !== expected) throw new Error("stale");
      text = value;
    },
    async removeCreated(expected) {
      if (text !== expected) throw new Error("stale");
      text = null;
    },
  };
}

describe("continuity-exception mutation execution", () => {
  it("creates, exactly rereads, and removes the first optional file through Undo", async () => {
    const plan = planContinuityExceptionMutation(null, PROJECT_ID, addRequest);
    if (plan.kind !== "ready") throw new Error("fixture");
    const io = memoryIo(null);
    const applied = await executeContinuityExceptionMutation(plan, addRequest, io);
    expect(applied).toMatchObject({ kind: "applied", project: { text: plan.updatedText } });
    if (applied.kind !== "applied") return;
    await expect(undoContinuityExceptionMutation(applied.undo, io)).resolves.toEqual({
      kind: "undone",
      project: { kind: "absent" },
    });
    expect(io.current()).toBeNull();
  });

  it("replaces and restores an existing file exactly", async () => {
    const original = source();
    const request: ContinuityExceptionMutationRequest = {
      kind: "update-explanation",
      exceptionId: EXCEPTION_ID,
      explanation: "A deliberate contradiction.",
    };
    const plan = planContinuityExceptionMutation(original, PROJECT_ID, request);
    if (plan.kind !== "ready") throw new Error("fixture");
    const io = memoryIo(original);
    const applied = await executeContinuityExceptionMutation(plan, request, io);
    expect(applied).toMatchObject({ kind: "applied" });
    if (applied.kind !== "applied") return;
    await expect(undoContinuityExceptionMutation(applied.undo, io)).resolves.toMatchObject({
      kind: "undone",
    });
    expect(io.current()).toBe(original);
  });

  it("refuses a file that appears or changes after preview", async () => {
    const creation = planContinuityExceptionMutation(null, PROJECT_ID, addRequest);
    if (creation.kind !== "ready") throw new Error("fixture");
    await expect(
      executeContinuityExceptionMutation(creation, addRequest, memoryIo(source())),
    ).resolves.toMatchObject({ kind: "failed", message: expect.stringContaining("appeared") });

    const original = source();
    const request: ContinuityExceptionMutationRequest = {
      kind: "remove-exception",
      exceptionId: EXCEPTION_ID,
    };
    const removal = planContinuityExceptionMutation(original, PROJECT_ID, request);
    if (removal.kind !== "ready") throw new Error("fixture");
    await expect(
      executeContinuityExceptionMutation(removal, request, memoryIo(source("External"))),
    ).resolves.toMatchObject({
      kind: "failed",
      message: expect.stringContaining("changed after preview"),
    });
  });

  it("regenerates the request and refuses a different reviewed plan", async () => {
    const original = source();
    const request: ContinuityExceptionMutationRequest = {
      kind: "remove-exception",
      exceptionId: EXCEPTION_ID,
    };
    const plan = planContinuityExceptionMutation(original, PROJECT_ID, request);
    if (plan.kind !== "ready") throw new Error("fixture");
    const different: ContinuityExceptionMutationRequest = {
      kind: "update-explanation",
      exceptionId: EXCEPTION_ID,
      explanation: "Different request.",
    };
    await expect(
      executeContinuityExceptionMutation(plan, different, memoryIo(original)),
    ).resolves.toMatchObject({ kind: "failed", message: expect.stringContaining("no longer matches") });
  });

  it("refuses Undo after any external change", async () => {
    const original = source();
    const request: ContinuityExceptionMutationRequest = {
      kind: "remove-exception",
      exceptionId: EXCEPTION_ID,
    };
    const plan = planContinuityExceptionMutation(original, PROJECT_ID, request);
    if (plan.kind !== "ready") throw new Error("fixture");
    const io = memoryIo(original);
    const applied = await executeContinuityExceptionMutation(plan, request, io);
    if (applied.kind !== "applied") throw new Error("fixture");
    io.external(source("External after edit"));
    await expect(undoContinuityExceptionMutation(applied.undo, io)).resolves.toMatchObject({
      kind: "failed",
      message: expect.stringContaining("will not overwrite or remove"),
    });
  });
});
