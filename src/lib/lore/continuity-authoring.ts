import { fingerprintContent } from "$lib/editor/recovery";
import {
  CONTINUITY_PROPERTY_DEFINITIONS,
  continuityPropertyDefinition,
  type ContinuityPropertyDefinition,
} from "./continuity-registry";
import type {
  CanonStatus,
  LoreDocumentRecord,
  LoreProjectIndex,
  ParsedContinuityFact,
} from "./types";

export interface ContinuityNoteChoice {
  id: string;
  title: string;
  path: string;
  noteType: string | null;
}

const RELATIONSHIP_ENTITY_TYPES = new Set([
  "character",
  "faction",
  "spacecraft",
  "technology",
  "location",
]);

export type ContinuityAuthoringContext =
  | { kind: "unavailable"; reason: string }
  | {
      kind: "ready";
      path: string;
      noteId: string;
      noteType: string | null;
      noteCanon: CanonStatus | null;
      facts: readonly ParsedContinuityFact[];
      noteChoices: readonly ContinuityNoteChoice[];
      sourceText: string;
    };

export function continuityAuthoringContext(
  index: LoreProjectIndex | null,
  activePath: string | null,
  sourceText: string,
  sourceSaved: boolean,
): ContinuityAuthoringContext {
  if (!index || !activePath) {
    return unavailable("Open a structured Markdown note to author continuity metadata.");
  }
  const document = index.documents.get(activePath);
  if (!document) return unavailable("Wait for the lore index to finish reading this note.");
  if (!sourceSaved) return unavailable("Save this note before editing its continuity metadata.");
  if (document.fingerprint !== fingerprintContent(sourceText)) {
    return unavailable("Wait for the lore index to catch up with this saved note.");
  }
  if (!document.id) {
    return unavailable("Continuity authoring requires a valid stable note ID in frontmatter.");
  }
  if (duplicateNoteIds(index).has(document.id)) {
    return unavailable("This note ID appears in more than one file. Resolve that collision before authoring facts.");
  }
  return {
    kind: "ready",
    path: document.path,
    noteId: document.id,
    noteType: document.type,
    noteCanon: document.canon,
    facts: document.facts,
    noteChoices: uniqueNoteChoices(index),
    sourceText,
  };
}

export function continuityNoteChoicesForProperty(
  choices: readonly ContinuityNoteChoice[],
  property: string,
  retainId = "",
): ContinuityNoteChoice[] {
  const targetTypes = continuityPropertyDefinition(property)?.targetTypes;
  if (!targetTypes) return [...choices];
  return choices.filter(
    ({ id, noteType }) =>
      id === retainId ||
      (noteType !== null && targetTypes.includes(noteType)),
  );
}

export function continuityRelationshipPropertyDefinitions(
  noteType: string | null,
): ContinuityPropertyDefinition[] {
  if (!noteType) return [];
  return (CONTINUITY_PROPERTY_DEFINITIONS as readonly ContinuityPropertyDefinition[])
    .filter(
      ({ inverseLabel, subjectTypes }) =>
        Boolean(inverseLabel) && subjectTypes.includes(noteType),
    );
}

export function continuityRelationshipFacts(
  facts: readonly ParsedContinuityFact[],
  choices: readonly ContinuityNoteChoice[],
): ParsedContinuityFact[] {
  const choicesById = new Map(choices.map((choice) => [choice.id, choice]));
  return facts.filter((fact) => {
    const definition = continuityPropertyDefinition(fact.property);
    if (definition?.inverseLabel) return true;
    if (definition || fact.value.kind !== "note") return false;
    const target = choicesById.get(fact.value.id);
    return Boolean(target?.noteType && RELATIONSHIP_ENTITY_TYPES.has(target.noteType));
  });
}

export function continuityRelationshipNoteChoices(
  choices: readonly ContinuityNoteChoice[],
  property: string,
  retainId = "",
): ContinuityNoteChoice[] {
  const definition = continuityPropertyDefinition(property);
  if (definition?.inverseLabel) {
    return continuityNoteChoicesForProperty(choices, property, retainId);
  }
  return choices.filter(
    ({ id, noteType }) =>
      id === retainId ||
      (noteType !== null && RELATIONSHIP_ENTITY_TYPES.has(noteType)),
  );
}

function uniqueNoteChoices(index: LoreProjectIndex): ContinuityNoteChoice[] {
  const records = new Map<string, LoreDocumentRecord[]>();
  for (const document of index.documents.values()) {
    if (!document.id) continue;
    const matches = records.get(document.id) ?? [];
    matches.push(document);
    records.set(document.id, matches);
  }
  return [...records]
    .filter(([, matches]) => matches.length === 1)
    .map(([id, matches]) => ({
      id,
      title: matches[0]!.title,
      path: matches[0]!.path,
      noteType: matches[0]!.type,
    }))
    .sort((left, right) =>
      left.title.localeCompare(right.title) || left.path.localeCompare(right.path),
    );
}

function duplicateNoteIds(index: LoreProjectIndex): ReadonlySet<string> {
  return new Set(
    index.issues
      .filter(({ kind }) => kind === "duplicate-note-id")
      .map(({ id }) => id),
  );
}

function unavailable(reason: string): ContinuityAuthoringContext {
  return { kind: "unavailable", reason };
}
