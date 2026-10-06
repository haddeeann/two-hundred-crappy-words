import type { TimelineCalendar } from "$lib/timeline/format";
import {
  normalizeTimelineExpression,
  type TimelineRange,
} from "$lib/timeline/normalize";
import {
  calculateTravelArrival,
  normalizeTravelDuration,
  type NormalizedTravelDuration,
  type TravelArrivalWindow,
  type TravelDurationNormalization,
} from "./arithmetic";
import type {
  TravelFactEvidence,
  TravelJourney,
  TravelModel,
  TravelRouteProfile,
  TravelValueClaim,
} from "./model";

export interface TravelDurationCandidate {
  claim: TravelValueClaim;
  applicability: "applicable" | "outside" | "potential";
  applicabilityReason: string;
  normalization: TravelDurationNormalization;
}

export type TravelDurationSelection =
  | {
      kind: "resolved";
      candidate: TravelDurationCandidate;
      duration: NormalizedTravelDuration;
      candidates: readonly TravelDurationCandidate[];
    }
  | {
      kind: "missing" | "unavailable" | "competing";
      reason: string;
      candidates: readonly TravelDurationCandidate[];
    };

export interface TravelArrivalComparison {
  kind: "not-authored" | "compatible" | "review" | "indeterminate";
  hardContradiction: boolean;
  reason: string;
  authoredRange: TimelineRange | null;
}

export type TravelJourneyAnalysis =
  | {
      kind: "unavailable";
      journey: TravelJourney;
      reason: string;
      evidence: readonly TravelFactEvidence[];
    }
  | {
      kind: "computed";
      journey: TravelJourney;
      route: TravelRouteProfile;
      departure: TimelineRange;
      duration: TravelDurationSelection & { kind: "resolved" };
      arrival: TravelArrivalWindow;
      comparison: TravelArrivalComparison;
      evidence: readonly TravelFactEvidence[];
    };

export function deriveJourneyAnalyses(
  model: TravelModel,
  calendars: readonly TimelineCalendar[],
): TravelJourneyAnalysis[] {
  const routes = new Map(model.routes.map((route) => [route.noteId, route]));
  return model.journeys.map((journey) =>
    deriveJourneyAnalysis(journey, routes, calendars),
  );
}

export function selectApplicableDuration(
  claims: readonly TravelValueClaim[],
  departure: TimelineRange,
  calendars: readonly TimelineCalendar[],
): TravelDurationSelection {
  if (claims.length === 0) {
    return {
      kind: "missing",
      reason: "The route has no travel-duration fact.",
      candidates: [],
    };
  }
  const candidates = claims.map((claim) => ({
    claim,
    ...classifyApplicability(claim, departure, calendars),
    normalization: normalizeTravelDuration(claim.value),
  }));
  const potential = candidates.filter(
    ({ applicability }) => applicability === "potential",
  );
  if (potential.length > 0) {
    return {
      kind: "unavailable",
      reason:
        "At least one duration claim could apply, but its validity bounds do not definitely contain the complete departure range.",
      candidates,
    };
  }
  const applicable = candidates.filter(
    ({ applicability }) => applicability === "applicable",
  );
  if (applicable.length === 0) {
    return {
      kind: "unavailable",
      reason: "No duration claim definitely applies to the complete departure range.",
      candidates,
    };
  }
  if (applicable.length > 1) {
    return {
      kind: "competing",
      reason:
        "More than one duration claim definitely applies; the app will not choose one.",
      candidates,
    };
  }
  const candidate = applicable[0]!;
  if (!candidate.claim.usableShape) {
    return {
      kind: "unavailable",
      reason: candidate.claim.reason ?? "The applicable duration has an invalid source shape.",
      candidates,
    };
  }
  if (candidate.normalization.kind !== "computable") {
    return {
      kind: "unavailable",
      reason: candidate.normalization.reason,
      candidates,
    };
  }
  return {
    kind: "resolved",
    candidate,
    duration: candidate.normalization.duration,
    candidates,
  };
}

function deriveJourneyAnalysis(
  journey: TravelJourney,
  routes: ReadonlyMap<string, TravelRouteProfile>,
  calendars: readonly TimelineCalendar[],
): TravelJourneyAnalysis {
  const baseEvidence = allSelectionEvidence(journey.route.claims);
  if (journey.route.kind !== "resolved") {
    return unavailable(journey, selectionReason(journey.route), baseEvidence);
  }
  const routeTarget = journey.route.claim.resolution;
  if (routeTarget.kind !== "resolved") {
    return unavailable(journey, "The route reference is no longer resolved.", baseEvidence);
  }
  const route = routes.get(routeTarget.target.noteId);
  if (!route) {
    return unavailable(
      journey,
      "The resolved route profile is unavailable in this model generation.",
      baseEvidence,
    );
  }
  const routeEvidence = [
    ...baseEvidence,
    ...allSelectionEvidence(route.origin.claims),
    ...allSelectionEvidence(route.destination.claims),
  ];
  if (route.origin.kind !== "resolved") {
    return unavailable(journey, selectionReason(route.origin), routeEvidence);
  }
  if (route.destination.kind !== "resolved") {
    return unavailable(journey, selectionReason(route.destination), routeEvidence);
  }
  if (route.origin.claim.targetId === route.destination.claim.targetId) {
    return unavailable(
      journey,
      "The route origin and destination resolve to the same note.",
      routeEvidence,
    );
  }
  const departureEvidence = [
    ...routeEvidence,
    ...allSelectionEvidence(journey.departure.claims),
  ];
  if (journey.departure.kind !== "resolved") {
    return unavailable(
      journey,
      selectionReason(journey.departure),
      departureEvidence,
    );
  }
  const departureValue = journey.departure.claim.value;
  if (departureValue.kind !== "time") {
    return unavailable(
      journey,
      "The selected departure is not a time value.",
      departureEvidence,
    );
  }
  const normalizedDeparture = normalizeTimelineExpression(
    departureValue.calendar,
    departureValue.expression,
    calendars,
  );
  if (normalizedDeparture.kind !== "computable") {
    return unavailable(journey, normalizedDeparture.reason, departureEvidence);
  }
  if (
    normalizedDeparture.range.interval &&
    journey.arrival.claims.length > 0
  ) {
    return unavailable(
      journey,
      "occurs-at already contains a complete interval and cannot also use ends-at.",
      [...departureEvidence, ...allSelectionEvidence(journey.arrival.claims)],
    );
  }
  const duration = selectApplicableDuration(
    route.durations,
    normalizedDeparture.range,
    calendars,
  );
  const durationEvidence = [
    ...departureEvidence,
    ...duration.candidates.map(({ claim }) => claim.evidence),
  ];
  if (duration.kind !== "resolved") {
    return unavailable(journey, duration.reason, durationEvidence);
  }
  const calculation = calculateTravelArrival(
    normalizedDeparture.range,
    duration.duration,
  );
  if (calculation.kind !== "computable") {
    return unavailable(journey, calculation.reason, durationEvidence);
  }
  const comparison = compareAuthoredArrival(
    journey,
    route,
    calculation.arrival.range,
    duration,
    calendars,
  );
  return {
    kind: "computed",
    journey,
    route,
    departure: normalizedDeparture.range,
    duration,
    arrival: calculation.arrival,
    comparison,
    evidence: [
      ...durationEvidence,
      ...allSelectionEvidence(journey.arrival.claims),
    ],
  };
}

function compareAuthoredArrival(
  journey: TravelJourney,
  route: TravelRouteProfile,
  derived: TimelineRange,
  duration: TravelDurationSelection & { kind: "resolved" },
  calendars: readonly TimelineCalendar[],
): TravelArrivalComparison {
  if (journey.arrival.kind === "missing") {
    return {
      kind: "not-authored",
      hardContradiction: false,
      reason: "No ends-at fact is present; the derived arrival stands alone.",
      authoredRange: null,
    };
  }
  if (journey.arrival.kind !== "resolved") {
    return {
      kind: "indeterminate",
      hardContradiction: false,
      reason: selectionReason(journey.arrival),
      authoredRange: null,
    };
  }
  const value = journey.arrival.claim.value;
  if (value.kind !== "time") {
    return {
      kind: "indeterminate",
      hardContradiction: false,
      reason: "The selected authored arrival is not a time value.",
      authoredRange: null,
    };
  }
  const normalized = normalizeTimelineExpression(
    value.calendar,
    value.expression,
    calendars,
  );
  if (normalized.kind !== "computable") {
    return {
      kind: "indeterminate",
      hardContradiction: false,
      reason: normalized.reason,
      authoredRange: null,
    };
  }
  if (normalized.range.interval) {
    return {
      kind: "indeterminate",
      hardContradiction: false,
      reason: "ends-at must contain one date rather than a complete interval.",
      authoredRange: normalized.range,
    };
  }
  if (normalized.range.axis !== derived.axis) {
    return {
      kind: "indeterminate",
      hardContradiction: false,
      reason: "The derived and authored arrivals do not share a computable calendar axis.",
      authoredRange: normalized.range,
    };
  }
  const overlaps =
    derived.earliest <= normalized.range.latest &&
    normalized.range.earliest <= derived.latest;
  if (overlaps) {
    return {
      kind: "compatible",
      hardContradiction: false,
      reason:
        "The authored arrival overlaps the derived arrival window at the current precision.",
      authoredRange: normalized.range,
    };
  }
  const hardContradiction = allContributingClaimsExact(
    journey,
    route,
    duration,
  );
  return {
    kind: "review",
    hardContradiction,
    reason: hardContradiction
      ? "Unique canon, exact departure, route, duration, endpoint, and authored-arrival evidence are disjoint."
      : "The authored arrival is disjoint from the derived window, but canon or certainty qualifications prevent a hard contradiction.",
    authoredRange: normalized.range,
  };
}

function allContributingClaimsExact(
  journey: TravelJourney,
  route: TravelRouteProfile,
  duration: TravelDurationSelection & { kind: "resolved" },
): boolean {
  return [
    journey.route.kind === "resolved" ? journey.route.claim.evidence : null,
    journey.departure.kind === "resolved" ? journey.departure.claim.evidence : null,
    journey.arrival.kind === "resolved" ? journey.arrival.claim.evidence : null,
    route.origin.kind === "resolved" ? route.origin.claim.evidence : null,
    route.destination.kind === "resolved"
      ? route.destination.claim.evidence
      : null,
    duration.candidate.claim.evidence,
  ].every(
    (evidence) =>
      evidence?.certainty === "exact" && evidence.effectiveCanon === "canon",
  );
}

function classifyApplicability(
  claim: TravelValueClaim,
  departure: TimelineRange,
  calendars: readonly TimelineCalendar[],
): Pick<
  TravelDurationCandidate,
  "applicability" | "applicabilityReason"
> {
  if (!claim.validFrom && !claim.validTo) {
    return {
      applicability: "applicable",
      applicabilityReason: "This duration has no applicability bounds.",
    };
  }
  const from = claim.validFrom
    ? normalizeTimelineExpression(
        claim.validFrom.calendar,
        claim.validFrom.expression,
        calendars,
      )
    : null;
  const to = claim.validTo
    ? normalizeTimelineExpression(
        claim.validTo.calendar,
        claim.validTo.expression,
        calendars,
      )
    : null;
  if (from?.kind === "non-computable") {
    return {
      applicability: "potential",
      applicabilityReason: from.reason,
    };
  }
  if (to?.kind === "non-computable") {
    return {
      applicability: "potential",
      applicabilityReason: to.reason,
    };
  }
  const lower = from?.range ?? null;
  const upper = to?.range ?? null;
  if (
    (lower && lower.axis !== departure.axis) ||
    (upper && upper.axis !== departure.axis) ||
    (lower && upper && lower.axis !== upper.axis)
  ) {
    return {
      applicability: "potential",
      applicabilityReason:
        "The duration bounds and departure do not share one computable calendar axis.",
    };
  }
  if (lower && upper && lower.earliest > upper.latest) {
    return {
      applicability: "potential",
      applicabilityReason:
        "The duration applicability bounds are reversed or indeterminate.",
    };
  }
  const definitelyInside =
    (!lower || departure.earliest >= lower.latest) &&
    (!upper || departure.latest <= upper.earliest);
  if (definitelyInside) {
    return {
      applicability: "applicable",
      applicabilityReason:
        "The complete departure range is inside this duration's applicability window.",
    };
  }
  const definitelyOutside =
    Boolean(lower && departure.latest < lower.earliest) ||
    Boolean(upper && departure.earliest > upper.latest);
  return {
    applicability: definitelyOutside ? "outside" : "potential",
    applicabilityReason: definitelyOutside
      ? "The departure is outside this duration's applicability window."
      : "The departure only partly or possibly falls inside this duration's applicability window.",
  };
}

function selectionReason(
  selection:
    | TravelJourney["route"]
    | TravelJourney["departure"]
    | TravelJourney["arrival"]
    | TravelRouteProfile["origin"]
    | TravelRouteProfile["destination"],
): string {
  return selection.kind === "resolved"
    ? "The selected evidence is available."
    : selection.reason;
}

function allSelectionEvidence(
  claims: readonly { evidence: TravelFactEvidence }[],
): TravelFactEvidence[] {
  return claims.map(({ evidence }) => evidence);
}

function unavailable(
  journey: TravelJourney,
  reason: string,
  evidence: readonly TravelFactEvidence[],
): TravelJourneyAnalysis {
  return { kind: "unavailable", journey, reason, evidence };
}
