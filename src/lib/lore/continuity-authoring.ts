import { fingerprintContent } from "$lib/editor/recovery";
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
}

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
