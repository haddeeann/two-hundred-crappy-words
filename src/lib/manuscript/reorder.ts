import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  parseManuscriptStructure,
  type ManuscriptOutlineItem,
} from "./structure";

export type ManuscriptReorderDirection = "earlier" | "later";

export interface ManuscriptReorderTarget {
  manuscriptTitle: string;
  containerLabel: string;
  itemId: string;
  itemTitle: string;
  itemKind: "chapter" | "scene";
  neighborId: string;
  neighborTitle: string;
  direction: ManuscriptReorderDirection;
  oldPosition: number;
  newPosition: number;
  arrayJsonPath: string;
  structureFingerprint: string;
}

export type ManuscriptReorderPlan =
  | { kind: "unavailable"; reason: string }
  | {
      kind: "ready";
      target: ManuscriptReorderTarget;
      originalText: string;
      updatedText: string;
      updatedFingerprint: string;
    };

interface LocatedItem {
  item: ManuscriptOutlineItem;
  siblingIndex: number;
  siblingCount: number;
  manuscriptIndex: number;
  itemIndex: number;
  childIndex: number | null;
  manuscriptTitle: string;
  containerLabel: string;
  siblings: ManuscriptOutlineItem[];
  arrayJsonPath: string;
}

export function canReorderManuscriptItem(
  result: ManuscriptProjectLoadResult,
  itemId: string,
  direction: ManuscriptReorderDirection,
): boolean {
  const located = locateItem(result, itemId);
  if (!located) return false;
  return destinationIndex(located, direction) !== null;
}

export function planManuscriptReorder(
  result: ManuscriptProjectLoadResult,
  itemId: string,
  direction: ManuscriptReorderDirection,
): ManuscriptReorderPlan {
  if (result.kind !== "ready") {
    return { kind: "unavailable", reason: "The manuscript structure is not currently valid and verified." };
  }
  const located = locateItem(result, itemId);
  if (!located) {
    return { kind: "unavailable", reason: "This chapter or scene is not in the current verified outline." };
  }
  const newIndex = destinationIndex(located, direction);
  if (newIndex === null) {
    return {
      kind: "unavailable",
      reason: `${located.item.title} is already ${direction === "earlier" ? "first" : "last"} in ${located.containerLabel}.`,
    };
  }
  const neighbor = located.siblings[newIndex];
  if (!neighbor) {
    return { kind: "unavailable", reason: "The neighboring outline item is no longer available." };
  }

  const source = cloneJsonRecord(result.source);
  const rawSiblings = rawSiblingArray(source, located);
  if (!rawSiblings || rawSiblings.length !== located.siblingCount) {
    return { kind: "unavailable", reason: "The previewed sibling group could not be located in the source JSON." };
  }
  const selected = rawSiblings[located.siblingIndex];
  const adjacent = rawSiblings[newIndex];
  if (
    !isRecord(selected) ||
    selected.id !== located.item.id ||
    !isRecord(adjacent) ||
    adjacent.id !== neighbor.id
  ) {
    return { kind: "unavailable", reason: "The source JSON no longer matches the verified sibling order." };
  }
  rawSiblings.splice(located.siblingIndex, 1);
  rawSiblings.splice(newIndex, 0, selected);

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
    target: {
      manuscriptTitle: located.manuscriptTitle,
      containerLabel: located.containerLabel,
      itemId: located.item.id,
      itemTitle: located.item.title,
      itemKind: located.item.kind,
      neighborId: neighbor.id,
      neighborTitle: neighbor.title,
      direction,
      oldPosition: located.siblingIndex + 1,
      newPosition: newIndex + 1,
      arrayJsonPath: located.arrayJsonPath,
      structureFingerprint: result.fingerprint,
    },
    originalText: result.text,
    updatedText,
    updatedFingerprint: fingerprintContent(updatedText),
  };
}

function locateItem(
  result: ManuscriptProjectLoadResult,
  itemId: string,
): LocatedItem | null {
  if (result.kind !== "ready") return null;
  const manuscripts = result.reconciled.structure.manuscripts;
  for (let manuscriptIndex = 0; manuscriptIndex < manuscripts.length; manuscriptIndex += 1) {
    const manuscript = manuscripts[manuscriptIndex]!;
    for (let itemIndex = 0; itemIndex < manuscript.items.length; itemIndex += 1) {
      const item = manuscript.items[itemIndex]!;
      if (item.id === itemId) {
        return {
          item,
          siblingIndex: itemIndex,
          siblingCount: manuscript.items.length,
          manuscriptIndex,
          itemIndex,
          childIndex: null,
          manuscriptTitle: manuscript.title,
          containerLabel: `manuscript “${manuscript.title}”`,
          siblings: manuscript.items,
          arrayJsonPath: `$.manuscripts[${manuscriptIndex}].items`,
        };
      }
      if (item.kind === "chapter") {
        const childIndex = item.children.findIndex((child) => child.id === itemId);
        if (childIndex >= 0) {
          return {
            item: item.children[childIndex]!,
            siblingIndex: childIndex,
            siblingCount: item.children.length,
            manuscriptIndex,
            itemIndex,
            childIndex,
            manuscriptTitle: manuscript.title,
            containerLabel: `chapter “${item.title}”`,
            siblings: item.children,
            arrayJsonPath: `$.manuscripts[${manuscriptIndex}].items[${itemIndex}].children`,
          };
        }
      }
    }
  }
  return null;
}

function destinationIndex(
  located: LocatedItem,
  direction: ManuscriptReorderDirection,
): number | null {
  const candidate = located.siblingIndex + (direction === "earlier" ? -1 : 1);
  return candidate >= 0 && candidate < located.siblingCount ? candidate : null;
}

function rawSiblingArray(
  source: Record<string, unknown>,
  located: LocatedItem,
): unknown[] | null {
  const manuscripts = Array.isArray(source.manuscripts) ? source.manuscripts : null;
  const manuscript = recordAt(manuscripts, located.manuscriptIndex);
  const items = manuscript && Array.isArray(manuscript.items) ? manuscript.items : null;
  if (located.childIndex === null) return items;
  const chapter = recordAt(items, located.itemIndex);
  return chapter && Array.isArray(chapter.children) ? chapter.children : null;
}

function recordAt(values: unknown[] | null, index: number): Record<string, unknown> | null {
  const value = values?.[index];
  return isRecord(value) ? value : null;
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  const cloned: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(cloned)) {
    throw new TypeError("The validated manuscript structure did not clone to a JSON object.");
  }
  return cloned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
