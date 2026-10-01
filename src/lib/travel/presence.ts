import type { TimelineCalendar } from "$lib/timeline/format";
import {
  normalizeTimelineExpression,
  type TimelineRange,
} from "$lib/timeline/normalize";
import type {
  CanonStatus,
  ContinuityCertainty,
  LoreDocumentRecord,
  LoreProjectIndex,
  ParsedContinuityFact,
  SourceRange,
} from "$lib/lore/types";
import type { TravelJourneyAnalysis } from "./journey";
import type { TravelFactEvidence, TravelModel } from "./model";

export const TRAVEL_PRESENCE_RULE_ID = "travel.presence.endpoint";
export const TRAVEL_PRESENCE_RULE_VERSION = 1;
export const MAX_TRAVEL_PRESENCE_FINDINGS = 100;

export type TravelPresencePhase = "departure" | "arrival";
export type TravelPresenceFindingKind =
  | "compatible"
  | "review"
  | "indeterminate";

export interface TravelPresenceEvidence {
  role:
    | "participant"
    | "presence"
    | "containment"
    | "route"
    | "endpoint"
    | "departure"
    | "duration";
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

export interface TravelPresenceFinding {
  id: string;
  ruleId: typeof TRAVEL_PRESENCE_RULE_ID;
  ruleVersion: typeof TRAVEL_PRESENCE_RULE_VERSION;
  kind: TravelPresenceFindingKind;
  severity: "information" | "review";
  phase: TravelPresencePhase;
  journeyNoteId: string;
  journeyPath: string;
  journeyTitle: string;
  participantFactId: string;
  participantNoteId: string;
  participantPath: string;
  participantTitle: string;
  endpointNoteId: string;
  endpointTitle: string;
  presenceNoteId: string | null;
  presenceTitle: string | null;
  summary: string;
  explanation: string;
  evidence: readonly TravelPresenceEvidence[];
}

export interface TravelPresenceFindingSet {
  findings: readonly TravelPresenceFinding[];
  omittedCount: number;
}

type Applicability = "applicable" | "outside" | "potential";

interface Catalog {
  documentsById: ReadonlyMap<string, readonly LoreDocumentRecord[]>;
  duplicateFactIds: ReadonlySet<string>;
  calendars: readonly TimelineCalendar[];
}

interface PresenceClaim {
  fact: ParsedContinuityFact;
  document: LoreDocumentRecord;
  target: LoreDocumentRecord | null;
  applicability: Applicability;
  reason: string | null;
}

interface ContainmentRelation {
  kind: "definite" | "potential" | "none";
  evidence: readonly TravelPresenceEvidence[];
}

export function deriveTravelPresenceFindings(
  index: LoreProjectIndex,
  model: TravelModel,
  analyses: readonly TravelJourneyAnalysis[],
  calendars: readonly TimelineCalendar[],
): TravelPresenceFindingSet {
  const documentsById = new Map<string, LoreDocumentRecord[]>();
  for (const document of index.documents.values()) {
    if (!document.id) continue;
    const matches = documentsById.get(document.id) ?? [];
    matches.push(document);
    documentsById.set(document.id, matches);
  }
  const catalog: Catalog = {
    documentsById,
    duplicateFactIds: new Set(
      index.issues
        .filter(({ kind }) => kind === "duplicate-continuity-fact-id")
        .map(({ id }) => id),
    ),
    calendars,
  };
  const eligibleJourneys = new Set(model.journeys.map(({ noteId }) => noteId));
  const all: TravelPresenceFinding[] = [];

  for (const analysis of analyses) {
    if (analysis.kind !== "computed" || !eligibleJourneys.has(analysis.journey.noteId)) {
      continue;
    }
    const journey = uniqueDocument(analysis.journey.noteId, catalog);
    if (!journey) continue;
    for (const participant of journey.facts.filter(
      ({ property }) => property === "participant",
    )) {
      const participantTarget = resolveParticipant(participant, catalog);
      if (!participantTarget) continue;
      const presenceFacts = participantTarget.facts.filter(
        ({ property }) => property === "located-at",
      );
      if (presenceFacts.length === 0) continue;
      all.push(
        ...phaseFindings(
          "departure",
          participant,
          participantTarget,
          presenceFacts,
          analysis,
          analysis.departure,
          endpointTarget(analysis.route.origin),
          catalog,
        ),
        ...phaseFindings(
          "arrival",
          participant,
          participantTarget,
          presenceFacts,
          analysis,
          analysis.arrival.range,
          endpointTarget(analysis.route.destination),
          catalog,
        ),
      );
    }
  }

  all.sort(
    (first, second) =>
      first.journeyPath.localeCompare(second.journeyPath) ||
      first.participantTitle.localeCompare(second.participantTitle) ||
      phaseOrder(first.phase) - phaseOrder(second.phase) ||
      first.participantFactId.localeCompare(second.participantFactId),
  );
  return {
    findings: all.slice(0, MAX_TRAVEL_PRESENCE_FINDINGS),
    omittedCount: Math.max(0, all.length - MAX_TRAVEL_PRESENCE_FINDINGS),
  };
}

function phaseFindings(
  phase: TravelPresencePhase,
  participant: ParsedContinuityFact,
  participantTarget: LoreDocumentRecord,
  presenceFacts: readonly ParsedContinuityFact[],
  analysis: TravelJourneyAnalysis & { kind: "computed" },
  range: TimelineRange,
  endpoint: LoreDocumentRecord | null,
  catalog: Catalog,
): TravelPresenceFinding[] {
  if (!endpoint) return [];
  const participantApplicability = classifyApplicability(participant, range, catalog.calendars);
  if (participantApplicability.kind === "outside") return [];
  const baseEvidence = phaseEvidence(
    phase,
    participant,
    participantTarget,
    analysis,
  );
  if (catalog.duplicateFactIds.has(participant.id)) {
    return [finding({
      kind: "indeterminate",
      phase,
      participant,
      participantTarget,
      analysis,
      endpoint,
      presence: null,
      summary: `${participantTarget.title} has ambiguous participation evidence`,
      explanation: "This participant fact ID appears in more than one note, so its travel presence cannot be compared safely.",
      evidence: baseEvidence,
    })];
  }
  if (participantApplicability.kind === "potential") {
    return [finding({
      kind: "indeterminate",
      phase,
      participant,
      participantTarget,
      analysis,
      endpoint,
      presence: null,
      summary: `${participantTarget.title}'s ${phase} participation is uncertain`,
      explanation: participantApplicability.reason,
      evidence: baseEvidence,
    })];
  }

  const claims = presenceFacts.map((fact) =>
    presenceClaim(fact, participantTarget, range, catalog),
  );
  const relevant = claims.filter(({ applicability }) => applicability !== "outside");
  if (relevant.length === 0) return [];
  const unusable = relevant.filter(
    ({ target, applicability, reason }) =>
      !target || applicability === "potential" || Boolean(reason),
  );
  if (unusable.length > 0) {
    return [finding({
      kind: "indeterminate",
      phase,
      participant,
      participantTarget,
      analysis,
      endpoint,
      presence: null,
      summary: `${participantTarget.title}'s ${phase} location is uncertain`,
      explanation: unusable.map(({ reason }) => reason).filter(Boolean).join(" ") ||
        "At least one location claim could apply, but its complete applicability cannot be established.",
      evidence: [...baseEvidence, ...relevant.map(claimEvidence)],
    })];
  }

  const applicable = relevant as Array<PresenceClaim & { target: LoreDocumentRecord }>;
  const selected = selectMostSpecificPresence(applicable, range, catalog);
  if (selected.kind !== "selected") {
    return [finding({
      kind: selected.kind === "competing" ? "review" : "indeterminate",
      phase,
      participant,
      participantTarget,
      analysis,
      endpoint,
      presence: null,
      summary: `${participantTarget.title} has ${selected.kind === "competing" ? "competing" : "uncertain"} ${phase} locations`,
      explanation: selected.reason,
      evidence: [...baseEvidence, ...applicable.map(claimEvidence), ...selected.evidence],
    })];
  }

  const presence = selected.claim.target;
  const direct = containmentRelation(presence.id!, endpoint.id!, range, catalog);
  if (presence.id === endpoint.id || direct.kind === "definite") {
    return [finding({
      kind: "compatible",
      phase,
      participant,
      participantTarget,
      analysis,
      endpoint,
      presence,
      summary: `${participantTarget.title} is compatible with the route ${phase}`,
      explanation: presence.id === endpoint.id
        ? `${presence.title} is the route ${phase === "departure" ? "origin" : "destination"}.`
        : `${presence.title} is definitely contained by ${endpoint.title} for the complete ${phase} window.`,
      evidence: [...baseEvidence, ...selected.claims.map(claimEvidence), ...direct.evidence],
    })];
  }
  if (direct.kind === "potential") {
    return [finding({
      kind: "indeterminate",
      phase,
      participant,
      participantTarget,
      analysis,
      endpoint,
      presence,
      summary: `${participantTarget.title}'s ${phase} location may fit the route`,
      explanation: `${presence.title} may be contained by ${endpoint.title}, but at least one containment claim is bounded, non-exact, or ambiguous.`,
      evidence: [...baseEvidence, ...selected.claims.map(claimEvidence), ...direct.evidence],
    })];
  }
  const broad = containmentRelation(endpoint.id!, presence.id!, range, catalog);
  if (broad.kind !== "none") {
    return [finding({
      kind: "indeterminate",
      phase,
      participant,
      participantTarget,
      analysis,
      endpoint,
      presence,
      summary: `${participantTarget.title}'s ${phase} location is broader than the route endpoint`,
      explanation: `${endpoint.title} is ${broad.kind === "definite" ? "definitely" : "possibly"} contained by ${presence.title}; that broader presence does not prove the participant is at the specific endpoint.`,
      evidence: [...baseEvidence, ...selected.claims.map(claimEvidence), ...broad.evidence],
    })];
  }
  return [finding({
    kind: "review",
    phase,
    participant,
    participantTarget,
    analysis,
    endpoint,
    presence,
    summary: `${participantTarget.title}'s ${phase} location differs from the route endpoint`,
    explanation: `${presence.title} has no known containment relationship with ${endpoint.title}. This is a review, not a contradiction, because the current format does not assert that two unconnected locations are disjoint.`,
    evidence: [...baseEvidence, ...selected.claims.map(claimEvidence)],
  })];
}

function resolveParticipant(
  fact: ParsedContinuityFact,
  catalog: Catalog,
): LoreDocumentRecord | null {
  if (fact.value.kind !== "note") return null;
  const target = uniqueDocument(fact.value.id, catalog);
  return target && (target.type === "character" || target.type === "spacecraft")
    ? target
    : null;
}

function presenceClaim(
  fact: ParsedContinuityFact,
  document: LoreDocumentRecord,
  range: TimelineRange,
  catalog: Catalog,
): PresenceClaim {
  const applicability = classifyApplicability(fact, range, catalog.calendars);
  if (catalog.duplicateFactIds.has(fact.id)) {
    return {
      fact,
      document,
      target: null,
      applicability: applicability.kind,
      reason: "A located-at fact ID appears in more than one note.",
    };
  }
  if (fact.value.kind !== "note") {
    return {
      fact,
      document,
      target: null,
      applicability: applicability.kind,
      reason: "located-at must point to one stable location or spacecraft note.",
    };
  }
  const matches = catalog.documentsById.get(fact.value.id) ?? [];
  if (matches.length !== 1) {
    return {
      fact,
      document,
      target: null,
      applicability: applicability.kind,
      reason: matches.length === 0
        ? "The located-at target is missing from the current index."
        : "The located-at target note ID appears in more than one source.",
    };
  }
  const target = matches[0]!;
  if (target.type !== "location" && target.type !== "spacecraft") {
    return {
      fact,
      document,
      target: null,
      applicability: applicability.kind,
      reason: `located-at points to a ${target.type ?? "typeless"} note rather than a location or spacecraft.`,
    };
  }
  return {
    fact,
    document,
    target,
    applicability: applicability.kind,
    reason: applicability.kind === "potential" ? applicability.reason : null,
  };
}

function selectMostSpecificPresence(
  claims: readonly (PresenceClaim & { target: LoreDocumentRecord })[],
  range: TimelineRange,
  catalog: Catalog,
):
  | {
      kind: "selected";
      claim: PresenceClaim & { target: LoreDocumentRecord };
      claims: readonly (PresenceClaim & { target: LoreDocumentRecord })[];
    }
  | { kind: "competing" | "indeterminate"; reason: string; evidence: readonly TravelPresenceEvidence[] } {
  const uniqueTargets = new Map<string, PresenceClaim & { target: LoreDocumentRecord }>();
  for (const claim of claims) uniqueTargets.set(claim.target.id!, claim);
  if (uniqueTargets.size === 1) {
    return { kind: "selected", claim: [...uniqueTargets.values()][0]!, claims };
  }
  const candidates = [...uniqueTargets.values()];
  let sawPotential = false;
  const relationEvidence: TravelPresenceEvidence[] = [];
  for (const candidate of candidates) {
    let descendantOfAll = true;
    for (const other of candidates) {
      if (candidate === other) continue;
      const relation = containmentRelation(
        candidate.target.id!,
        other.target.id!,
        range,
        catalog,
      );
      relationEvidence.push(...relation.evidence);
      if (relation.kind === "potential") sawPotential = true;
      if (relation.kind !== "definite") {
        descendantOfAll = false;
        break;
      }
    }
    if (descendantOfAll) {
      return { kind: "selected", claim: candidate, claims };
    }
  }
  return sawPotential
    ? {
        kind: "indeterminate",
        reason: "Several location claims could form one containment chain, but the available containment evidence is not definite for the complete time window.",
        evidence: relationEvidence,
      }
    : {
        kind: "competing",
        reason: "Several applicable locations are not connected by a definite containment chain, so the app will not choose one.",
        evidence: relationEvidence,
      };
}

function containmentRelation(
  fromId: string,
  toId: string,
  range: TimelineRange,
  catalog: Catalog,
): ContainmentRelation {
  if (fromId === toId) return { kind: "definite", evidence: [] };
  let sawPotential = false;
  let potentialEvidence: TravelPresenceEvidence[] = [];
  const queue: Array<{
    noteId: string;
    depth: number;
    definite: boolean;
    evidence: TravelPresenceEvidence[];
    visited: ReadonlySet<string>;
  }> = [{ noteId: fromId, depth: 0, definite: true, evidence: [], visited: new Set([fromId]) }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= 64) continue;
    const document = uniqueDocument(current.noteId, catalog);
    if (!document || document.type !== "location") continue;
    for (const fact of document.facts.filter(({ property }) => property === "contained-by")) {
      if (fact.value.kind !== "note" || catalog.duplicateFactIds.has(fact.id)) continue;
      const target = uniqueDocument(fact.value.id, catalog);
      if (!target || (target.type !== "location" && target.type !== "spacecraft")) continue;
      const applicability = classifyApplicability(fact, range, catalog.calendars);
      if (applicability.kind === "outside") continue;
      const evidence = [...current.evidence, factEvidence("containment", fact, document)];
      const definite = current.definite &&
        applicability.kind === "applicable" &&
        fact.certainty === "exact";
      if (target.id === toId) {
        if (definite) return { kind: "definite", evidence };
        sawPotential = true;
        potentialEvidence = evidence;
        continue;
      }
      if (current.visited.has(target.id!)) continue;
      queue.push({
        noteId: target.id!,
        depth: current.depth + 1,
        definite,
        evidence,
        visited: new Set([...current.visited, target.id!]),
      });
    }
  }
  return sawPotential
    ? { kind: "potential", evidence: potentialEvidence }
    : { kind: "none", evidence: [] };
}

function classifyApplicability(
  fact: ParsedContinuityFact,
  range: TimelineRange,
  calendars: readonly TimelineCalendar[],
): { kind: Applicability; reason: string } {
  if (!fact.validFrom && !fact.validTo) {
    return { kind: "applicable", reason: "This claim has no applicability bounds." };
  }
  const from = fact.validFrom
    ? normalizeTimelineExpression(fact.validFrom.calendar, fact.validFrom.expression, calendars)
    : null;
  const to = fact.validTo
    ? normalizeTimelineExpression(fact.validTo.calendar, fact.validTo.expression, calendars)
    : null;
  if (from?.kind === "non-computable") return { kind: "potential", reason: from.reason };
  if (to?.kind === "non-computable") return { kind: "potential", reason: to.reason };
  const lower = from?.range ?? null;
  const upper = to?.range ?? null;
  if (
    (lower && lower.axis !== range.axis) ||
    (upper && upper.axis !== range.axis) ||
    (lower && upper && lower.axis !== upper.axis)
  ) {
    return {
      kind: "potential",
      reason: "The applicability bounds and travel window do not share one computable calendar axis.",
    };
  }
  if (lower && upper && lower.earliest > upper.latest) {
    return { kind: "potential", reason: "The applicability bounds are reversed or indeterminate." };
  }
  const inside =
    (!lower || range.earliest >= lower.latest) &&
    (!upper || range.latest <= upper.earliest);
  if (inside) {
    return { kind: "applicable", reason: "The complete travel window is inside this claim's applicability bounds." };
  }
  const outside =
    Boolean(lower && range.latest < lower.earliest) ||
    Boolean(upper && range.earliest > upper.latest);
  return outside
    ? { kind: "outside", reason: "The travel window is outside this claim's applicability bounds." }
    : { kind: "potential", reason: "The travel window only partly or possibly falls inside this claim's applicability bounds." };
}

function phaseEvidence(
  phase: TravelPresencePhase,
  participant: ParsedContinuityFact,
  participantTarget: LoreDocumentRecord,
  analysis: TravelJourneyAnalysis & { kind: "computed" },
): TravelPresenceEvidence[] {
  const result = [factEvidence("participant", participant, uniqueJourneyDocument(analysis))];
  if (analysis.journey.route.kind === "resolved") {
    result.push(convertEvidence("route", analysis.journey.route.claim.evidence));
  }
  const endpoint = phase === "departure" ? analysis.route.origin : analysis.route.destination;
  if (endpoint.kind === "resolved") {
    result.push(convertEvidence("endpoint", endpoint.claim.evidence));
  }
  if (analysis.journey.departure.kind === "resolved") {
    result.push(convertEvidence("departure", analysis.journey.departure.claim.evidence));
  }
  if (phase === "arrival") {
    result.push(convertEvidence("duration", analysis.duration.candidate.claim.evidence));
  }
  return dedupeEvidence(result.map((evidence) => ({ ...evidence, title: evidence.title || participantTarget.title })));
}

function uniqueJourneyDocument(
  analysis: TravelJourneyAnalysis & { kind: "computed" },
): LoreDocumentRecord {
  return {
    path: analysis.journey.path,
    fingerprint: "",
    size: 0,
    id: analysis.journey.noteId,
    type: analysis.journey.noteType,
    title: analysis.journey.title,
    aliases: [],
    canon: analysis.journey.canon,
    facts: [],
    headings: [],
    outgoing: [],
    parseIssues: [],
    searchText: "",
    normalizedSearchText: "",
  };
}

function endpointTarget(
  selection: (TravelJourneyAnalysis & { kind: "computed" })["route"]["origin"],
): LoreDocumentRecord | null {
  if (selection.kind !== "resolved" || selection.claim.resolution.kind !== "resolved") {
    return null;
  }
  const target = selection.claim.resolution.target;
  return {
    path: target.path,
    fingerprint: "",
    size: 0,
    id: target.noteId,
    type: target.noteType,
    title: target.title,
    aliases: [],
    canon: target.canon,
    facts: [],
    headings: [],
    outgoing: [],
    parseIssues: [],
    searchText: "",
    normalizedSearchText: "",
  };
}

function finding({
  kind,
  phase,
  participant,
  participantTarget,
  analysis,
  endpoint,
  presence,
  summary,
  explanation,
  evidence,
}: {
  kind: TravelPresenceFindingKind;
  phase: TravelPresencePhase;
  participant: ParsedContinuityFact;
  participantTarget: LoreDocumentRecord;
  analysis: TravelJourneyAnalysis & { kind: "computed" };
  endpoint: LoreDocumentRecord;
  presence: LoreDocumentRecord | null;
  summary: string;
  explanation: string;
  evidence: readonly TravelPresenceEvidence[];
}): TravelPresenceFinding {
  return {
    id: `${TRAVEL_PRESENCE_RULE_ID}:v${TRAVEL_PRESENCE_RULE_VERSION}:${analysis.journey.noteId}:${participant.id}:${phase}`,
    ruleId: TRAVEL_PRESENCE_RULE_ID,
    ruleVersion: TRAVEL_PRESENCE_RULE_VERSION,
    kind,
    severity: kind === "review" ? "review" : "information",
    phase,
    journeyNoteId: analysis.journey.noteId,
    journeyPath: analysis.journey.path,
    journeyTitle: analysis.journey.title,
    participantFactId: participant.id,
    participantNoteId: participantTarget.id!,
    participantPath: participantTarget.path,
    participantTitle: participantTarget.title,
    endpointNoteId: endpoint.id!,
    endpointTitle: endpoint.title,
    presenceNoteId: presence?.id ?? null,
    presenceTitle: presence?.title ?? null,
    summary,
    explanation,
    evidence: dedupeEvidence(evidence),
  };
}

function factEvidence(
  role: TravelPresenceEvidence["role"],
  fact: ParsedContinuityFact,
  document: LoreDocumentRecord,
): TravelPresenceEvidence {
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

function claimEvidence(claim: PresenceClaim): TravelPresenceEvidence {
  return factEvidence("presence", claim.fact, claim.document);
}

function convertEvidence(
  role: TravelPresenceEvidence["role"],
  evidence: TravelFactEvidence,
): TravelPresenceEvidence {
  return { ...evidence, role };
}

function dedupeEvidence(
  evidence: readonly TravelPresenceEvidence[],
): TravelPresenceEvidence[] {
  const result = new Map<string, TravelPresenceEvidence>();
  for (const item of evidence) {
    result.set(`${item.role}:${item.path}:${item.factId}`, item);
  }
  return [...result.values()];
}

function uniqueDocument(noteId: string, catalog: Catalog): LoreDocumentRecord | null {
  const matches = catalog.documentsById.get(noteId) ?? [];
  return matches.length === 1 ? matches[0]! : null;
}

function phaseOrder(phase: TravelPresencePhase): number {
  return phase === "departure" ? 0 : 1;
}
