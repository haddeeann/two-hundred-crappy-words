import { fingerprintContent } from "$lib/editor/recovery";
import type {
  ManuscriptProjectLoadResult,
  ReconciledManuscriptItem,
} from "./source-reconciliation";
import { parseManuscriptStructure } from "./structure";

export interface ManuscriptMetadataDraft {
  title: string;
  synopsis: string;
  pov: string;
  location: string;
  storyDate: string;
  status: string;
  labels: string;
  notes: string;
  targetWords: string;
  includeInCompile: boolean;
}

export interface ManuscriptMetadataTarget {
  manuscriptTitle: string;
  itemId: string;
  itemKind: "chapter" | "scene";
  itemTitle: string;
  jsonPath: string;
  structureFingerprint: string;
}

export interface ManuscriptMetadataChange {
  field: keyof ManuscriptMetadataDraft;
  label: string;
  jsonPath: string;
  before: string;
  after: string;
}

export type ManuscriptMetadataEditorState =
  | { kind: "unavailable"; reason: string }
  | { kind: "ready"; target: ManuscriptMetadataTarget; draft: ManuscriptMetadataDraft };

export type ManuscriptMetadataEditPlan =
  | { kind: "unavailable"; reason: string }
  | { kind: "blocked"; issues: { path: string; message: string }[] }
  | { kind: "unchanged"; target: ManuscriptMetadataTarget }
  | {
      kind: "ready";
      target: ManuscriptMetadataTarget;
      draft: ManuscriptMetadataDraft;
      changes: ManuscriptMetadataChange[];
      originalText: string;
      updatedText: string;
      updatedFingerprint: string;
    };

interface LocatedItem {
  item: ReconciledManuscriptItem;
  target: ManuscriptMetadataTarget;
  manuscriptIndex: number;
  itemIndex: number;
  childIndex: number | null;
}

const FIELD_LABELS: Record<keyof ManuscriptMetadataDraft, string> = {
  title: "Title",
  synopsis: "Synopsis",
  pov: "Point of view",
  location: "Location",
  storyDate: "Story date",
  status: "Status",
  labels: "Labels",
  notes: "Notes",
  targetWords: "Word target",
  includeInCompile: "Include in compile",
};

export function manuscriptMetadataEditorState(
  result: ManuscriptProjectLoadResult,
  itemId: string,
): ManuscriptMetadataEditorState {
  const located = locateItem(result, itemId);
  if (!located) {
    return {
      kind: "unavailable",
      reason: "This chapter or scene is not available in the current verified manuscript structure.",
    };
  }
  const item = located.item.item;
  return {
    kind: "ready",
    target: located.target,
    draft: {
      title: item.title,
      synopsis: item.synopsis ?? "",
      pov: item.pov ?? "",
      location: item.location ?? "",
      storyDate: item.storyDate ?? "",
      status: item.status ?? "",
      labels: item.labels?.join("\n") ?? "",
      notes: item.notes ?? "",
      targetWords: item.targetWords?.toString() ?? "",
      includeInCompile: item.includeInCompile,
    },
  };
}

export function planManuscriptMetadataEdit(
  result: ManuscriptProjectLoadResult,
  itemId: string,
  draft: ManuscriptMetadataDraft,
): ManuscriptMetadataEditPlan {
  const located = locateItem(result, itemId);
  if (!located || result.kind !== "ready") {
    return {
      kind: "unavailable",
      reason: "This chapter or scene is not available in the current verified manuscript structure.",
    };
  }
  const targetWords = parseDraftTargetWords(draft.targetWords, `${located.target.jsonPath}.targetWords`);
  if (targetWords.kind === "blocked") return targetWords;

  const desired: Record<keyof ManuscriptMetadataDraft, string | string[] | number | boolean | undefined> = {
    title: draft.title.trim(),
    synopsis: optionalText(draft.synopsis),
    pov: optionalText(draft.pov),
    location: optionalText(draft.location),
    storyDate: optionalText(draft.storyDate),
    status: optionalText(draft.status),
    labels: draftLabels(draft.labels),
    notes: optionalText(draft.notes),
    targetWords: targetWords.value,
    includeInCompile: draft.includeInCompile,
  };
  const current = located.item.item;
  const currentValues: typeof desired = {
    title: current.title,
    synopsis: current.synopsis,
    pov: current.pov,
    location: current.location,
    storyDate: current.storyDate,
    status: current.status,
    labels: current.labels,
    notes: current.notes,
    targetWords: current.targetWords,
    includeInCompile: current.includeInCompile,
  };
  const changedFields = (Object.keys(desired) as (keyof ManuscriptMetadataDraft)[])
    .filter((field) => !sameValue(currentValues[field], desired[field]));
  if (changedFields.length === 0) {
    return { kind: "unchanged", target: located.target };
  }

  const source = cloneJsonRecord(result.source);
  const rawItem = rawItemAt(source, located);
  if (!rawItem) {
    return { kind: "unavailable", reason: "The selected item could not be located in the source JSON." };
  }
  for (const field of changedFields) {
    const jsonField = jsonFieldName(field);
    const value = desired[field];
    if (field === "includeInCompile" && value === true) {
      delete rawItem[jsonField];
    } else if (value === undefined || (field === "labels" && Array.isArray(value) && value.length === 0)) {
      delete rawItem[jsonField];
    } else {
      rawItem[jsonField] = value;
    }
  }
  const updatedText = `${JSON.stringify(source, null, 2)}\n`;
  const parsed = parseManuscriptStructure(updatedText);
  if (parsed.kind !== "valid") {
    return parsed.kind === "invalid"
      ? { kind: "blocked", issues: parsed.issues }
      : {
          kind: "blocked",
          issues: [{
            path: "$",
            message: parsed.kind === "malformed"
              ? parsed.message
              : `Unsupported structure version ${parsed.version}.`,
          }],
        };
  }

  return {
    kind: "ready",
    target: located.target,
    draft: { ...draft },
    changes: changedFields.map((field) => ({
      field,
      label: FIELD_LABELS[field],
      jsonPath: `${located.target.jsonPath}.${jsonFieldName(field)}`,
      before: presentValue(field, currentValues[field]),
      after: presentValue(field, desired[field]),
    })),
    originalText: result.text,
    updatedText,
    updatedFingerprint: fingerprintContent(updatedText),
  };
}

function locateItem(result: ManuscriptProjectLoadResult, itemId: string): LocatedItem | null {
  if (result.kind !== "ready") return null;
  for (let manuscriptIndex = 0; manuscriptIndex < result.reconciled.manuscripts.length; manuscriptIndex += 1) {
    const manuscript = result.reconciled.manuscripts[manuscriptIndex]!;
    for (let itemIndex = 0; itemIndex < manuscript.items.length; itemIndex += 1) {
      const item = manuscript.items[itemIndex]!;
      if (item.item.id === itemId) {
        return located(result, manuscript.manuscript.title, item, manuscriptIndex, itemIndex, null);
      }
      if ("children" in item) {
        for (let childIndex = 0; childIndex < item.children.length; childIndex += 1) {
          const child = item.children[childIndex]!;
          if (child.item.id === itemId) {
            return located(result, manuscript.manuscript.title, child, manuscriptIndex, itemIndex, childIndex);
          }
        }
      }
    }
  }
  return null;
}

function located(
  result: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  manuscriptTitle: string,
  item: ReconciledManuscriptItem,
  manuscriptIndex: number,
  itemIndex: number,
  childIndex: number | null,
): LocatedItem {
  const base = `$.manuscripts[${manuscriptIndex}].items[${itemIndex}]`;
  return {
    item,
    manuscriptIndex,
    itemIndex,
    childIndex,
    target: {
      manuscriptTitle,
      itemId: item.item.id,
      itemKind: item.item.kind,
      itemTitle: item.item.title,
      jsonPath: childIndex === null ? base : `${base}.children[${childIndex}]`,
      structureFingerprint: result.fingerprint,
    },
  };
}

function rawItemAt(source: Record<string, unknown>, locatedItem: LocatedItem): Record<string, unknown> | null {
  const manuscripts = Array.isArray(source.manuscripts) ? source.manuscripts : [];
  const manuscript = recordAt(manuscripts, locatedItem.manuscriptIndex);
  const items = manuscript && Array.isArray(manuscript.items) ? manuscript.items : [];
  let item = recordAt(items, locatedItem.itemIndex);
  if (locatedItem.childIndex !== null) {
    const children = item && Array.isArray(item.children) ? item.children : [];
    item = recordAt(children, locatedItem.childIndex);
  }
  return item?.id === locatedItem.target.itemId ? item : null;
}

function parseDraftTargetWords(
  value: string,
  path: string,
): { kind: "ready"; value: number | undefined } | Extract<ManuscriptMetadataEditPlan, { kind: "blocked" }> {
  const trimmed = value.trim();
  if (!trimmed) return { kind: "ready", value: undefined };
  if (!/^[0-9]+$/u.test(trimmed)) {
    return { kind: "blocked", issues: [{ path, message: "Word target must be a whole number." }] };
  }
  return { kind: "ready", value: Number(trimmed) };
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function draftLabels(value: string): string[] | undefined {
  const labels = value.split(/\r?\n/u).map((label) => label.trim()).filter(Boolean);
  return labels.length > 0 ? labels : undefined;
}

function jsonFieldName(field: keyof ManuscriptMetadataDraft): string {
  return field === "targetWords" ? "targetWords" : field;
}

function sameValue(first: unknown, second: unknown): boolean {
  if (Array.isArray(first) || Array.isArray(second)) {
    return Array.isArray(first) && Array.isArray(second) &&
      first.length === second.length && first.every((value, index) => value === second[index]);
  }
  return first === second;
}

function presentValue(field: keyof ManuscriptMetadataDraft, value: unknown): string {
  if (value === undefined) return "Not set";
  if (field === "labels") return (value as string[]).join(" · ") || "Not set";
  if (field === "includeInCompile") return value ? "Included" : "Excluded";
  return String(value);
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  const cloned: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(cloned)) throw new TypeError("The manuscript structure did not clone to a JSON object.");
  return cloned;
}

function recordAt(values: unknown[], index: number): Record<string, unknown> | null {
  const value = values[index];
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
