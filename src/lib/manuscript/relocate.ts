import { fingerprintContent } from "$lib/editor/recovery";
import type { ManuscriptProjectLoadResult } from "./source-reconciliation";
import {
  parseManuscriptStructure,
  type ManuscriptChapter,
  type ManuscriptOutlineItem,
  type ManuscriptScene,
} from "./structure";

export interface ManuscriptSceneMovePosition {
  index: number;
  label: string;
}

export interface ManuscriptSceneMoveDestination {
  key: string;
  label: string;
  arrayJsonPath: string;
  positions: ManuscriptSceneMovePosition[];
}

export interface ManuscriptSceneMoveTarget {
  manuscriptTitle: string;
  sceneId: string;
  sceneTitle: string;
  sourceContainerLabel: string;
  sourceArrayJsonPath: string;
  oldPosition: number;
  destinationKey: string;
  destinationContainerLabel: string;
  destinationArrayJsonPath: string;
  destinationIndex: number;
  newPosition: number;
  placementLabel: string;
  structureFingerprint: string;
}

export type ManuscriptSceneMovePlan =
  | { kind: "unavailable"; reason: string }
  | {
      kind: "ready";
      target: ManuscriptSceneMoveTarget;
      originalText: string;
      updatedText: string;
      updatedFingerprint: string;
    };

interface LocatedScene {
  scene: ManuscriptScene;
  manuscriptIndex: number;
  manuscriptTitle: string;
  sourceItemIndex: number;
  sourceChildIndex: number | null;
  sourceContainerLabel: string;
  sourceArrayJsonPath: string;
}

interface LocatedDestination {
  key: string;
  label: string;
  manuscriptIndex: number;
  chapterItemIndex: number | null;
  items: ManuscriptOutlineItem[];
  arrayJsonPath: string;
}

export function manuscriptSceneMoveDestinations(
  result: ManuscriptProjectLoadResult,
  sceneId: string,
): ManuscriptSceneMoveDestination[] {
  if (result.kind !== "ready") return [];
  const located = locateScene(result, sceneId);
  if (!located) return [];
  return locateDestinations(result, located).map((destination) => ({
    key: destination.key,
    label: destination.label,
    arrayJsonPath: destination.arrayJsonPath,
    positions: insertionPositions(destination.items),
  }));
}

export function planManuscriptSceneMove(
  result: ManuscriptProjectLoadResult,
  sceneId: string,
  destinationKey: string,
  destinationIndex: number,
): ManuscriptSceneMovePlan {
  if (result.kind !== "ready") {
    return { kind: "unavailable", reason: "The manuscript structure is not currently valid and verified." };
  }
  const located = locateScene(result, sceneId);
  if (!located) {
    return { kind: "unavailable", reason: "This scene is not in the current verified outline." };
  }
  const destination = locateDestinations(result, located)
    .find((candidate) => candidate.key === destinationKey);
  if (!destination) {
    return { kind: "unavailable", reason: "Choose a different chapter or the manuscript top level." };
  }
  if (
    !Number.isSafeInteger(destinationIndex) ||
    destinationIndex < 0 ||
    destinationIndex > destination.items.length
  ) {
    return { kind: "unavailable", reason: "The selected destination position is no longer available." };
  }

  const source = cloneJsonRecord(result.source);
  const rawSource = rawContainerArray(source, located.manuscriptIndex, located.sourceChildIndex === null
    ? null
    : located.sourceItemIndex);
  const rawDestination = rawContainerArray(
    source,
    destination.manuscriptIndex,
    destination.chapterItemIndex,
  );
  if (!rawSource || !rawDestination || rawSource === rawDestination) {
    return { kind: "unavailable", reason: "The source or destination array could not be located safely." };
  }
  const sourceIndex = located.sourceChildIndex ?? located.sourceItemIndex;
  const selected = rawSource[sourceIndex];
  if (!isRecord(selected) || selected.kind !== "scene" || selected.id !== located.scene.id) {
    return { kind: "unavailable", reason: "The source JSON no longer matches the verified scene location." };
  }
  rawSource.splice(sourceIndex, 1);
  rawDestination.splice(destinationIndex, 0, selected);

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
  const position = insertionPositions(destination.items)
    .find((candidate) => candidate.index === destinationIndex)!;
  return {
    kind: "ready",
    target: {
      manuscriptTitle: located.manuscriptTitle,
      sceneId: located.scene.id,
      sceneTitle: located.scene.title,
      sourceContainerLabel: located.sourceContainerLabel,
      sourceArrayJsonPath: located.sourceArrayJsonPath,
      oldPosition: sourceIndex + 1,
      destinationKey,
      destinationContainerLabel: destination.label,
      destinationArrayJsonPath: destination.arrayJsonPath,
      destinationIndex,
      newPosition: destinationIndex + 1,
      placementLabel: position.label,
      structureFingerprint: result.fingerprint,
    },
    originalText: result.text,
    updatedText,
    updatedFingerprint: fingerprintContent(updatedText),
  };
}

function locateScene(
  result: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  sceneId: string,
): LocatedScene | null {
  for (let manuscriptIndex = 0; manuscriptIndex < result.reconciled.structure.manuscripts.length; manuscriptIndex += 1) {
    const manuscript = result.reconciled.structure.manuscripts[manuscriptIndex]!;
    for (let itemIndex = 0; itemIndex < manuscript.items.length; itemIndex += 1) {
      const item = manuscript.items[itemIndex]!;
      if (item.kind === "scene" && item.id === sceneId) {
        return {
          scene: item,
          manuscriptIndex,
          manuscriptTitle: manuscript.title,
          sourceItemIndex: itemIndex,
          sourceChildIndex: null,
          sourceContainerLabel: `manuscript “${manuscript.title}” top level`,
          sourceArrayJsonPath: `$.manuscripts[${manuscriptIndex}].items`,
        };
      }
      if (item.kind !== "chapter") continue;
      const childIndex = item.children.findIndex((child) => child.id === sceneId);
      if (childIndex >= 0) {
        return {
          scene: item.children[childIndex]!,
          manuscriptIndex,
          manuscriptTitle: manuscript.title,
          sourceItemIndex: itemIndex,
          sourceChildIndex: childIndex,
          sourceContainerLabel: `chapter “${item.title}”`,
          sourceArrayJsonPath: `$.manuscripts[${manuscriptIndex}].items[${itemIndex}].children`,
        };
      }
    }
  }
  return null;
}

function locateDestinations(
  result: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  scene: LocatedScene,
): LocatedDestination[] {
  const manuscript = result.reconciled.structure.manuscripts[scene.manuscriptIndex]!;
  const destinations: LocatedDestination[] = [];
  if (scene.sourceChildIndex !== null) {
    destinations.push({
      key: `manuscript:${manuscript.id}`,
      label: `manuscript “${manuscript.title}” top level`,
      manuscriptIndex: scene.manuscriptIndex,
      chapterItemIndex: null,
      items: manuscript.items,
      arrayJsonPath: `$.manuscripts[${scene.manuscriptIndex}].items`,
    });
  }
  for (let itemIndex = 0; itemIndex < manuscript.items.length; itemIndex += 1) {
    const item = manuscript.items[itemIndex]!;
    if (
      item.kind !== "chapter" ||
      item.source ||
      (itemIndex === scene.sourceItemIndex && scene.sourceChildIndex !== null)
    ) {
      continue;
    }
    destinations.push({
      key: `chapter:${item.id}`,
      label: `chapter “${item.title}”`,
      manuscriptIndex: scene.manuscriptIndex,
      chapterItemIndex: itemIndex,
      items: item.children,
      arrayJsonPath: `$.manuscripts[${scene.manuscriptIndex}].items[${itemIndex}].children`,
    });
  }
  return destinations;
}

function insertionPositions(items: readonly ManuscriptOutlineItem[]): ManuscriptSceneMovePosition[] {
  const positions: ManuscriptSceneMovePosition[] = [{ index: 0, label: "At beginning" }];
  for (let index = 1; index <= items.length; index += 1) {
    positions.push({ index, label: `After “${items[index - 1]!.title}”` });
  }
  return positions;
}

function rawContainerArray(
  source: Record<string, unknown>,
  manuscriptIndex: number,
  chapterItemIndex: number | null,
): unknown[] | null {
  const manuscripts = Array.isArray(source.manuscripts) ? source.manuscripts : null;
  const manuscript = recordAt(manuscripts, manuscriptIndex);
  const items = manuscript && Array.isArray(manuscript.items) ? manuscript.items : null;
  if (chapterItemIndex === null) return items;
  const chapter = recordAt(items, chapterItemIndex);
  return chapter && Array.isArray(chapter.children) ? chapter.children : null;
}

function recordAt(values: unknown[] | null, index: number): Record<string, unknown> | null {
  const value = values?.[index];
  return isRecord(value) ? value : null;
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  const cloned: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(cloned)) throw new TypeError("The validated manuscript structure did not clone to a JSON object.");
  return cloned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
