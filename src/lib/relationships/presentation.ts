import type { ContinuityTimeValue, SourceRange } from "$lib/lore/types";
import {
  selectActiveRelationshipProfile,
  type RelationshipAssertion,
  type RelationshipIssue,
  type RelationshipModel,
  type RelationshipProfile,
} from "./model";

export interface RelationshipPresentationSource {
  label: string;
  path: string;
  fingerprint: string;
  range: SourceRange;
}

export interface RelationshipAuthoringRequest {
  factId: string;
  sourcePath: string;
  revision: number;
}

export interface RelationshipPresentationItem {
  key: string;
  factId: string;
  label: string;
  otherTitle: string;
  otherPath: string;
  otherType: string;
  direction: string;
  canon: string;
  certainty: string;
  validity: string | null;
  note: string | null;
  referencePath: string;
  source: RelationshipPresentationSource;
}

export interface RelationshipPresentationSection {
  key: string;
  title: string;
  items: readonly RelationshipPresentationItem[];
}

export interface RelationshipPresentationMessage {
  key: string;
  message: string;
  source: RelationshipPresentationSource;
}

export interface RelationshipPresentationIssue
  extends RelationshipPresentationMessage {
  factId: string;
}

export type RelationshipInspectorPresentation =
  | { kind: "no-active-note"; summary: "Relationships" }
  | { kind: "updating"; summary: "Relationships · updating…" }
  | {
      kind: "unavailable";
      summary: "Relationships · unavailable";
      reason: string;
    }
  | {
      kind: "ready";
      summary: string;
      title: string;
      path: string;
      noteType: string;
      builtInSections: readonly RelationshipPresentationSection[];
      customSections: readonly RelationshipPresentationSection[];
      issues: readonly RelationshipPresentationIssue[];
      sourceDiagnostics: readonly RelationshipPresentationMessage[];
      omittedAssertionCount: number;
      omittedIssueCount: number;
      omittedSourceDiagnosticCount: number;
    };

export function presentRelationshipInspector(
  model: RelationshipModel | null,
  activePath: string | null,
  activeFingerprint: string | null = null,
): RelationshipInspectorPresentation {
  if (!model || !activePath) {
    return { kind: "no-active-note", summary: "Relationships" };
  }
  const hasEligibleSource =
    model.profiles.some(({ path }) => path === activePath) ||
    model.excludedSources.some(({ path }) => path === activePath);
  if (!hasEligibleSource) {
    return { kind: "no-active-note", summary: "Relationships" };
  }
  const selection = selectActiveRelationshipProfile(
    model,
    activePath,
    activeFingerprint,
  );
  if (selection.kind === "updating") {
    return { kind: "updating", summary: "Relationships · updating…" };
  }
  if (selection.kind === "unavailable") {
    return {
      kind: "unavailable",
      summary: "Relationships · unavailable",
      reason: selection.reason,
    };
  }
  if (selection.kind !== "ready") {
    return { kind: "no-active-note", summary: "Relationships" };
  }
  return presentProfile(selection.profile);
}

function presentProfile(
  profile: RelationshipProfile,
): RelationshipInspectorPresentation {
  const builtIn = profile.assertions.filter(({ customProperty }) => !customProperty);
  const custom = profile.assertions.filter(({ customProperty }) => customProperty);
  const count = profile.assertions.length + profile.omittedAssertionCount;
  const reviewCount =
    profile.issues.length +
    profile.omittedIssueCount +
    profile.sourceDiagnostics.length +
    profile.omittedSourceDiagnosticCount;
  return {
    kind: "ready",
    summary: `Relationships · ${count}${reviewCount ? ` · ${reviewCount} review` : ""}`,
    title: profile.title,
    path: profile.path,
    noteType: profile.noteType,
    builtInSections: groupAssertions(builtIn, profile),
    customSections: groupAssertions(custom, profile),
    issues: profile.issues.map(presentIssue),
    sourceDiagnostics: profile.sourceDiagnostics.map((diagnostic, index) => ({
      key: `diagnostic:${diagnostic.range.start}:${index}`,
      message: diagnostic.message,
      source: {
        label: sourceLabel(profile.path, diagnostic.range),
        path: profile.path,
        fingerprint: profile.fingerprint,
        range: diagnostic.range,
      },
    })),
    omittedAssertionCount: profile.omittedAssertionCount,
    omittedIssueCount: profile.omittedIssueCount,
    omittedSourceDiagnosticCount: profile.omittedSourceDiagnosticCount,
  };
}

function groupAssertions(
  assertions: readonly RelationshipAssertion[],
  profile: RelationshipProfile,
): RelationshipPresentationSection[] {
  const sections: RelationshipPresentationSection[] = [];
  const byKey = new Map<string, RelationshipPresentationSection>();
  for (const assertion of assertions) {
    const key = `${assertion.property}:${assertion.perspective}:${assertion.displayLabel}`;
    let section = byKey.get(key);
    if (!section) {
      section = {
        key,
        title: assertion.displayLabel,
        items: [],
      };
      sections.push(section);
      byKey.set(key, section);
    }
    (section.items as RelationshipPresentationItem[]).push(
      presentAssertion(assertion, profile),
    );
  }
  return sections;
}

function presentAssertion(
  assertion: RelationshipAssertion,
  profile: RelationshipProfile,
): RelationshipPresentationItem {
  return {
    key: assertion.key,
    factId: assertion.factId,
    label: assertion.displayLabel,
    otherTitle: assertion.other.title,
    otherPath: assertion.other.path,
    otherType: assertion.other.noteType,
    direction: directionText(assertion, profile),
    canon: assertion.effectiveCanon ?? "unspecified",
    certainty: assertion.certainty ?? "unspecified",
    validity: presentValidity(assertion.validFrom, assertion.validTo),
    note: assertion.note,
    referencePath: assertion.other.path,
    source: {
      label: sourceLabel(
        assertion.evidence.sourcePath,
        assertion.evidence.sourceRange,
      ),
      path: assertion.evidence.sourcePath,
      fingerprint: assertion.evidence.sourceFingerprint,
      range: assertion.evidence.sourceRange,
    },
  };
}

function presentIssue(
  issue: RelationshipIssue,
): RelationshipPresentationIssue {
  return {
    key: `${issue.factId}:${issue.kind}`,
    factId: issue.factId,
    message: issue.message,
    source: {
      label: sourceLabel(
        issue.evidence.sourcePath,
        issue.evidence.sourceRange,
      ),
      path: issue.evidence.sourcePath,
      fingerprint: issue.evidence.sourceFingerprint,
      range: issue.evidence.sourceRange,
    },
  };
}

function directionText(
  assertion: RelationshipAssertion,
  profile: RelationshipProfile,
): string {
  if (assertion.perspective === "outgoing") {
    return "Outgoing · source is this note";
  }
  const source = assertion.source.path === profile.path
    ? "this note"
    : assertion.source.title;
  return assertion.perspective === "incoming"
    ? `Incoming · source is ${source}`
    : `Symmetric · source is ${source}`;
}

function presentValidity(
  validFrom: ContinuityTimeValue | null,
  validTo: ContinuityTimeValue | null,
): string | null {
  if (!validFrom && !validTo) return null;
  if (validFrom && validTo) {
    return `${presentTime(validFrom)} → ${presentTime(validTo)}`;
  }
  if (validFrom) return `From ${presentTime(validFrom)}`;
  return `Until ${presentTime(validTo!)}`;
}

function presentTime(value: ContinuityTimeValue): string {
  return `${value.expression} · ${value.calendar}`;
}

function sourceLabel(path: string, range: SourceRange): string {
  return `${path}:${range.line}:${range.column}`;
}
