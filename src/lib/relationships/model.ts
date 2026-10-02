import {
  CONTINUITY_PROPERTY_DEFINITIONS,
  continuityPropertyDefinition,
  type ContinuityPropertyDefinition,
} from "$lib/lore/continuity-registry";
import type {
  CanonStatus,
  ContinuityCertainty,
  ContinuityTimeValue,
  LoreDocumentRecord,
  LoreIndexIssue,
  LoreProjectIndex,
  ParsedContinuityFact,
  SourceRange,
} from "$lib/lore/types";

export const MAX_RELATIONSHIP_ASSERTIONS_PER_PROFILE = 100;
export const MAX_RELATIONSHIP_ISSUES_PER_PROFILE = 100;

export const RELATIONSHIP_ENTITY_TYPES = [
  "character",
  "faction",
  "spacecraft",
  "technology",
  "location",
] as const;

export type RelationshipEntityType =
  (typeof RELATIONSHIP_ENTITY_TYPES)[number];
export type RelationshipPerspective = "outgoing" | "incoming" | "symmetric";

export interface RelationshipEndpoint {
  noteId: string;
  path: string;
  title: string;
  noteType: RelationshipEntityType;
  canon: CanonStatus | null;
  fingerprint: string;
}

export interface RelationshipEvidence {
  factId: string;
  sourcePath: string;
  sourceFingerprint: string;
  sourceRange: SourceRange;
}

export interface RelationshipAssertion {
  key: string;
  factId: string;
  property: string;
  propertyLabel: string;
  displayLabel: string;
  customProperty: boolean;
  perspective: RelationshipPerspective;
  source: RelationshipEndpoint;
  target: RelationshipEndpoint;
  other: RelationshipEndpoint;
  effectiveCanon: CanonStatus | null;
  certainty: ContinuityCertainty | null;
  validFrom: ContinuityTimeValue | null;
  validTo: ContinuityTimeValue | null;
  note: string | null;
  evidence: RelationshipEvidence;
}

export type RelationshipIssueKind =
  | "duplicate-fact-id"
  | "invalid-value"
  | "missing-target"
  | "ambiguous-target"
  | "wrong-subject-type"
  | "wrong-target-type";

export interface RelationshipIssue {
  kind: RelationshipIssueKind;
  factId: string;
  property: string;
  propertyLabel: string;
  message: string;
  evidence: RelationshipEvidence;
}

export interface RelationshipSourceDiagnostic {
  message: string;
  range: SourceRange;
}

export interface RelationshipProfile extends RelationshipEndpoint {
  assertions: readonly RelationshipAssertion[];
  omittedAssertionCount: number;
  issues: readonly RelationshipIssue[];
  omittedIssueCount: number;
  sourceDiagnostics: readonly RelationshipSourceDiagnostic[];
  omittedSourceDiagnosticCount: number;
}

export interface RelationshipExcludedSource {
  path: string;
  title: string;
  noteId: string | null;
  noteType: RelationshipEntityType;
  reason: string;
}

export interface RelationshipModel {
  generation: number;
  profiles: readonly RelationshipProfile[];
  excludedSources: readonly RelationshipExcludedSource[];
}

export type ActiveRelationshipProfile =
  | { kind: "no-active-note" }
  | { kind: "unavailable"; path: string; reason: string }
  | { kind: "updating"; path: string }
  | { kind: "ready"; profile: RelationshipProfile };

interface MutableRelationshipProfile extends RelationshipEndpoint {
  assertions: RelationshipAssertion[];
  issues: RelationshipIssue[];
  sourceDiagnostics: RelationshipSourceDiagnostic[];
}

const RELATIONSHIP_ENTITY_TYPE_SET = new Set<string>(
  RELATIONSHIP_ENTITY_TYPES,
);
const RELATIONSHIP_PROPERTY_ORDER: ReadonlyMap<string, number> = new Map(
  (CONTINUITY_PROPERTY_DEFINITIONS as readonly ContinuityPropertyDefinition[])
    .filter((definition) => definition.inverseLabel)
    .map((definition, index) => [definition.key, index]),
);

export function deriveRelationshipModel(
  index: LoreProjectIndex,
): RelationshipModel {
  const duplicateNoteIds = issueIds(index, "duplicate-note-id");
  const duplicateFactIds = issueIds(index, "duplicate-continuity-fact-id");
  const documentsById = documentsByIdMap(index);
  const documentsByPath = index.documents;
  const mutableProfiles = new Map<string, MutableRelationshipProfile>();
  const excludedSources: RelationshipExcludedSource[] = [];

  for (const document of sortedDocuments(index)) {
    if (!isRelationshipEntityType(document.type)) continue;
    if (!document.id || duplicateNoteIds.has(document.id)) {
      excludedSources.push({
        path: document.path,
        title: document.title,
        noteId: document.id,
        noteType: document.type,
        reason: document.id
          ? "This stable note ID appears in more than one file."
          : "This relationship-capable note has no stable note ID.",
      });
      continue;
    }
    mutableProfiles.set(document.path, {
      ...endpoint(document, document.type),
      assertions: [],
      issues: [],
      sourceDiagnostics: document.parseIssues.map(({ message, range }) => ({
        message,
        range,
      })),
    });
  }

  for (const profile of mutableProfiles.values()) {
    const document = documentsByPath.get(profile.path)!;
    for (const fact of document.facts) {
      const definition = continuityPropertyDefinition(fact.property);
      if (definition?.inverseLabel) {
        addBuiltInRelationship(
          profile,
          document,
          fact,
          definition,
          mutableProfiles,
          documentsById,
          duplicateFactIds,
        );
      } else if (!definition && fact.value.kind === "note") {
        addCustomRelationship(
          profile,
          document,
          fact,
          mutableProfiles,
          documentsById,
          duplicateFactIds,
        );
      }
    }
  }

  const profiles = [...mutableProfiles.values()]
    .sort((left, right) => compareText(left.path, right.path))
    .map(finalizeProfile);
  excludedSources.sort((left, right) => compareText(left.path, right.path));
  return { generation: index.generation, profiles, excludedSources };
}

export function selectActiveRelationshipProfile(
  model: RelationshipModel,
  activePath: string | null,
  activeFingerprint: string | null = null,
): ActiveRelationshipProfile {
  if (!activePath) return { kind: "no-active-note" };
  const profile = model.profiles.find(({ path }) => path === activePath);
  if (!profile) {
    const excluded = model.excludedSources.find(
      ({ path }) => path === activePath,
    );
    return {
      kind: "unavailable",
      path: activePath,
      reason:
        excluded?.reason ??
        "The active note is not a uniquely identified relationship-capable note.",
    };
  }
  if (
    activeFingerprint !== null &&
    activeFingerprint !== profile.fingerprint
  ) {
    return { kind: "updating", path: activePath };
  }
  return { kind: "ready", profile };
}

function addBuiltInRelationship(
  sourceProfile: MutableRelationshipProfile,
  sourceDocument: LoreDocumentRecord,
  fact: ParsedContinuityFact,
  definition: ContinuityPropertyDefinition,
  profiles: ReadonlyMap<string, MutableRelationshipProfile>,
  documentsById: ReadonlyMap<string, readonly LoreDocumentRecord[]>,
  duplicateFactIds: ReadonlySet<string>,
): void {
  const evidence = relationshipEvidence(fact, sourceDocument);
  if (!definition.subjectTypes.includes(sourceProfile.noteType)) {
    sourceProfile.issues.push({
      kind: "wrong-subject-type",
      factId: fact.id,
      property: fact.property,
      propertyLabel: definition.label,
      message: `${definition.label} is documented for ${joinWords(definition.subjectTypes)}, not ${sourceProfile.noteType}.`,
      evidence,
    });
    return;
  }
  if (duplicateFactIds.has(fact.id)) {
    sourceProfile.issues.push({
      kind: "duplicate-fact-id",
      factId: fact.id,
      property: fact.property,
      propertyLabel: definition.label,
      message: `Fact ${fact.id} appears in more than one note.`,
      evidence,
    });
    return;
  }
  if (fact.value.kind !== "note") {
    sourceProfile.issues.push({
      kind: "invalid-value",
      factId: fact.id,
      property: fact.property,
      propertyLabel: definition.label,
      message: `${definition.label} must point to one stable note ID.`,
      evidence,
    });
    return;
  }
  const matches = documentsById.get(fact.value.id) ?? [];
  if (matches.length === 0) {
    sourceProfile.issues.push({
      kind: "missing-target",
      factId: fact.id,
      property: fact.property,
      propertyLabel: definition.label,
      message: `Referenced note ID ${fact.value.id} is not present in the current index.`,
      evidence,
    });
    return;
  }
  if (matches.length > 1) {
    sourceProfile.issues.push({
      kind: "ambiguous-target",
      factId: fact.id,
      property: fact.property,
      propertyLabel: definition.label,
      message: `Referenced note ID ${fact.value.id} appears in more than one source.`,
      evidence,
    });
    return;
  }
  const targetDocument = matches[0]!;
  if (
    !targetDocument.type ||
    !definition.targetTypes?.includes(targetDocument.type)
  ) {
    sourceProfile.issues.push({
      kind: "wrong-target-type",
      factId: fact.id,
      property: fact.property,
      propertyLabel: definition.label,
      message: targetDocument.type
        ? `${definition.label} expects a ${joinWords(definition.targetTypes ?? [])} target, not ${targetDocument.type}.`
        : `${definition.label} points to a note whose type is unspecified.`,
      evidence,
    });
    return;
  }
  const targetProfile = profiles.get(targetDocument.path);
  if (!targetProfile) {
    sourceProfile.issues.push({
      kind: "ambiguous-target",
      factId: fact.id,
      property: fact.property,
      propertyLabel: definition.label,
      message: "The referenced note does not have one usable stable identity.",
      evidence,
    });
    return;
  }
  addResolvedAssertion(
    sourceProfile,
    targetProfile,
    sourceDocument,
    fact,
    definition.label,
    definition.inverseLabel!,
    false,
    definition.direction === "symmetric",
  );
}

function addCustomRelationship(
  sourceProfile: MutableRelationshipProfile,
  sourceDocument: LoreDocumentRecord,
  fact: ParsedContinuityFact,
  profiles: ReadonlyMap<string, MutableRelationshipProfile>,
  documentsById: ReadonlyMap<string, readonly LoreDocumentRecord[]>,
  duplicateFactIds: ReadonlySet<string>,
): void {
  if (fact.value.kind !== "note") return;
  const matches = documentsById.get(fact.value.id) ?? [];
  if (matches.length !== 1 || !isRelationshipEntityType(matches[0]!.type)) {
    return;
  }
  const targetProfile = profiles.get(matches[0]!.path);
  if (!targetProfile) return;
  if (duplicateFactIds.has(fact.id)) {
    sourceProfile.issues.push({
      kind: "duplicate-fact-id",
      factId: fact.id,
      property: fact.property,
      propertyLabel: humanizeProperty(fact.property),
      message: `Fact ${fact.id} appears in more than one note.`,
      evidence: relationshipEvidence(fact, sourceDocument),
    });
    return;
  }
  const label = humanizeProperty(fact.property);
  addResolvedAssertion(
    sourceProfile,
    targetProfile,
    sourceDocument,
    fact,
    label,
    label,
    true,
    false,
  );
}

function addResolvedAssertion(
  sourceProfile: MutableRelationshipProfile,
  targetProfile: MutableRelationshipProfile,
  sourceDocument: LoreDocumentRecord,
  fact: ParsedContinuityFact,
  outgoingLabel: string,
  incomingLabel: string,
  customProperty: boolean,
  symmetric: boolean,
): void {
  const shared = {
    factId: fact.id,
    property: fact.property,
    propertyLabel: outgoingLabel,
    customProperty,
    source: endpointFromProfile(sourceProfile),
    target: endpointFromProfile(targetProfile),
    effectiveCanon: fact.canon ?? sourceDocument.canon,
    certainty: fact.certainty,
    validFrom: fact.validFrom,
    validTo: fact.validTo,
    note: fact.note,
    evidence: relationshipEvidence(fact, sourceDocument),
  };
  const sourcePerspective: RelationshipPerspective = symmetric
    ? "symmetric"
    : "outgoing";
  sourceProfile.assertions.push({
    ...shared,
    key: `${fact.id}:${sourcePerspective}:${sourceProfile.path}`,
    displayLabel: outgoingLabel,
    perspective: sourcePerspective,
    other: endpointFromProfile(targetProfile),
  });
  if (sourceProfile.path === targetProfile.path) return;
  const targetPerspective: RelationshipPerspective = symmetric
    ? "symmetric"
    : "incoming";
  targetProfile.assertions.push({
    ...shared,
    key: `${fact.id}:${targetPerspective}:${targetProfile.path}`,
    displayLabel: incomingLabel,
    perspective: targetPerspective,
    other: endpointFromProfile(sourceProfile),
  });
}

function finalizeProfile(
  profile: MutableRelationshipProfile,
): RelationshipProfile {
  profile.assertions.sort(compareAssertions);
  profile.issues.sort(compareIssues);
  const assertions = profile.assertions.slice(
    0,
    MAX_RELATIONSHIP_ASSERTIONS_PER_PROFILE,
  );
  const issues = profile.issues.slice(0, MAX_RELATIONSHIP_ISSUES_PER_PROFILE);
  const sourceDiagnostics = profile.sourceDiagnostics.slice(
    0,
    MAX_RELATIONSHIP_ISSUES_PER_PROFILE,
  );
  return {
    ...endpointFromProfile(profile),
    assertions,
    omittedAssertionCount: profile.assertions.length - assertions.length,
    issues,
    omittedIssueCount: profile.issues.length - issues.length,
    sourceDiagnostics,
    omittedSourceDiagnosticCount:
      profile.sourceDiagnostics.length - sourceDiagnostics.length,
  };
}

function compareAssertions(
  left: RelationshipAssertion,
  right: RelationshipAssertion,
): number {
  const leftOrder = left.customProperty
    ? Number.MAX_SAFE_INTEGER
    : (RELATIONSHIP_PROPERTY_ORDER.get(left.property) ??
      Number.MAX_SAFE_INTEGER - 1);
  const rightOrder = right.customProperty
    ? Number.MAX_SAFE_INTEGER
    : (RELATIONSHIP_PROPERTY_ORDER.get(right.property) ??
      Number.MAX_SAFE_INTEGER - 1);
  return (
    leftOrder - rightOrder ||
    compareText(left.property, right.property) ||
    compareText(left.other.title, right.other.title) ||
    compareText(left.other.path, right.other.path) ||
    compareText(left.source.path, right.source.path) ||
    compareText(left.factId, right.factId) ||
    compareText(left.perspective, right.perspective)
  );
}

function compareIssues(
  left: RelationshipIssue,
  right: RelationshipIssue,
): number {
  return (
    left.evidence.sourceRange.start - right.evidence.sourceRange.start ||
    compareText(left.factId, right.factId) ||
    compareText(left.kind, right.kind)
  );
}

function endpoint(
  document: LoreDocumentRecord,
  noteType: RelationshipEntityType,
): RelationshipEndpoint {
  return {
    noteId: document.id!,
    path: document.path,
    title: document.title,
    noteType,
    canon: document.canon,
    fingerprint: document.fingerprint,
  };
}

function endpointFromProfile(
  profile: RelationshipEndpoint,
): RelationshipEndpoint {
  return {
    noteId: profile.noteId,
    path: profile.path,
    title: profile.title,
    noteType: profile.noteType,
    canon: profile.canon,
    fingerprint: profile.fingerprint,
  };
}

function relationshipEvidence(
  fact: ParsedContinuityFact,
  document: LoreDocumentRecord,
): RelationshipEvidence {
  return {
    factId: fact.id,
    sourcePath: document.path,
    sourceFingerprint: document.fingerprint,
    sourceRange: fact.range,
  };
}

function isRelationshipEntityType(
  value: string | null,
): value is RelationshipEntityType {
  return value !== null && RELATIONSHIP_ENTITY_TYPE_SET.has(value);
}

function sortedDocuments(index: LoreProjectIndex): LoreDocumentRecord[] {
  return [...index.documents.values()].sort((left, right) =>
    compareText(left.path, right.path),
  );
}

function documentsByIdMap(
  index: LoreProjectIndex,
): ReadonlyMap<string, readonly LoreDocumentRecord[]> {
  const result = new Map<string, LoreDocumentRecord[]>();
  for (const document of index.documents.values()) {
    if (!document.id) continue;
    const values = result.get(document.id) ?? [];
    values.push(document);
    result.set(document.id, values);
  }
  return result;
}

function issueIds(
  index: LoreProjectIndex,
  kind: LoreIndexIssue["kind"],
): ReadonlySet<string> {
  return new Set(
    index.issues.filter((issue) => issue.kind === kind).map(({ id }) => id),
  );
}

function humanizeProperty(value: string): string {
  const words = value.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function joinWords(values: readonly string[]): string {
  if (values.length === 0) return "a documented note type";
  if (values.length === 1) return values[0]!;
  return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
