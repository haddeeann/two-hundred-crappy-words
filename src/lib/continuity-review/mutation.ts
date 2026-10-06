import { fingerprintContent } from "$lib/editor/recovery";
import {
  CONTINUITY_REVIEW_FORMAT,
  CONTINUITY_REVIEW_FORMAT_VERSION,
  parseContinuityReviewProject,
  type ContinuityReviewFormatIssue,
} from "./format";

export type ContinuityExceptionMutationRequest =
  | {
      kind: "add-exception";
      exceptionId: string;
      severity: "review" | "contradiction";
      ruleId: string;
      ruleVersion: number;
      evidenceIds: string[];
      explanation: string;
    }
  | {
      kind: "update-explanation";
      exceptionId: string;
      explanation: string;
    }
  | { kind: "remove-exception"; exceptionId: string };

export type ContinuityExceptionMutationPlan =
  | { kind: "unavailable"; reason: string }
  | { kind: "blocked"; issues: ContinuityReviewFormatIssue[] }
  | { kind: "unchanged"; summary: string }
  | {
      kind: "ready";
      operation: ContinuityExceptionMutationRequest["kind"];
      request: ContinuityExceptionMutationRequest;
      projectId: string;
      summary: string;
      originalText: string | null;
      originalFingerprint: string | null;
      updatedText: string;
      updatedFingerprint: string;
    };

export function planContinuityExceptionMutation(
  originalText: string | null,
  expectedProjectId: string,
  request: ContinuityExceptionMutationRequest,
): ContinuityExceptionMutationPlan {
  let source: Record<string, unknown>;
  if (originalText === null) {
    if (request.kind !== "add-exception") {
      return unavailable("The optional exception file does not exist, so there is no saved exception to change.");
    }
    source = {
      format: CONTINUITY_REVIEW_FORMAT,
      formatVersion: CONTINUITY_REVIEW_FORMAT_VERSION,
      projectId: expectedProjectId,
      exceptions: [],
    };
  } else {
    const parsed = parseContinuityReviewProject(originalText);
    if (parsed.kind === "malformed") {
      return unavailable(`The intentional-exception file is not valid JSON: ${parsed.message}`);
    }
    if (parsed.kind === "unsupported-version") {
      return unavailable(`The intentional-exception file uses unsupported version ${parsed.version}.`);
    }
    if (parsed.kind === "invalid") return { kind: "blocked", issues: parsed.issues };
    if (parsed.continuityReviewProject.projectId !== expectedProjectId) {
      return unavailable("The intentional-exception file belongs to a different world project.");
    }
    source = cloneRecord(parsed.source);
  }

  if (!Array.isArray(source.exceptions)) {
    return unavailable("The source exception array is unavailable.");
  }
  const summary = applyMutation(source.exceptions, request);
  if (summary.kind !== "applied") return summary;

  const updatedText = `${JSON.stringify(source, null, 2)}\n`;
  if (updatedText === originalText) return { kind: "unchanged", summary: summary.summary };
  const verified = parseContinuityReviewProject(updatedText);
  if (verified.kind !== "valid") {
    if (verified.kind === "invalid") return { kind: "blocked", issues: verified.issues };
    return unavailable(
      verified.kind === "malformed"
        ? `The proposed intentional-exception JSON is malformed: ${verified.message}`
        : `The proposed intentional-exception JSON uses unsupported version ${verified.version}.`,
    );
  }
  if (verified.continuityReviewProject.projectId !== expectedProjectId) {
    return unavailable("The proposed intentional-exception file no longer matches this world project.");
  }

  return {
    kind: "ready",
    operation: request.kind,
    request: cloneJson(request),
    projectId: expectedProjectId,
    summary: summary.summary,
    originalText,
    originalFingerprint: originalText === null ? null : fingerprintContent(originalText),
    updatedText,
    updatedFingerprint: fingerprintContent(updatedText),
  };
}

function applyMutation(
  exceptions: unknown[],
  request: ContinuityExceptionMutationRequest,
):
  | { kind: "applied"; summary: string }
  | Exclude<ContinuityExceptionMutationPlan, { kind: "ready" }> {
  if (request.kind === "add-exception") {
    if (exceptions.some((value) => isRecord(value) && value.id === request.exceptionId)) {
      return unavailable("An intentional exception already uses that stable ID.");
    }
    exceptions.push({
      id: request.exceptionId,
      ruleId: request.ruleId,
      ruleVersion: request.ruleVersion,
      evidenceIds: [...request.evidenceIds].sort((a, b) => a.localeCompare(b)),
      explanation: request.explanation.trim(),
    });
    return {
      kind: "applied",
      summary: `Mark the ${request.severity} finding from ${request.ruleId} intentional.`,
    };
  }

  const index = exceptions.findIndex(
    (value) => isRecord(value) && value.id === request.exceptionId,
  );
  if (index < 0) {
    return unavailable("That intentional exception is no longer present in the verified project file.");
  }
  const exception = exceptions[index];
  if (!isRecord(exception)) return unavailable("That intentional exception source is unavailable.");

  if (request.kind === "remove-exception") {
    const ruleId = typeof exception.ruleId === "string" ? exception.ruleId : request.exceptionId;
    exceptions.splice(index, 1);
    return { kind: "applied", summary: `Remove the intentional exception for ${ruleId}.` };
  }

  const explanation = request.explanation.trim();
  if (exception.explanation === explanation) {
    return { kind: "unchanged", summary: "The writer explanation is already unchanged." };
  }
  exception.explanation = explanation;
  return { kind: "applied", summary: "Update the intentional exception's writer explanation." };
}

function unavailable(
  reason: string,
): Extract<ContinuityExceptionMutationPlan, { kind: "unavailable" }> {
  return { kind: "unavailable", reason };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return cloneJson(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
