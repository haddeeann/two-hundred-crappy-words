import type { LoreProjectIndex, SourceRange } from "$lib/lore/types";
import type { TimelineCalendar } from "$lib/timeline/format";
import { formatTimelineDayRange } from "$lib/timeline/normalize";
import type { TravelJourneyAnalysis } from "./journey";
import type {
  TravelFactEvidence,
  TravelLocationProfile,
  TravelModel,
  TravelReferenceClaim,
  TravelReferenceSelection,
  TravelRouteProfile,
  TravelValueClaim,
  TravelValueSelection,
} from "./model";

export interface TravelPresentationSource {
  label: string;
  path: string;
  range: SourceRange;
}

export interface TravelPresentationReference {
  title: string;
  path: string;
}

export interface TravelPresentationItem {
  label: string;
  value: string;
  detail: string | null;
  tone: "normal" | "potential" | "review" | "contradiction";
  sources: readonly TravelPresentationSource[];
  reference: TravelPresentationReference | null;
}

export interface TravelPresentationSection {
  title: string;
  items: readonly TravelPresentationItem[];
}

export type TravelInspectorPresentation =
  | { kind: "no-active-note"; summary: "Travel" }
  | { kind: "updating"; summary: "Travel · updating…" }
  | {
      kind: "ready";
      summary: string;
      title: string;
      path: string;
      noteType: "location" | "route" | "event" | "scene";
      sections: readonly TravelPresentationSection[];
      issues: readonly string[];
    };

export function presentTravelInspector(
  index: LoreProjectIndex | null,
  model: TravelModel | null,
  analyses: readonly TravelJourneyAnalysis[],
  activePath: string | null,
  activeFingerprint: string | null,
  calendars: readonly TimelineCalendar[],
): TravelInspectorPresentation {
  if (!index || !model || !activePath) {
    return { kind: "no-active-note", summary: "Travel" };
  }
  const document = index.documents.get(activePath);
  if (!document) return { kind: "no-active-note", summary: "Travel" };
  if (
    activeFingerprint !== null &&
    document.fingerprint !== activeFingerprint
  ) {
    return { kind: "updating", summary: "Travel · updating…" };
  }
  const location = model.locations.find(({ path }) => path === activePath);
  if (location) return presentLocation(location);
  const route = model.routes.find(({ path }) => path === activePath);
  if (route) return presentRoute(route);
  const journey = model.journeys.find(({ path }) => path === activePath);
  if (journey) {
    const analysis = analyses.find(
      ({ journey: candidate }) => candidate.noteId === journey.noteId,
    );
    return presentJourney(analysis ?? null, calendars);
  }
  return { kind: "no-active-note", summary: "Travel" };
}

function presentLocation(
  location: TravelLocationProfile,
): TravelInspectorPresentation {
  const direct = location.directContainers.map((claim) =>
    referenceClaimItem("Direct container", claim),
  );
  const paths = location.containmentPaths.map((path) => ({
    label: path.kind === "definite" ? "Definite path" : "Containment review",
    value: path.titles.join(" → "),
    detail: path.reason,
    tone:
      path.kind === "definite"
        ? "normal" as const
        : path.kind === "potential"
          ? "potential" as const
          : "review" as const,
    sources: evidenceSources(path.evidence),
    reference: null,
  }));
  return {
    kind: "ready",
    summary: `Travel · location${direct.length ? ` · ${direct.length} ${direct.length === 1 ? "container" : "containers"}` : ""}`,
    title: location.title,
    path: location.path,
    noteType: "location",
    sections: [
      {
        title: "Containment",
        items: direct.length + paths.length > 0
          ? [...direct, ...paths]
          : [plainItem("Containment", "No direct container facts", null)],
      },
    ],
    issues: location.sourceDiagnostics.map(({ message }) => message),
  };
}

function presentRoute(route: TravelRouteProfile): TravelInspectorPresentation {
  const durationItems = route.durations.map((claim) =>
    valueClaimItem("Duration", claim),
  );
  return {
    kind: "ready",
    summary: "Travel · route",
    title: route.title,
    path: route.path,
    noteType: "route",
    sections: [
      {
        title: "Direction",
        items: [
          referenceSelectionItem("Origin", route.origin),
          referenceSelectionItem("Destination", route.destination),
        ],
      },
      {
        title: "Travel evidence",
        items: [
          referenceSelectionItem("Model", route.model),
          ...(durationItems.length > 0
            ? durationItems
            : [plainItem("Duration", "Not written", null)]),
          valueSelectionItem("Distance", route.distance),
        ],
      },
    ],
    issues: [
      ...route.issues,
      ...route.sourceDiagnostics.map(({ message }) => message),
    ],
  };
}

function presentJourney(
  analysis: TravelJourneyAnalysis | null,
  calendars: readonly TimelineCalendar[],
): TravelInspectorPresentation {
  if (!analysis) {
    return { kind: "no-active-note", summary: "Travel" };
  }
  const journey = analysis.journey;
  const items: TravelPresentationItem[] = [
    referenceSelectionItem("Route", journey.route),
    valueSelectionItem("Departure", journey.departure),
  ];
  const issues = [...journey.issues, ...journey.sourceDiagnostics.map(({ message }) => message)];
  if (analysis.kind === "unavailable") {
    issues.unshift(analysis.reason);
  } else {
    const formatted = formatTimelineDayRange(analysis.arrival.range, calendars);
    items.push({
      label: "Derived arrival",
      value: formatted.kind === "formatted"
        ? formatted.expression
        : "Date presentation unavailable",
      detail: analysis.arrival.widenedByDayPrecision
        ? "Widened outward because departure time of day is unspecified."
        : "Exact at the available calendar-day precision.",
      tone: "normal",
      sources: evidenceSources(analysis.evidence),
      reference: null,
    });
    items.push(valueSelectionItem("Authored arrival", journey.arrival));
    items.push({
      label: "Comparison",
      value: comparisonLabel(analysis.comparison.kind),
      detail: analysis.comparison.reason,
      tone: analysis.comparison.hardContradiction
        ? "contradiction"
        : analysis.comparison.kind === "review" ||
            analysis.comparison.kind === "indeterminate"
          ? "review"
          : "normal",
      sources: evidenceSources(analysis.evidence),
      reference: null,
    });
  }
  return {
    kind: "ready",
    summary: "Travel · journey",
    title: journey.title,
    path: journey.path,
    noteType: journey.noteType,
    sections: [{ title: "Journey", items }],
    issues: uniqueStrings(issues),
  };
}

function referenceSelectionItem(
  label: string,
  selection: TravelReferenceSelection,
): TravelPresentationItem {
  if (selection.kind !== "resolved") {
    return {
      label,
      value: selection.kind === "missing" ? "Not written" : "Unavailable",
      detail: selection.reason,
      tone: selection.kind === "missing" ? "potential" : "review",
      sources: evidenceSources(selection.claims.map(({ evidence }) => evidence)),
      reference: null,
    };
  }
  return referenceClaimItem(label, selection.claim);
}

function referenceClaimItem(
  label: string,
  claim: TravelReferenceClaim,
): TravelPresentationItem {
  const resolution = claim.resolution;
  return {
    label,
    value: resolution.kind === "resolved"
      ? resolution.target.title
      : "Unavailable",
    detail: resolution.kind === "resolved" ? null : resolution.reason,
    tone: resolution.kind === "resolved" ? "normal" : "review",
    sources: evidenceSources([claim.evidence]),
    reference: resolution.kind === "resolved"
      ? { title: resolution.target.title, path: resolution.target.path }
      : null,
  };
}

function valueSelectionItem(
  label: string,
  selection: TravelValueSelection,
): TravelPresentationItem {
  if (selection.kind !== "resolved") {
    return {
      label,
      value: selection.kind === "missing" ? "Not written" : "Unavailable",
      detail: selection.reason,
      tone: selection.kind === "missing" ? "potential" : "review",
      sources: evidenceSources(selection.claims.map(({ evidence }) => evidence)),
      reference: null,
    };
  }
  return valueClaimItem(label, selection.claim);
}

function valueClaimItem(
  label: string,
  claim: TravelValueClaim,
): TravelPresentationItem {
  return {
    label,
    value: presentValue(claim.value),
    detail: claim.reason,
    tone: claim.usableShape ? "normal" : "review",
    sources: evidenceSources([claim.evidence]),
    reference: null,
  };
}

function presentValue(value: TravelValueClaim["value"]): string {
  if (value.kind === "quantity") {
    return `${value.amount} ${value.unit} · ${value.unitSystem}`;
  }
  if (value.kind === "range") {
    return `${value.minimum}–${value.maximum} ${value.unit} · ${value.unitSystem}`;
  }
  if (value.kind === "time") {
    return `${value.expression}${value.calendar === "gregorian" ? "" : ` · ${value.calendar}`}`;
  }
  if (value.kind === "note") return value.id;
  if (value.kind === "text") return value.text;
  return `Intentionally unknown · ${value.reason}`;
}

function evidenceSources(
  evidence: readonly TravelFactEvidence[],
): TravelPresentationSource[] {
  const seen = new Set<string>();
  return evidence.flatMap((item) => {
    const key = `${item.path}:${item.factId}:${item.range.start}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      label: `${item.property} · ${item.path}:${item.range.line}`,
      path: item.path,
      range: item.range,
    }];
  });
}

function plainItem(
  label: string,
  value: string,
  detail: string | null,
): TravelPresentationItem {
  return {
    label,
    value,
    detail,
    tone: "potential",
    sources: [],
    reference: null,
  };
}

function comparisonLabel(
  kind: "not-authored" | "compatible" | "review" | "indeterminate",
): string {
  if (kind === "not-authored") return "No authored arrival";
  if (kind === "compatible") return "Compatible";
  if (kind === "review") return "Review arrival";
  return "Indeterminate";
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
