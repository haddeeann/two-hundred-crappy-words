import type {
  CanonStatus,
  ContinuityCertainty,
  ContinuityTimeValue,
  ContinuityValue,
  LoreDocumentRecord,
  LoreProjectIndex,
  ParsedContinuityFact,
  SourceRange,
} from "$lib/lore/types";

export const MAX_CONTAINMENT_LINKS = 64;

export type TravelSubjectType = "event" | "scene";
export type TravelReferenceRole =
  | "container"
  | "origin"
  | "destination"
  | "model"
  | "route";

export interface TravelFactEvidence {
  role:
    | TravelReferenceRole
    | "duration"
    | "distance"
    | "departure"
    | "arrival";
  factId: string;
  property: string;
  path: string;
  title: string;
  noteId: string;
  noteType: string;
  certainty: ContinuityCertainty | null;
  effectiveCanon: CanonStatus | null;
  range: SourceRange;
}

export interface TravelSourceDiagnostic {
  message: string;
  range: SourceRange;
}

export interface TravelResolvedNote {
  noteId: string;
  path: string;
  title: string;
  noteType: string;
  canon: CanonStatus | null;
}

export interface TravelReferenceClaim {
  evidence: TravelFactEvidence;
  targetId: string | null;
  hasValidityBounds: boolean;
  resolution:
    | { kind: "resolved"; target: TravelResolvedNote }
    | { kind: "invalid" | "missing" | "ambiguous" | "wrong-type"; reason: string };
}

export type TravelReferenceSelection =
  | { kind: "missing"; reason: string; claims: readonly TravelReferenceClaim[] }
  | { kind: "resolved"; claim: TravelReferenceClaim; claims: readonly TravelReferenceClaim[] }
  | {
      kind: "unavailable" | "competing";
      reason: string;
      claims: readonly TravelReferenceClaim[];
    };

export interface TravelValueClaim {
  evidence: TravelFactEvidence;
  value: ContinuityValue;
  validFrom: ContinuityTimeValue | null;
  validTo: ContinuityTimeValue | null;
  usableShape: boolean;
  reason: string | null;
}

export type TravelValueSelection =
  | { kind: "missing"; reason: string; claims: readonly TravelValueClaim[] }
  | { kind: "resolved"; claim: TravelValueClaim; claims: readonly TravelValueClaim[] }
  | {
      kind: "unavailable" | "competing";
      reason: string;
      claims: readonly TravelValueClaim[];
    };

export interface TravelRouteProfile {
  noteId: string;
  path: string;
  title: string;
  canon: CanonStatus | null;
  origin: TravelReferenceSelection;
  destination: TravelReferenceSelection;
  model: TravelReferenceSelection;
  durations: readonly TravelValueClaim[];
  distance: TravelValueSelection;
  issues: readonly string[];
  sourceDiagnostics: readonly TravelSourceDiagnostic[];
}

export interface TravelJourney {
  noteId: string;
  path: string;
  title: string;
  noteType: TravelSubjectType;
  canon: CanonStatus | null;
  route: TravelReferenceSelection;
  departure: TravelValueSelection;
  arrival: TravelValueSelection;
  issues: readonly string[];
  sourceDiagnostics: readonly TravelSourceDiagnostic[];
}

export type TravelContainmentPathKind =
  | "definite"
  | "potential"
  | "unresolved"
  | "cycle"
  | "limit";

export interface TravelContainmentPath {
  kind: TravelContainmentPathKind;
  noteIds: readonly string[];
  titles: readonly string[];
  evidence: readonly TravelFactEvidence[];
  reason: string;
}

export interface TravelLocationProfile {
  noteId: string;
  path: string;
  title: string;
  canon: CanonStatus | null;
  directContainers: readonly TravelReferenceClaim[];
  containmentPaths: readonly TravelContainmentPath[];
  sourceDiagnostics: readonly TravelSourceDiagnostic[];
}

export interface TravelExcludedSource {
  path: string;
  title: string;
  noteId: string | null;
  noteType: "location" | "route" | TravelSubjectType;
  reason: string;
}

export interface TravelModel {
  locations: readonly TravelLocationProfile[];
  routes: readonly TravelRouteProfile[];
  journeys: readonly TravelJourney[];
  excludedSources: readonly TravelExcludedSource[];
}

interface TravelCatalog {
  documentsById: ReadonlyMap<string, readonly LoreDocumentRecord[]>;
  locationProfiles: ReadonlyMap<string, TravelLocationProfile>;
}

const TRAVEL_NOTE_TYPES = new Set(["location", "route", "event", "scene"]);

export function deriveTravelModel(index: LoreProjectIndex): TravelModel {
  const duplicateNoteIds = issueIds(index, "duplicate-note-id");
  const duplicateFactIds = issueIds(index, "duplicate-continuity-fact-id");
  const documentsById = documentsByIdMap(index);
  const excludedSources: TravelExcludedSource[] = [];
  const locations: TravelLocationProfile[] = [];
  const routes: TravelRouteProfile[] = [];
  const journeys: TravelJourney[] = [];

  for (const document of sortedDocuments(index)) {
    if (!document.type || !TRAVEL_NOTE_TYPES.has(document.type)) continue;
    if (
      (document.type === "event" || document.type === "scene") &&
      !document.facts.some(({ property }) => property === "uses-route")
    ) {
      continue;
    }
    if (!document.id || duplicateNoteIds.has(document.id)) {
      excludedSources.push({
        path: document.path,
        title: document.title,
        noteId: document.id,
        noteType: document.type as TravelExcludedSource["noteType"],
        reason: document.id
          ? "This stable note ID appears in more than one file."
          : "This travel-related note has no stable note ID.",
      });
      continue;
    }
    if (document.type === "location") {
      locations.push({
        noteId: document.id,
        path: document.path,
        title: document.title,
        canon: document.canon,
        directContainers: referenceClaims(
          document,
          "contained-by",
          "container",
          ["location", "spacecraft"],
          documentsById,
          duplicateFactIds,
        ),
        containmentPaths: [],
        sourceDiagnostics: sourceDiagnostics(document),
      });
    } else if (document.type === "route") {
      routes.push(
        deriveRoute(document, documentsById, duplicateFactIds),
      );
    } else {
      journeys.push(
        deriveJourney(document, documentsById, duplicateFactIds),
      );
    }
  }

  const locationProfiles = new Map(locations.map((location) => [location.noteId, location]));
  const catalog: TravelCatalog = {
    documentsById,
    locationProfiles,
  };
  for (const location of locations) {
    location.containmentPaths = deriveContainmentPaths(location, catalog);
  }

  return { locations, routes, journeys, excludedSources };
}

function deriveRoute(
  document: LoreDocumentRecord,
  documentsById: ReadonlyMap<string, readonly LoreDocumentRecord[]>,
  duplicateFactIds: ReadonlySet<string>,
): TravelRouteProfile {
  const origin = selectReference(
    referenceClaims(
      document,
      "route-origin",
      "origin",
      ["location", "spacecraft"],
      documentsById,
      duplicateFactIds,
    ),
    "This route has no origin fact.",
    "More than one route-origin claim is present; the app will not choose one.",
  );
  const destination = selectReference(
    referenceClaims(
      document,
      "route-destination",
      "destination",
      ["location", "spacecraft"],
      documentsById,
      duplicateFactIds,
    ),
    "This route has no destination fact.",
    "More than one route-destination claim is present; the app will not choose one.",
  );
  const model = selectReference(
    referenceClaims(
      document,
      "travel-model",
      "model",
      ["technology", "spacecraft"],
      documentsById,
      duplicateFactIds,
    ),
    "This route has no named travel model.",
    "More than one travel-model claim is present; the app will not choose one.",
  );
  const durations = valueClaims(
    document,
    "travel-duration",
    "duration",
    ["quantity", "range"],
    true,
    duplicateFactIds,
  );
  const distance = selectValue(
    valueClaims(
      document,
      "travel-distance",
      "distance",
      ["quantity", "range"],
      false,
      duplicateFactIds,
    ),
    "This route has no written distance.",
    "More than one travel-distance claim is present; the app will not choose one.",
  );
  const issues: string[] = [];
  if (origin.kind !== "resolved") issues.push(origin.reason);
  if (destination.kind !== "resolved") issues.push(destination.reason);
  if (
    origin.kind === "resolved" &&
    destination.kind === "resolved" &&
    origin.claim.targetId === destination.claim.targetId
  ) {
    issues.push("A route origin and destination must be different notes.");
  }
  if (durations.length === 0) {
    issues.push("This route has no travel-duration fact.");
  }
  for (const duration of durations) {
    if (duration.reason) issues.push(duration.reason);
  }
  if (distance.kind === "unavailable" || distance.kind === "competing") {
    issues.push(distance.reason);
  }
  if (model.kind === "unavailable" || model.kind === "competing") {
    issues.push(model.reason);
  }
  return {
    noteId: document.id!,
    path: document.path,
    title: document.title,
    canon: document.canon,
    origin,
    destination,
    model,
    durations,
    distance,
    issues,
    sourceDiagnostics: sourceDiagnostics(document),
  };
}

function deriveJourney(
  document: LoreDocumentRecord,
  documentsById: ReadonlyMap<string, readonly LoreDocumentRecord[]>,
  duplicateFactIds: ReadonlySet<string>,
): TravelJourney {
  const route = selectReference(
    referenceClaims(
      document,
      "uses-route",
      "route",
      ["route"],
      documentsById,
      duplicateFactIds,
    ),
    "This event or scene has no uses-route fact.",
    "More than one uses-route claim is present; the app will not choose one.",
  );
  const departure = selectValue(
    valueClaims(
      document,
      "occurs-at",
      "departure",
      ["time"],
      false,
      duplicateFactIds,
    ),
    "This journey has no occurs-at departure fact.",
    "More than one occurs-at claim is present; the app will not choose one.",
  );
  const arrival = selectValue(
    valueClaims(
      document,
      "ends-at",
      "arrival",
      ["time"],
      false,
      duplicateFactIds,
    ),
    "This journey has no authored ends-at arrival fact.",
    "More than one ends-at claim is present; the app will not choose one.",
  );
  const issues: string[] = [];
  if (route.kind !== "resolved") issues.push(route.reason);
  if (departure.kind !== "resolved") issues.push(departure.reason);
  if (arrival.kind === "unavailable" || arrival.kind === "competing") {
    issues.push(arrival.reason);
  }
  return {
    noteId: document.id!,
    path: document.path,
    title: document.title,
    noteType: document.type as TravelSubjectType,
    canon: document.canon,
    route,
    departure,
    arrival,
    issues,
    sourceDiagnostics: sourceDiagnostics(document),
  };
}

function referenceClaims(
  document: LoreDocumentRecord,
  property: string,
  role: TravelReferenceRole,
  targetTypes: readonly string[],
  documentsById: ReadonlyMap<string, readonly LoreDocumentRecord[]>,
  duplicateFactIds: ReadonlySet<string>,
): TravelReferenceClaim[] {
  return document.facts
    .filter((fact) => fact.property === property)
    .map((fact) => {
      const evidence = factEvidence(role, fact, document);
      if (duplicateFactIds.has(fact.id)) {
        return {
          evidence,
          targetId: fact.value.kind === "note" ? fact.value.id : null,
          hasValidityBounds: Boolean(fact.validFrom || fact.validTo),
          resolution: {
            kind: "invalid",
            reason: `Fact ${fact.id} appears in more than one note.`,
          },
        };
      }
      if (fact.value.kind !== "note") {
        return {
          evidence,
          targetId: null,
          hasValidityBounds: Boolean(fact.validFrom || fact.validTo),
          resolution: {
            kind: "invalid",
            reason: `${property} must point to one stable note ID.`,
          },
        };
      }
      const matches = documentsById.get(fact.value.id) ?? [];
      if (matches.length === 0) {
        return {
          evidence,
          targetId: fact.value.id,
          hasValidityBounds: Boolean(fact.validFrom || fact.validTo),
          resolution: {
            kind: "missing",
            reason: `Referenced note ID ${fact.value.id} is not present in the current index.`,
          },
        };
      }
      if (matches.length > 1) {
        return {
          evidence,
          targetId: fact.value.id,
          hasValidityBounds: Boolean(fact.validFrom || fact.validTo),
          resolution: {
            kind: "ambiguous",
            reason: `Referenced note ID ${fact.value.id} appears in more than one source.`,
          },
        };
      }
      const target = matches[0]!;
      if (!target.type || !targetTypes.includes(target.type)) {
        return {
          evidence,
          targetId: fact.value.id,
          hasValidityBounds: Boolean(fact.validFrom || fact.validTo),
          resolution: {
            kind: "wrong-type",
            reason: target.type
              ? `${property} points to a ${target.type} note, not ${joinWords(targetTypes)}.`
              : `${property} points to a note whose type is unspecified.`,
          },
        };
      }
      return {
        evidence,
        targetId: fact.value.id,
        hasValidityBounds: Boolean(fact.validFrom || fact.validTo),
        resolution: {
          kind: "resolved",
          target: resolvedNote(target),
        },
      };
    });
}

function valueClaims(
  document: LoreDocumentRecord,
  property: string,
  role: TravelFactEvidence["role"],
  valueKinds: readonly ContinuityValue["kind"][],
  allowsValidityBounds: boolean,
  duplicateFactIds: ReadonlySet<string>,
): TravelValueClaim[] {
  return document.facts
    .filter((fact) => fact.property === property)
    .map((fact) => {
      let reason: string | null = null;
      if (duplicateFactIds.has(fact.id)) {
        reason = `Fact ${fact.id} appears in more than one note.`;
      } else if (!valueKinds.includes(fact.value.kind)) {
        reason = `${property} expects ${joinWords(valueKinds)} values, not ${fact.value.kind}.`;
      } else if (!allowsValidityBounds && (fact.validFrom || fact.validTo)) {
        reason = `${property} does not use validity bounds.`;
      }
      return {
        evidence: factEvidence(role, fact, document),
        value: fact.value,
        validFrom: fact.validFrom,
        validTo: fact.validTo,
        usableShape: reason === null,
        reason,
      };
    });
}

function selectReference(
  claims: readonly TravelReferenceClaim[],
  missingReason: string,
  competingReason: string,
): TravelReferenceSelection {
  if (claims.length === 0) {
    return { kind: "missing", reason: missingReason, claims };
  }
  if (claims.length > 1) {
    return { kind: "competing", reason: competingReason, claims };
  }
  const claim = claims[0]!;
  return claim.resolution.kind === "resolved"
    ? { kind: "resolved", claim, claims }
    : { kind: "unavailable", reason: claim.resolution.reason, claims };
}

function selectValue(
  claims: readonly TravelValueClaim[],
  missingReason: string,
  competingReason: string,
): TravelValueSelection {
  if (claims.length === 0) {
    return { kind: "missing", reason: missingReason, claims };
  }
  if (claims.length > 1) {
    return { kind: "competing", reason: competingReason, claims };
  }
  const claim = claims[0]!;
  return claim.usableShape
    ? { kind: "resolved", claim, claims }
    : { kind: "unavailable", reason: claim.reason!, claims };
}

function deriveContainmentPaths(
  location: TravelLocationProfile,
  catalog: TravelCatalog,
): TravelContainmentPath[] {
  return location.directContainers.flatMap((claim) =>
    followContainerClaim(location, claim, catalog, [location.noteId], [], 0),
  );
}

function followContainerClaim(
  location: TravelLocationProfile,
  claim: TravelReferenceClaim,
  catalog: TravelCatalog,
  noteIds: readonly string[],
  evidence: readonly TravelFactEvidence[],
  depth: number,
): TravelContainmentPath[] {
  const nextEvidence = [...evidence, claim.evidence];
  if (claim.resolution.kind !== "resolved" || !claim.targetId) {
    return [
      containmentPath(
        "unresolved",
        noteIds,
        nextEvidence,
        claim.resolution.kind === "resolved"
          ? "The container target is unavailable."
          : claim.resolution.reason,
        catalog,
      ),
    ];
  }
  const nextIds = [...noteIds, claim.targetId];
  if (noteIds.includes(claim.targetId)) {
    return [
      containmentPath(
        "cycle",
        nextIds,
        nextEvidence,
        "The explicit contained-by chain forms a cycle.",
        catalog,
      ),
    ];
  }
  if (depth + 1 >= MAX_CONTAINMENT_LINKS) {
    return [
      containmentPath(
        "limit",
        nextIds,
        nextEvidence,
        `Containment traversal stopped after ${MAX_CONTAINMENT_LINKS} links.`,
        catalog,
      ),
    ];
  }
  const target = claim.resolution.target;
  const currentKind: TravelContainmentPathKind =
    claim.evidence.certainty === "exact" &&
    !claim.hasValidityBounds
      ? "definite"
      : "potential";
  if (target.noteType === "spacecraft") {
    return [
      containmentPath(
        currentKind,
        nextIds,
        nextEvidence,
        currentKind === "definite"
          ? "Every link is unbounded and explicitly exact."
          : "A link is bounded or is not explicitly exact.",
        catalog,
      ),
    ];
  }
  const parent = catalog.locationProfiles.get(target.noteId);
  if (!parent || parent.directContainers.length === 0) {
    return [
      containmentPath(
        currentKind,
        nextIds,
        nextEvidence,
        currentKind === "definite"
          ? "Every link is unbounded and explicitly exact."
          : "A link is bounded or is not explicitly exact.",
        catalog,
      ),
    ];
  }
  return parent.directContainers.flatMap((parentClaim) =>
    followContainerClaim(parent, parentClaim, catalog, nextIds, nextEvidence, depth + 1)
      .map((path) => ({
        ...path,
        kind:
          currentKind === "potential" && path.kind === "definite"
            ? "potential" as const
            : path.kind,
        reason:
          currentKind === "potential" && path.kind === "definite"
            ? "A link is bounded or is not explicitly exact."
            : path.reason,
      })),
  );
}

function containmentPath(
  kind: TravelContainmentPathKind,
  noteIds: readonly string[],
  evidence: readonly TravelFactEvidence[],
  reason: string,
  catalog: TravelCatalog,
): TravelContainmentPath {
  return {
    kind,
    noteIds,
    titles: noteIds.map((noteId) =>
      catalog.documentsById.get(noteId)?.[0]?.title ?? noteId,
    ),
    evidence,
    reason,
  };
}

function factEvidence(
  role: TravelFactEvidence["role"],
  fact: ParsedContinuityFact,
  document: LoreDocumentRecord,
): TravelFactEvidence {
  return {
    role,
    factId: fact.id,
    property: fact.property,
    path: document.path,
    title: document.title,
    noteId: document.id!,
    noteType: document.type!,
    certainty: fact.certainty,
    effectiveCanon: fact.canon ?? document.canon,
    range: fact.range,
  };
}

function sourceDiagnostics(
  document: LoreDocumentRecord,
): TravelSourceDiagnostic[] {
  return document.parseIssues
    .filter(({ kind }) =>
      kind === "frontmatter-malformed" ||
      kind === "frontmatter-field" ||
      kind === "duplicate-metadata",
    )
    .map(({ message, range }) => ({ message, range }));
}

function resolvedNote(document: LoreDocumentRecord): TravelResolvedNote {
  return {
    noteId: document.id!,
    path: document.path,
    title: document.title,
    noteType: document.type!,
    canon: document.canon,
  };
}

function sortedDocuments(index: LoreProjectIndex): LoreDocumentRecord[] {
  return [...index.documents.values()].sort(
    (first, second) => first.path.localeCompare(second.path),
  );
}

function documentsByIdMap(
  index: LoreProjectIndex,
): ReadonlyMap<string, readonly LoreDocumentRecord[]> {
  const result = new Map<string, LoreDocumentRecord[]>();
  for (const document of index.documents.values()) {
    if (!document.id) continue;
    const matches = result.get(document.id) ?? [];
    matches.push(document);
    result.set(document.id, matches);
  }
  return result;
}

function issueIds(
  index: LoreProjectIndex,
  kind: "duplicate-note-id" | "duplicate-continuity-fact-id",
): ReadonlySet<string> {
  return new Set(index.issues.filter((issue) => issue.kind === kind).map(({ id }) => id));
}

function joinWords(values: readonly string[]): string {
  if (values.length === 1) return values[0]!;
  return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`;
}
