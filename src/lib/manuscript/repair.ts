import { fingerprintContent } from "$lib/editor/recovery";
import type {
  ManuscriptProjectLoadResult,
  ManuscriptSourceState,
  ReconciledManuscriptChapter,
  ReconciledManuscriptScene,
} from "./source-reconciliation";
import { parseManuscriptStructure } from "./structure";

export type ManuscriptRepairBinding = "overview" | "source";

export interface ManuscriptSourceRepairCandidate {
  key: string;
  manuscriptTitle: string;
  itemId: string;
  itemTitle: string;
  binding: ManuscriptRepairBinding;
  bindingLabel: string;
  oldPath: string;
  suggestedPath: string;
  noteId: string;
  candidateFingerprint: string;
  structureFingerprint: string;
}

export type ManuscriptSourceRepairPlan =
  | { kind: "unavailable"; reason: string }
  | {
      kind: "ready";
      candidate: ManuscriptSourceRepairCandidate;
      jsonPath: string;
      originalText: string;
      updatedText: string;
      updatedFingerprint: string;
    };

interface LocatedCandidate {
  candidate: ManuscriptSourceRepairCandidate;
  manuscriptIndex: number;
  itemIndex: number;
  childIndex: number | null;
}

export function manuscriptSourceRepairCandidates(
  result: ManuscriptProjectLoadResult,
): ManuscriptSourceRepairCandidate[] {
  if (result.kind !== "ready") return [];
  const candidates: LocatedCandidate[] = [];
  result.reconciled.manuscripts.forEach((manuscript, manuscriptIndex) => {
    manuscript.items.forEach((item, itemIndex) => {
      if ("children" in item) {
        addChapterCandidates(
          result,
          manuscript.manuscript.title,
          item,
          manuscriptIndex,
          itemIndex,
          candidates,
        );
      } else {
        addCandidate(
          result,
          manuscript.manuscript.title,
          item,
          "source",
          item.source,
          manuscriptIndex,
          itemIndex,
          null,
          candidates,
        );
      }
    });
  });
  return candidates.map(({ candidate }) => candidate);
}

export function planManuscriptSourceRepair(
  result: ManuscriptProjectLoadResult,
  key: string,
): ManuscriptSourceRepairPlan {
  if (result.kind !== "ready") {
    return { kind: "unavailable", reason: "The manuscript structure is not currently valid and verified." };
  }
  const located = locateCandidate(result, key);
  if (!located) {
    return {
      kind: "unavailable",
      reason: "This binding is not a unique, verified moved-source repair candidate.",
    };
  }

  const source = structuredClone(result.source);
  const path = rawBindingPath(source, located);
  if (!path) {
    return { kind: "unavailable", reason: "The previewed binding could not be located in the source structure." };
  }
  if (path.binding.path !== located.candidate.oldPath) {
    return { kind: "unavailable", reason: "The source structure no longer contains the previewed old path." };
  }
  path.binding.path = located.candidate.suggestedPath;
  const updatedText = `${JSON.stringify(source, null, 2)}\n`;
  const parsed = parseManuscriptStructure(updatedText);
  if (parsed.kind !== "valid") {
    return {
      kind: "unavailable",
      reason: parsed.kind === "invalid"
        ? parsed.issues.map(({ path, message }) => `${path}: ${message}`).join(" ")
        : parsed.kind === "malformed"
          ? parsed.message
          : `Unsupported structure version ${parsed.version}.`,
    };
  }
  return {
    kind: "ready",
    candidate: located.candidate,
    jsonPath: path.jsonPath,
    originalText: result.text,
    updatedText,
    updatedFingerprint: fingerprintContent(updatedText),
  };
}

function addChapterCandidates(
  result: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  manuscriptTitle: string,
  chapter: ReconciledManuscriptChapter,
  manuscriptIndex: number,
  itemIndex: number,
  candidates: LocatedCandidate[],
): void {
  addCandidate(
    result,
    manuscriptTitle,
    chapter,
    "overview",
    chapter.overview,
    manuscriptIndex,
    itemIndex,
    null,
    candidates,
  );
  addCandidate(
    result,
    manuscriptTitle,
    chapter,
    "source",
    chapter.source,
    manuscriptIndex,
    itemIndex,
    null,
    candidates,
  );
  chapter.children.forEach((scene, childIndex) =>
    addCandidate(
      result,
      manuscriptTitle,
      scene,
      "source",
      scene.source,
      manuscriptIndex,
      itemIndex,
      childIndex,
      candidates,
    ),
  );
}

function addCandidate(
  result: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  manuscriptTitle: string,
  item: ReconciledManuscriptChapter | ReconciledManuscriptScene,
  binding: ManuscriptRepairBinding,
  state: ManuscriptSourceState | null,
  manuscriptIndex: number,
  itemIndex: number,
  childIndex: number | null,
  candidates: LocatedCandidate[],
): void {
  if (state?.kind !== "moved" || state.declaredPathOccupied || !state.noteId) return;
  candidates.push({
    candidate: {
      key: `${item.item.id}:${binding}`,
      manuscriptTitle,
      itemId: item.item.id,
      itemTitle: item.item.title,
      binding,
      bindingLabel: binding === "overview" ? "Chapter overview" : "Prose source",
      oldPath: state.declaredPath,
      suggestedPath: state.suggestedPath,
      noteId: state.noteId,
      candidateFingerprint: state.fingerprint,
      structureFingerprint: result.fingerprint,
    },
    manuscriptIndex,
    itemIndex,
    childIndex,
  });
}

function locateCandidate(
  result: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  key: string,
): LocatedCandidate | null {
  const candidates: LocatedCandidate[] = [];
  result.reconciled.manuscripts.forEach((manuscript, manuscriptIndex) => {
    manuscript.items.forEach((item, itemIndex) => {
      if ("children" in item) {
        addChapterCandidates(
          result,
          manuscript.manuscript.title,
          item,
          manuscriptIndex,
          itemIndex,
          candidates,
        );
      } else {
        addCandidate(
          result,
          manuscript.manuscript.title,
          item,
          "source",
          item.source,
          manuscriptIndex,
          itemIndex,
          null,
          candidates,
        );
      }
    });
  });
  return candidates.find(({ candidate }) => candidate.key === key) ?? null;
}

function rawBindingPath(
  source: Record<string, unknown>,
  located: LocatedCandidate,
): { binding: Record<string, unknown>; jsonPath: string } | null {
  const manuscripts = Array.isArray(source.manuscripts) ? source.manuscripts : null;
  const manuscript = recordAt(manuscripts, located.manuscriptIndex);
  const items = manuscript && Array.isArray(manuscript.items) ? manuscript.items : null;
  let item = recordAt(items, located.itemIndex);
  let jsonPath = `manuscripts[${located.manuscriptIndex}].items[${located.itemIndex}]`;
  if (located.childIndex !== null) {
    const children = item && Array.isArray(item.children) ? item.children : null;
    item = recordAt(children, located.childIndex);
    jsonPath += `.children[${located.childIndex}]`;
  }
  const bindingValue = item?.[located.candidate.binding];
  const binding = isRecord(bindingValue) ? bindingValue : null;
  return binding
    ? { binding, jsonPath: `${jsonPath}.${located.candidate.binding}.path` }
    : null;
}

function recordAt(values: unknown[] | null, index: number): Record<string, unknown> | null {
  const value = values?.[index];
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
