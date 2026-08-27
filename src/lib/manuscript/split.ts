import { fingerprintContent } from "$lib/editor/recovery";
import type {
  ManuscriptProjectLoadResult,
  ReconciledManuscriptScene,
} from "./source-reconciliation";
import {
  parseManuscriptStructure,
  type ManuscriptOutlineItem,
} from "./structure";

export interface ManuscriptSceneSplitRequest {
  sourcePath: string;
  sourceText: string;
  sourceFingerprint: string;
  caretOffset: number;
  newSceneId: string;
  newSceneTitle: string;
  newSourcePath: string;
}

export interface ManuscriptSceneSplitTarget {
  manuscriptTitle: string;
  sceneId: string;
  sceneTitle: string;
  containerLabel: string;
  arrayJsonPath: string;
  oldPosition: number;
  newPosition: number;
  sourcePath: string;
  sourceFingerprint: string;
  caretOffset: number;
  newSceneId: string;
  newSceneTitle: string;
  newSourcePath: string;
  structureFingerprint: string;
}

export type ManuscriptSceneSplitPlan =
  | { kind: "unavailable"; reason: string }
  | {
      kind: "ready";
      target: ManuscriptSceneSplitTarget;
      originalStructureText: string;
      updatedStructureText: string;
      updatedStructureFingerprint: string;
      originalSourceText: string;
      leftSourceText: string;
      leftSourceFingerprint: string;
      rightSourceText: string;
      rightSourceFingerprint: string;
    };

interface LocatedScene {
  scene: ReconciledManuscriptScene;
  manuscriptIndex: number;
  manuscriptTitle: string;
  sourceItemIndex: number;
  sourceChildIndex: number | null;
  containerLabel: string;
  arrayJsonPath: string;
}

export function planManuscriptSceneSplit(
  result: ManuscriptProjectLoadResult,
  request: ManuscriptSceneSplitRequest,
): ManuscriptSceneSplitPlan {
  if (result.kind !== "ready") {
    return unavailable("The manuscript structure is not currently valid and verified.");
  }
  const located = locateReadyScene(result, request.sourcePath);
  if (!located) {
    return unavailable("The active file is not the verified source of exactly one manuscript scene.");
  }
  if (
    located.scene.source.kind !== "ready" ||
    located.scene.source.fingerprint !== request.sourceFingerprint ||
    fingerprintContent(request.sourceText) !== request.sourceFingerprint
  ) {
    return unavailable("The active scene text no longer matches the verified source.");
  }
  if (
    !Number.isSafeInteger(request.caretOffset) ||
    request.caretOffset <= 0 ||
    request.caretOffset >= request.sourceText.length
  ) {
    return unavailable("Place the caret inside the scene with prose on both sides.");
  }
  if (splitsSurrogatePair(request.sourceText, request.caretOffset)) {
    return unavailable("The caret cannot divide one Unicode character.");
  }
  const leftSourceText = request.sourceText.slice(0, request.caretOffset);
  const rightSourceText = request.sourceText.slice(request.caretOffset);
  if (!leftSourceText.trim() || !rightSourceText.trim()) {
    return unavailable("The split must leave non-whitespace prose in both scenes.");
  }

  const source = cloneJsonRecord(result.source);
  const rawItems = rawContainerArray(source, located);
  if (!rawItems) return unavailable("The scene's structure array could not be located safely.");
  const sourceIndex = located.sourceChildIndex ?? located.sourceItemIndex;
  const selected = rawItems[sourceIndex];
  if (!isRecord(selected) || selected.kind !== "scene" || selected.id !== located.scene.item.id) {
    return unavailable("The source JSON no longer matches the verified scene location.");
  }
  const newScene: Record<string, unknown> = {
    id: request.newSceneId,
    kind: "scene",
    title: request.newSceneTitle,
    source: { path: request.newSourcePath },
    ...(selected.includeInCompile === false ? { includeInCompile: false } : {}),
  };
  rawItems.splice(sourceIndex + 1, 0, newScene);

  const updatedStructureText = `${JSON.stringify(source, null, 2)}\n`;
  const parsed = parseManuscriptStructure(updatedStructureText);
  if (parsed.kind !== "valid") return unavailable(formatParseFailure(parsed));

  return {
    kind: "ready",
    target: {
      manuscriptTitle: located.manuscriptTitle,
      sceneId: located.scene.item.id,
      sceneTitle: located.scene.item.title,
      containerLabel: located.containerLabel,
      arrayJsonPath: located.arrayJsonPath,
      oldPosition: sourceIndex + 1,
      newPosition: sourceIndex + 2,
      sourcePath: request.sourcePath,
      sourceFingerprint: request.sourceFingerprint,
      caretOffset: request.caretOffset,
      newSceneId: request.newSceneId,
      newSceneTitle: request.newSceneTitle,
      newSourcePath: request.newSourcePath,
      structureFingerprint: result.fingerprint,
    },
    originalStructureText: result.text,
    updatedStructureText,
    updatedStructureFingerprint: fingerprintContent(updatedStructureText),
    originalSourceText: request.sourceText,
    leftSourceText,
    leftSourceFingerprint: fingerprintContent(leftSourceText),
    rightSourceText,
    rightSourceFingerprint: fingerprintContent(rightSourceText),
  };
}

export function suggestSplitScenePath(sourcePath: string, attempt = 2): string {
  const separator = sourcePath.lastIndexOf("/");
  const directory = separator >= 0 ? sourcePath.slice(0, separator + 1) : "";
  const filename = separator >= 0 ? sourcePath.slice(separator + 1) : sourcePath;
  const extensionIndex = filename.lastIndexOf(".");
  const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : ".md";
  return `${directory}${stem}-part-${Math.max(2, Math.trunc(attempt))}${extension}`;
}

function locateReadyScene(
  result: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  sourcePath: string,
): LocatedScene | null {
  let match: LocatedScene | null = null;
  for (let manuscriptIndex = 0; manuscriptIndex < result.reconciled.manuscripts.length; manuscriptIndex += 1) {
    const manuscript = result.reconciled.manuscripts[manuscriptIndex]!;
    for (let itemIndex = 0; itemIndex < manuscript.items.length; itemIndex += 1) {
      const item = manuscript.items[itemIndex]!;
      if (!("children" in item)) {
        if (item.source.kind === "ready" && item.source.resolvedPath === sourcePath) {
          if (match) return null;
          match = {
            scene: item,
            manuscriptIndex,
            manuscriptTitle: manuscript.manuscript.title,
            sourceItemIndex: itemIndex,
            sourceChildIndex: null,
            containerLabel: `manuscript “${manuscript.manuscript.title}” top level`,
            arrayJsonPath: `$.manuscripts[${manuscriptIndex}].items`,
          };
        }
        continue;
      }
      for (let childIndex = 0; childIndex < item.children.length; childIndex += 1) {
        const child = item.children[childIndex]!;
        if (child.source.kind !== "ready" || child.source.resolvedPath !== sourcePath) continue;
        if (match) return null;
        match = {
          scene: child,
          manuscriptIndex,
          manuscriptTitle: manuscript.manuscript.title,
          sourceItemIndex: itemIndex,
          sourceChildIndex: childIndex,
          containerLabel: `chapter “${item.item.title}”`,
          arrayJsonPath: `$.manuscripts[${manuscriptIndex}].items[${itemIndex}].children`,
        };
      }
    }
  }
  return match;
}

function rawContainerArray(source: Record<string, unknown>, located: LocatedScene): unknown[] | null {
  const manuscripts = Array.isArray(source.manuscripts) ? source.manuscripts : null;
  const manuscript = recordAt(manuscripts, located.manuscriptIndex);
  const items = manuscript && Array.isArray(manuscript.items) ? manuscript.items : null;
  if (located.sourceChildIndex === null) return items;
  const chapter = recordAt(items, located.sourceItemIndex);
  return chapter && Array.isArray(chapter.children) ? chapter.children : null;
}

function formatParseFailure(result: Exclude<ReturnType<typeof parseManuscriptStructure>, { kind: "valid" }>): string {
  if (result.kind === "invalid") {
    return result.issues.map(({ path, message }) => `${path}: ${message}`).join(" ");
  }
  if (result.kind === "malformed") return result.message;
  return `Unsupported structure version ${result.version}.`;
}

function splitsSurrogatePair(text: string, offset: number): boolean {
  const previous = text.charCodeAt(offset - 1);
  const next = text.charCodeAt(offset);
  return previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
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

function unavailable(reason: string): ManuscriptSceneSplitPlan {
  return { kind: "unavailable", reason };
}
