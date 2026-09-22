import { continuityPropertyDefinition } from "./continuity-registry";
import type {
  CanonStatus,
  ContinuityTimeValue,
  ContinuityValue,
  LoreDocumentRecord,
  LoreProjectIndex,
  SourceRange,
} from "./types";

export interface ContinuityFactPresentation {
  id: string;
  property: string;
  propertyLabel: string;
  propertyDescription: string;
  customProperty: boolean;
  valueText: string;
  valueKind: ContinuityValue["kind"];
  reference:
    | { kind: "none" }
    | { kind: "resolved"; path: string; title: string }
    | { kind: "missing" | "ambiguous"; id: string };
  canon: CanonStatus | null;
  canonSource: "fact" | "note" | "unspecified";
  certainty: string;
  validity: string | null;
  note: string | null;
  diagnostics: readonly string[];
  sourcePath: string;
  sourceRange: SourceRange;
  sourceLabel: string;
}

export type ContinuityInspectorPresentation =
  | { kind: "no-active-note"; summary: "Continuity" }
  | { kind: "updating"; summary: "Continuity · updating…"; path: string }
  | {
      kind: "ready";
      summary: string;
      path: string;
      fingerprint: string;
      title: string;
      noteType: string | null;
      canon: CanonStatus | null;
      facts: readonly ContinuityFactPresentation[];
      metadataIssues: readonly string[];
    };

export function presentContinuityInspector(
  index: LoreProjectIndex | null,
  activePath: string | null,
  activeFingerprint: string | null = null,
): ContinuityInspectorPresentation {
  if (!index || !activePath) return { kind: "no-active-note", summary: "Continuity" };
  const document = index.documents.get(activePath);
  if (!document) return { kind: "no-active-note", summary: "Continuity" };
  if (activeFingerprint !== null && document.fingerprint !== activeFingerprint) {
    return { kind: "updating", summary: "Continuity · updating…", path: activePath };
  }

  const notesById = noteIdentityMap(index);
  const duplicatedFactIds = new Set(
    index.issues
      .filter(({ kind }) => kind === "duplicate-continuity-fact-id")
      .map(({ id }) => id),
  );
  const facts = document.facts.map((fact) => {
    const definition = continuityPropertyDefinition(fact.property);
    const reference = presentReference(fact.value, notesById);
    const diagnostics: string[] = [];
    if (!definition) {
      diagnostics.push("Custom property; no deterministic rule uses it yet.");
    } else {
      if (document.type && !definition.subjectTypes.includes(document.type)) {
        diagnostics.push(
          `${definition.label} is documented for ${joinWords(definition.subjectTypes)}, not ${document.type}.`,
        );
      } else if (!document.type) {
        diagnostics.push("The note type is unspecified, so subject compatibility is not checked.");
      }
      if (!definition.valueKinds.includes(fact.value.kind)) {
        diagnostics.push(
          `${definition.label} expects ${joinWords(definition.valueKinds)} values, not ${fact.value.kind}.`,
        );
      }
      if (!definition.allowsValidityBounds && (fact.validFrom || fact.validTo)) {
        diagnostics.push(`${definition.label} does not use validity bounds.`);
      }
    }
    if (reference.kind === "missing") {
      diagnostics.push(`Referenced note ID ${reference.id} is unavailable.`);
    } else if (reference.kind === "ambiguous") {
      diagnostics.push(`Referenced note ID ${reference.id} appears in more than one note.`);
    }
    if (duplicatedFactIds.has(fact.id)) {
      diagnostics.push("This fact ID is duplicated in another note and is unavailable to checks.");
    }
    if (fact.unknownKeys.length + fact.value.unknownKeys.length > 0) {
      diagnostics.push("Unrecognized fields are preserved in Markdown but ignored here.");
    }
    const canon = fact.canon ?? document.canon;
    return {
      id: fact.id,
      property: fact.property,
      propertyLabel: definition?.label ?? humanizeProperty(fact.property),
      propertyDescription: definition?.description ?? "Writer-defined continuity property.",
      customProperty: !definition,
      valueText: presentValue(fact.value, reference),
      valueKind: fact.value.kind,
      reference,
      canon,
      canonSource: fact.canon ? "fact" : document.canon ? "note" : "unspecified",
      certainty: fact.certainty ?? "unspecified",
      validity: presentValidity(fact.validFrom, fact.validTo),
      note: fact.note,
      diagnostics,
      sourcePath: document.path,
      sourceRange: fact.range,
      sourceLabel: `${document.path}:${fact.range.line}:${fact.range.column}`,
    } satisfies ContinuityFactPresentation;
  });
  const metadataIssues = document.parseIssues
    .filter(({ kind }) =>
      kind === "frontmatter-malformed" ||
      kind === "frontmatter-field" ||
      kind === "duplicate-metadata",
    )
    .map(
      ({ message, range }) =>
        `${document.path}:${range.line}:${range.column}: ${message}`,
    );
  return {
    kind: "ready",
    summary: `Continuity · ${facts.length} ${facts.length === 1 ? "fact" : "facts"}`,
    path: document.path,
    fingerprint: document.fingerprint,
    title: document.title,
    noteType: document.type,
    canon: document.canon,
    facts,
    metadataIssues,
  };
}

function noteIdentityMap(
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

function presentReference(
  value: ContinuityValue,
  notesById: ReadonlyMap<string, readonly LoreDocumentRecord[]>,
): ContinuityFactPresentation["reference"] {
  if (value.kind !== "note") return { kind: "none" };
  const matches = notesById.get(value.id) ?? [];
  if (matches.length === 0) return { kind: "missing", id: value.id };
  if (matches.length > 1) return { kind: "ambiguous", id: value.id };
  return {
    kind: "resolved",
    path: matches[0]!.path,
    title: matches[0]!.title,
  };
}

function presentValue(
  value: ContinuityValue,
  reference: ContinuityFactPresentation["reference"],
): string {
  if (value.kind === "note") {
    if (reference.kind === "resolved") return reference.title;
    if (reference.kind === "ambiguous") return "Ambiguous note reference";
    return "Missing note reference";
  }
  if (value.kind === "text") return value.text;
  if (value.kind === "quantity") {
    return `${value.amount} ${value.unit} · ${value.unitSystem}`;
  }
  if (value.kind === "range") {
    return `${value.minimum}–${value.maximum} ${value.unit} · ${value.unitSystem}`;
  }
  if (value.kind === "time") return presentTime(value);
  return `Intentionally unknown · ${value.reason}`;
}

function presentValidity(
  validFrom: ContinuityTimeValue | null,
  validTo: ContinuityTimeValue | null,
): string | null {
  if (!validFrom && !validTo) return null;
  if (validFrom && validTo) return `${presentTime(validFrom)} → ${presentTime(validTo)}`;
  if (validFrom) return `From ${presentTime(validFrom)}`;
  return `Until ${presentTime(validTo!)}`;
}

function presentTime(value: ContinuityTimeValue): string {
  return `${value.expression} · ${value.calendar}`;
}

function humanizeProperty(value: string): string {
  const words = value.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function joinWords(values: readonly string[]): string {
  if (values.length === 1) return values[0]!;
  return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`;
}
