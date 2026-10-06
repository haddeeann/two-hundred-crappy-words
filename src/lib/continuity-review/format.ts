import { validateProjectId } from "$lib/project/manifest";

export const CONTINUITY_REVIEW_FILE = "200-crappy-words.continuity-review.json";
export const CONTINUITY_REVIEW_FORMAT = "200-crappy-words/continuity-review";
export const CONTINUITY_REVIEW_FORMAT_VERSION = 1 as const;
export const MAX_CONTINUITY_REVIEW_BYTES = 5 * 1024 * 1024;
export const MAX_CONTINUITY_EXCEPTIONS = 1_000;
export const MAX_CONTINUITY_EXCEPTION_EVIDENCE = 256;
export const MAX_CONTINUITY_EXCEPTION_EXPLANATION_CODE_POINTS = 10_000;
export const MAX_CONTINUITY_EXCEPTION_RULE_ID_CODE_POINTS = 160;
export const MAX_CONTINUITY_REVIEW_FORMAT_ISSUES = 100;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const RULE_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const EVIDENCE_ID_PATTERN =
  /^[a-z][a-z0-9-]{0,39}:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export interface ContinuityException {
  id: string;
  ruleId: string;
  ruleVersion: number;
  evidenceIds: string[];
  explanation: string;
}

export interface ContinuityReviewProject {
  format: typeof CONTINUITY_REVIEW_FORMAT;
  formatVersion: typeof CONTINUITY_REVIEW_FORMAT_VERSION;
  projectId: string;
  exceptions: ContinuityException[];
}

export interface ContinuityReviewFormatIssue {
  path: string;
  message: string;
}

export type ContinuityReviewProjectResult =
  | {
      kind: "valid";
      continuityReviewProject: ContinuityReviewProject;
      source: Record<string, unknown>;
    }
  | { kind: "malformed"; message: string }
  | { kind: "invalid"; issues: ContinuityReviewFormatIssue[] }
  | { kind: "unsupported-version"; version: number };

class IssueCollector {
  readonly #issues: ContinuityReviewFormatIssue[] = [];
  #omitted = false;

  add(path: string, message: string): void {
    if (this.#issues.length < MAX_CONTINUITY_REVIEW_FORMAT_ISSUES) {
      this.#issues.push({ path, message });
    } else {
      this.#omitted = true;
    }
  }

  get hasIssues(): boolean {
    return this.#issues.length > 0 || this.#omitted;
  }

  result(): ContinuityReviewFormatIssue[] {
    if (!this.#omitted) return [...this.#issues];
    return [
      ...this.#issues,
      {
        path: "$",
        message: `Additional issues were omitted after the first ${MAX_CONTINUITY_REVIEW_FORMAT_ISSUES}.`,
      },
    ];
  }
}

export function parseContinuityReviewProject(
  text: string,
): ContinuityReviewProjectResult {
  if (new TextEncoder().encode(text).byteLength > MAX_CONTINUITY_REVIEW_BYTES) {
    return {
      kind: "invalid",
      issues: [{
        path: "$",
        message: `The continuity-review file must not exceed ${MAX_CONTINUITY_REVIEW_BYTES} bytes.`,
      }],
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    return {
      kind: "malformed",
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
  if (!isRecord(value)) {
    return {
      kind: "invalid",
      issues: [{ path: "$", message: "The continuity-review file must be a JSON object." }],
    };
  }

  if (!Number.isSafeInteger(value.formatVersion) || (value.formatVersion as number) < 1) {
    return {
      kind: "invalid",
      issues: [{ path: "$.formatVersion", message: "formatVersion must be a positive integer." }],
    };
  }
  const formatVersion = value.formatVersion as number;
  if (formatVersion > CONTINUITY_REVIEW_FORMAT_VERSION) {
    return { kind: "unsupported-version", version: formatVersion };
  }
  if (formatVersion !== CONTINUITY_REVIEW_FORMAT_VERSION) {
    return {
      kind: "invalid",
      issues: [{
        path: "$.formatVersion",
        message: `formatVersion ${formatVersion} is not supported.`,
      }],
    };
  }

  const issues = new IssueCollector();
  if (value.format !== CONTINUITY_REVIEW_FORMAT) {
    issues.add("$.format", `format must be ${JSON.stringify(CONTINUITY_REVIEW_FORMAT)}.`);
  }
  const projectId = parseUuid(value.projectId, "$.projectId", "projectId", issues);
  const exceptions = parseExceptions(value.exceptions, issues);
  if (issues.hasIssues) return { kind: "invalid", issues: issues.result() };

  return {
    kind: "valid",
    continuityReviewProject: {
      format: CONTINUITY_REVIEW_FORMAT,
      formatVersion: CONTINUITY_REVIEW_FORMAT_VERSION,
      projectId: projectId!,
      exceptions,
    },
    source: structuredClone(value),
  };
}

function parseExceptions(
  value: unknown,
  issues: IssueCollector,
): ContinuityException[] {
  if (!Array.isArray(value)) {
    issues.add("$.exceptions", "exceptions must be an array.");
    return [];
  }
  if (value.length > MAX_CONTINUITY_EXCEPTIONS) {
    issues.add(
      "$.exceptions",
      `exceptions must contain at most ${MAX_CONTINUITY_EXCEPTIONS} entries; ${value.length - MAX_CONTINUITY_EXCEPTIONS} additional entries were not inspected.`,
    );
  }

  const exceptions: ContinuityException[] = [];
  const ids = new Map<string, string>();
  const tuples = new Map<string, string>();
  for (let index = 0; index < Math.min(value.length, MAX_CONTINUITY_EXCEPTIONS); index += 1) {
    const path = `$.exceptions[${index}]`;
    const parsed = parseException(value[index], path, issues);
    if (!parsed) continue;
    registerUnique(parsed.id, path, ids, `${path}.id`, "exception id", issues);
    registerUnique(
      exceptionMatchKey(parsed.ruleId, parsed.ruleVersion, parsed.evidenceIds),
      path,
      tuples,
      path,
      "rule/version/evidence tuple",
      issues,
    );
    exceptions.push(parsed);
  }
  return exceptions;
}

function parseException(
  value: unknown,
  path: string,
  issues: IssueCollector,
): ContinuityException | null {
  if (!isRecord(value)) {
    issues.add(path, "An exception must be a JSON object.");
    return null;
  }
  const id = parseUuid(value.id, `${path}.id`, "exception id", issues);
  const ruleId = parseRuleId(value.ruleId, `${path}.ruleId`, issues);
  const ruleVersion = parseRuleVersion(value.ruleVersion, `${path}.ruleVersion`, issues);
  const evidenceIds = parseEvidenceIds(value.evidenceIds, `${path}.evidenceIds`, issues);
  const explanation = parseExplanation(value.explanation, `${path}.explanation`, issues);
  return id && ruleId && ruleVersion !== null && evidenceIds && explanation
    ? { id, ruleId, ruleVersion, evidenceIds, explanation }
    : null;
}

function parseRuleId(
  value: unknown,
  path: string,
  issues: IssueCollector,
): string | null {
  if (
    typeof value !== "string" ||
    !RULE_ID_PATTERN.test(value) ||
    [...value].length > MAX_CONTINUITY_EXCEPTION_RULE_ID_CODE_POINTS
  ) {
    issues.add(
      path,
      `ruleId must be a lowercase dot-or-hyphen-separated identifier containing at most ${MAX_CONTINUITY_EXCEPTION_RULE_ID_CODE_POINTS} Unicode characters.`,
    );
    return null;
  }
  return value;
}

function parseRuleVersion(
  value: unknown,
  path: string,
  issues: IssueCollector,
): number | null {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    issues.add(path, "ruleVersion must be a positive integer.");
    return null;
  }
  return value as number;
}

function parseEvidenceIds(
  value: unknown,
  path: string,
  issues: IssueCollector,
): string[] | null {
  if (!Array.isArray(value)) {
    issues.add(path, "evidenceIds must be an array.");
    return null;
  }
  if (value.length < 1 || value.length > MAX_CONTINUITY_EXCEPTION_EVIDENCE) {
    issues.add(
      path,
      `evidenceIds must contain from 1 through ${MAX_CONTINUITY_EXCEPTION_EVIDENCE} stable identities.`,
    );
  }
  const evidenceIds: string[] = [];
  const inspected = Math.min(value.length, MAX_CONTINUITY_EXCEPTION_EVIDENCE);
  for (let index = 0; index < inspected; index += 1) {
    const evidenceId = value[index];
    if (typeof evidenceId !== "string" || !EVIDENCE_ID_PATTERN.test(evidenceId)) {
      issues.add(
        `${path}[${index}]`,
        "A stable evidence identity must use a lowercase namespace and canonical lowercase UUID v4.",
      );
      continue;
    }
    evidenceIds.push(evidenceId);
  }
  for (let index = 1; index < evidenceIds.length; index += 1) {
    const comparison = evidenceIds[index - 1]!.localeCompare(evidenceIds[index]!);
    if (comparison === 0) {
      issues.add(path, "evidenceIds must not contain duplicates.");
      break;
    }
    if (comparison > 0) {
      issues.add(path, "evidenceIds must be sorted in ascending order.");
      break;
    }
  }
  return value.length >= 1 &&
    value.length <= MAX_CONTINUITY_EXCEPTION_EVIDENCE &&
    evidenceIds.length === value.length
    ? evidenceIds
    : null;
}

function parseExplanation(
  value: unknown,
  path: string,
  issues: IssueCollector,
): string | null {
  if (typeof value !== "string") {
    issues.add(path, "explanation must be text.");
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    issues.add(path, "explanation must not be empty.");
    return null;
  }
  if (CONTROL_CHARACTER_PATTERN.test(trimmed)) {
    issues.add(path, "explanation must not contain control characters other than line breaks and tabs.");
    return null;
  }
  if ([...trimmed].length > MAX_CONTINUITY_EXCEPTION_EXPLANATION_CODE_POINTS) {
    issues.add(
      path,
      `explanation must contain at most ${MAX_CONTINUITY_EXCEPTION_EXPLANATION_CODE_POINTS} Unicode characters.`,
    );
    return null;
  }
  return trimmed;
}

function parseUuid(
  value: unknown,
  path: string,
  label: string,
  issues: IssueCollector,
): string | null {
  const issue = validateProjectId(value);
  if (issue) {
    issues.add(path, issue.replace("projectId", label));
    return null;
  }
  return value as string;
}

function registerUnique(
  identity: string,
  ownerPath: string,
  seen: Map<string, string>,
  path: string,
  label: string,
  issues: IssueCollector,
): void {
  const previous = seen.get(identity);
  if (previous) {
    issues.add(path, `Duplicate ${label}; it is already used at ${previous}.`);
  } else {
    seen.set(identity, ownerPath);
  }
}

export function exceptionMatchKey(
  ruleId: string,
  ruleVersion: number,
  evidenceIds: readonly string[],
): string {
  return JSON.stringify([ruleId, ruleVersion, [...evidenceIds].sort((a, b) => a.localeCompare(b))]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
