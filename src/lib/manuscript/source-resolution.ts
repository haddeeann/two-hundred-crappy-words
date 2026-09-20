import { fingerprintContent } from "$lib/editor/recovery";
import type {
  ManuscriptProjectLoadResult,
  ManuscriptSourceState,
  ReconciledManuscriptChapter,
  ReconciledManuscriptScene,
} from "./source-reconciliation";
import { parseManuscriptStructure, validateManuscriptFilePath } from "./structure";

export interface ManuscriptSourceResolutionTarget {
  manuscriptId: string;
  manuscriptTitle: string;
  itemId: string;
  itemTitle: string;
  itemKind: "chapter" | "scene";
  declaredPath: string;
  noteId?: string;
  sourceKind: ManuscriptSourceState["kind"];
  jsonPath: string;
  structureFingerprint: string;
}

interface ResolutionPlanBase {
  target: ManuscriptSourceResolutionTarget;
  originalText: string;
}

export type ManuscriptSourceResolutionPlan =
  | { kind: "unavailable"; reason: string }
  | (ResolutionPlanBase & {
      kind: "locate";
      selectedPath: string;
      selectedFingerprint: string;
      selectedBytes: number;
      updatedText: string;
      updatedFingerprint: string;
    })
  | (ResolutionPlanBase & {
      kind: "create";
      sourceText: string;
      sourceFingerprint: string;
    })
  | (ResolutionPlanBase & {
      kind: "remove";
      updatedText: string;
      updatedFingerprint: string;
    });

interface LocatedSource {
  target: ManuscriptSourceResolutionTarget;
  state: ManuscriptSourceState;
  manuscriptIndex: number;
  itemIndex: number;
  childIndex: number | null;
}

export function planLocateMissingManuscriptSource(
  result: ManuscriptProjectLoadResult,
  itemId: string,
  selectedPath: string,
  selectedText: string,
): ManuscriptSourceResolutionPlan {
  const located = locateSource(result, itemId);
  if (!located || result.kind !== "ready") return unavailableTarget();
  if (located.state.kind !== "missing") {
    return { kind: "unavailable", reason: "Locate is available only while the recorded prose source is missing." };
  }
  if (located.target.noteId) {
    return {
      kind: "unavailable",
      reason: "This source has a stable note ID. Use its identity-aware path repair instead of selecting a path manually.",
    };
  }
  const pathIssue = validateManuscriptFilePath(selectedPath);
  if (pathIssue) return { kind: "unavailable", reason: `The selected source path ${pathIssue}` };
  if (selectedPath === located.target.declaredPath) {
    return { kind: "unavailable", reason: "The selected source is the same missing path already recorded." };
  }

  const updated = replaceBindingPath(result, located, selectedPath);
  if (updated.kind === "unavailable") return updated;
  return {
    kind: "locate",
    target: located.target,
    selectedPath,
    selectedFingerprint: fingerprintContent(selectedText),
    selectedBytes: new TextEncoder().encode(selectedText).byteLength,
    originalText: result.text,
    updatedText: updated.text,
    updatedFingerprint: fingerprintContent(updated.text),
  };
}

export function planCreateMissingManuscriptSource(
  result: ManuscriptProjectLoadResult,
  itemId: string,
): ManuscriptSourceResolutionPlan {
  const located = locateSource(result, itemId);
  if (!located || result.kind !== "ready") return unavailableTarget();
  if (located.state.kind !== "missing") {
    return { kind: "unavailable", reason: "Create source is available only while the recorded prose path is missing." };
  }
  const sourceText = located.target.noteId
    ? `---\nid: "${located.target.noteId}"\n---\n\n`
    : "";
  return {
    kind: "create",
    target: located.target,
    originalText: result.text,
    sourceText,
    sourceFingerprint: fingerprintContent(sourceText),
  };
}

export function planRemoveMissingManuscriptScene(
  result: ManuscriptProjectLoadResult,
  itemId: string,
): ManuscriptSourceResolutionPlan {
  const located = locateSource(result, itemId);
  if (!located || result.kind !== "ready") return unavailableTarget();
  if (located.target.itemKind !== "scene") {
    return {
      kind: "unavailable",
      reason: "Only a scene entry can be removed here. A one-file chapter can instead be excluded or given a source.",
    };
  }
  if (located.state.kind === "ready") {
    return {
      kind: "unavailable",
      reason: "This scene has verified prose. Remove is offered here only for an unavailable source.",
    };
  }

  const source = cloneJsonRecord(result.source);
  const parent = rawParentArray(source, located);
  if (!parent || parent.values[located.childIndex ?? located.itemIndex]?.id !== itemId) {
    return { kind: "unavailable", reason: "The scene entry could not be located at its verified structure position." };
  }
  const removeIndex = located.childIndex ?? located.itemIndex;
  parent.values.splice(removeIndex, 1);
  const updated = validatedText(source);
  if (updated.kind === "unavailable") return updated;
  return {
    kind: "remove",
    target: located.target,
    originalText: result.text,
    updatedText: updated.text,
    updatedFingerprint: fingerprintContent(updated.text),
  };
}

function locateSource(
  result: ManuscriptProjectLoadResult,
  itemId: string,
): LocatedSource | null {
  if (result.kind !== "ready") return null;
  for (let manuscriptIndex = 0; manuscriptIndex < result.reconciled.manuscripts.length; manuscriptIndex += 1) {
    const manuscript = result.reconciled.manuscripts[manuscriptIndex]!;
    for (let itemIndex = 0; itemIndex < manuscript.items.length; itemIndex += 1) {
      const item = manuscript.items[itemIndex]!;
      if (item.item.id === itemId) {
        if ("children" in item) {
          if (!item.source) return null;
          return locatedSource(result, manuscript.manuscript.id, manuscript.manuscript.title, item, item.source, manuscriptIndex, itemIndex, null);
        }
        return locatedSource(result, manuscript.manuscript.id, manuscript.manuscript.title, item, item.source, manuscriptIndex, itemIndex, null);
      }
      if ("children" in item) {
        for (let childIndex = 0; childIndex < item.children.length; childIndex += 1) {
          const child = item.children[childIndex]!;
          if (child.item.id === itemId) {
            return locatedSource(result, manuscript.manuscript.id, manuscript.manuscript.title, child, child.source, manuscriptIndex, itemIndex, childIndex);
          }
        }
      }
    }
  }
  return null;
}

function locatedSource(
  result: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  manuscriptId: string,
  manuscriptTitle: string,
  item: ReconciledManuscriptChapter | ReconciledManuscriptScene,
  state: ManuscriptSourceState,
  manuscriptIndex: number,
  itemIndex: number,
  childIndex: number | null,
): LocatedSource {
  const base = `$.manuscripts[${manuscriptIndex}].items[${itemIndex}]${childIndex === null ? "" : `.children[${childIndex}]`}`;
  const noteId = item.item.source?.noteId;
  return {
    state,
    manuscriptIndex,
    itemIndex,
    childIndex,
    target: {
      manuscriptId,
      manuscriptTitle,
      itemId: item.item.id,
      itemTitle: item.item.title,
      itemKind: item.item.kind,
      declaredPath: state.declaredPath,
      ...(noteId ? { noteId } : {}),
      sourceKind: state.kind,
      jsonPath: base,
      structureFingerprint: result.fingerprint,
    },
  };
}

function replaceBindingPath(
  result: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  located: LocatedSource,
  selectedPath: string,
): { kind: "ready"; text: string } | { kind: "unavailable"; reason: string } {
  const source = cloneJsonRecord(result.source);
  const raw = rawItem(source, located);
  const binding = raw && isRecord(raw.source) ? raw.source : null;
  if (!binding || binding.path !== located.target.declaredPath) {
    return { kind: "unavailable", reason: "The recorded source binding could not be located exactly." };
  }
  binding.path = selectedPath;
  return validatedText(source);
}

function rawParentArray(
  source: Record<string, unknown>,
  located: LocatedSource,
): { values: Record<string, unknown>[] } | null {
  const manuscript = recordAt(arrayAt(source.manuscripts), located.manuscriptIndex);
  const items = manuscript ? arrayAt(manuscript.items) : null;
  if (!items) return null;
  if (located.childIndex === null) return { values: items };
  const chapter = recordAt(items, located.itemIndex);
  const children = chapter ? arrayAt(chapter.children) : null;
  return children ? { values: children } : null;
}

function rawItem(source: Record<string, unknown>, located: LocatedSource): Record<string, unknown> | null {
  const manuscript = recordAt(arrayAt(source.manuscripts), located.manuscriptIndex);
  const items = manuscript ? arrayAt(manuscript.items) : null;
  let item = recordAt(items, located.itemIndex);
  if (located.childIndex !== null) item = recordAt(item ? arrayAt(item.children) : null, located.childIndex);
  return item?.id === located.target.itemId ? item : null;
}

function validatedText(
  source: Record<string, unknown>,
): { kind: "ready"; text: string } | { kind: "unavailable"; reason: string } {
  const text = `${JSON.stringify(source, null, 2)}\n`;
  const parsed = parseManuscriptStructure(text);
  if (parsed.kind === "valid") return { kind: "ready", text };
  return {
    kind: "unavailable",
    reason: parsed.kind === "invalid"
      ? parsed.issues.map(({ path, message }) => `${path}: ${message}`).join(" ")
      : parsed.kind === "malformed"
        ? parsed.message
        : `Unsupported structure version ${parsed.version}.`,
  };
}

function unavailableTarget(): ManuscriptSourceResolutionPlan {
  return { kind: "unavailable", reason: "This prose binding is not available in the current verified manuscript structure." };
}

function arrayAt(value: unknown): Record<string, unknown>[] | null {
  return Array.isArray(value) && value.every(isRecord) ? value : null;
}

function recordAt(values: Record<string, unknown>[] | null, index: number): Record<string, unknown> | null {
  return values?.[index] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  const cloned: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(cloned)) throw new TypeError("The validated manuscript structure did not clone to a JSON object.");
  return cloned;
}
