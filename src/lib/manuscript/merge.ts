import { fingerprintContent } from "$lib/editor/recovery";
import type {
  ManuscriptProjectLoadResult,
  ReconciledManuscriptScene,
} from "./source-reconciliation";
import { parseManuscriptStructure } from "./structure";

const MAX_MANUSCRIPT_SOURCE_BYTES = 10 * 1024 * 1024;

export type ManuscriptSceneMergeJoin = "preserve" | "blank-line";

export interface ManuscriptSceneMergeRequest {
  leftSceneId: string;
  leftSourceText: string;
  leftSourceFingerprint: string;
  rightSourceText: string;
  rightSourceFingerprint: string;
  join: ManuscriptSceneMergeJoin;
  retiredSourcePath: string;
}

export interface ManuscriptSceneMergeTarget {
  manuscriptTitle: string;
  containerLabel: string;
  arrayJsonPath: string;
  leftPosition: number;
  rightPosition: number;
  leftSceneId: string;
  leftSceneTitle: string;
  leftSourcePath: string;
  leftSourceFingerprint: string;
  rightSceneId: string;
  rightSceneTitle: string;
  rightSourcePath: string;
  rightSourceFingerprint: string;
  retiredSourcePath: string;
  join: ManuscriptSceneMergeJoin;
  insertedBoundary: string;
  structureFingerprint: string;
}

export type ManuscriptSceneMergeAvailability =
  | {
      kind: "available";
      leftSceneId: string;
      leftTitle: string;
      leftSourcePath: string;
      leftSourceFingerprint: string;
      rightSceneId: string;
      rightTitle: string;
      rightSourcePath: string;
      rightSourceFingerprint: string;
    }
  | { kind: "unavailable"; reason: string };

export type ManuscriptSceneMergePlan =
  | { kind: "unavailable"; reason: string }
  | {
      kind: "ready";
      target: ManuscriptSceneMergeTarget;
      originalStructureText: string;
      updatedStructureText: string;
      updatedStructureFingerprint: string;
      originalLeftSourceText: string;
      originalRightSourceText: string;
      mergedSourceText: string;
      mergedSourceFingerprint: string;
    };

interface LocatedPair {
  left: ReconciledManuscriptScene;
  right: ReconciledManuscriptScene;
  manuscriptIndex: number;
  manuscriptTitle: string;
  chapterItemIndex: number | null;
  leftIndex: number;
  containerLabel: string;
  arrayJsonPath: string;
}

export function manuscriptSceneMergeAvailability(
  result: ManuscriptProjectLoadResult,
  leftSceneId: string,
): ManuscriptSceneMergeAvailability {
  const assessed = assessPair(result, leftSceneId);
  if (assessed.kind === "unavailable") return assessed;
  const leftSource = assessed.pair.left.source;
  const rightSource = assessed.pair.right.source;
  if (leftSource.kind !== "ready" || rightSource.kind !== "ready") {
    return unavailable("Both adjacent scene sources must be fingerprint-verified before merging.");
  }
  return {
    kind: "available",
    leftSceneId: assessed.pair.left.item.id,
    leftTitle: assessed.pair.left.item.title,
    leftSourcePath: leftSource.resolvedPath,
    leftSourceFingerprint: leftSource.fingerprint,
    rightSceneId: assessed.pair.right.item.id,
    rightTitle: assessed.pair.right.item.title,
    rightSourcePath: rightSource.resolvedPath,
    rightSourceFingerprint: rightSource.fingerprint,
  };
}

export function planManuscriptSceneMerge(
  result: ManuscriptProjectLoadResult,
  request: ManuscriptSceneMergeRequest,
): ManuscriptSceneMergePlan {
  const assessed = assessPair(result, request.leftSceneId);
  if (assessed.kind === "unavailable") return assessed;
  const { pair, project } = assessed;
  if (
    pair.left.source.kind !== "ready" ||
    pair.right.source.kind !== "ready" ||
    pair.left.source.fingerprint !== request.leftSourceFingerprint ||
    pair.right.source.fingerprint !== request.rightSourceFingerprint ||
    fingerprintContent(request.leftSourceText) !== request.leftSourceFingerprint ||
    fingerprintContent(request.rightSourceText) !== request.rightSourceFingerprint
  ) {
    return unavailable("One of the adjacent scene sources changed after it was verified.");
  }
  if (!request.leftSourceText.trim() || !request.rightSourceText.trim()) {
    return unavailable("Both adjacent scenes must contain non-whitespace prose.");
  }
  if (!isSafeRetiredPath(request.retiredSourcePath)) {
    return unavailable("The retired source must be a portable project-relative .retired path.");
  }
  if (
    request.retiredSourcePath === pair.left.source.resolvedPath ||
    request.retiredSourcePath === pair.right.source.resolvedPath
  ) {
    return unavailable("The retired source path must differ from both active scene paths.");
  }
  const insertedBoundary = request.join === "preserve"
    ? ""
    : missingBlankLineBoundary(request.leftSourceText, request.rightSourceText);
  const mergedSourceText = `${request.leftSourceText}${insertedBoundary}${request.rightSourceText}`;
  if (new TextEncoder().encode(mergedSourceText).byteLength > MAX_MANUSCRIPT_SOURCE_BYTES) {
    return unavailable("The merged scene would exceed the 10 MiB source limit.");
  }

  const source = cloneJsonRecord(project.source);
  const rawItems = rawContainerArray(source, pair);
  const rawLeft = rawItems?.[pair.leftIndex];
  const rawRight = rawItems?.[pair.leftIndex + 1];
  if (
    !rawItems ||
    !isRecord(rawLeft) ||
    !isRecord(rawRight) ||
    rawLeft.id !== pair.left.item.id ||
    rawRight.id !== pair.right.item.id
  ) {
    return unavailable("The adjacent scene JSON no longer matches the verified pair.");
  }
  rawItems.splice(pair.leftIndex + 1, 1);
  const updatedStructureText = `${JSON.stringify(source, null, 2)}\n`;
  const parsed = parseManuscriptStructure(updatedStructureText);
  if (parsed.kind !== "valid") return unavailable(formatParseFailure(parsed));

  return {
    kind: "ready",
    target: {
      manuscriptTitle: pair.manuscriptTitle,
      containerLabel: pair.containerLabel,
      arrayJsonPath: pair.arrayJsonPath,
      leftPosition: pair.leftIndex + 1,
      rightPosition: pair.leftIndex + 2,
      leftSceneId: pair.left.item.id,
      leftSceneTitle: pair.left.item.title,
      leftSourcePath: pair.left.source.resolvedPath,
      leftSourceFingerprint: request.leftSourceFingerprint,
      rightSceneId: pair.right.item.id,
      rightSceneTitle: pair.right.item.title,
      rightSourcePath: pair.right.source.resolvedPath,
      rightSourceFingerprint: request.rightSourceFingerprint,
      retiredSourcePath: request.retiredSourcePath,
      join: request.join,
      insertedBoundary,
      structureFingerprint: project.fingerprint,
    },
    originalStructureText: project.text,
    updatedStructureText,
    updatedStructureFingerprint: fingerprintContent(updatedStructureText),
    originalLeftSourceText: request.leftSourceText,
    originalRightSourceText: request.rightSourceText,
    mergedSourceText,
    mergedSourceFingerprint: fingerprintContent(mergedSourceText),
  };
}

export function suggestRetiredScenePath(sourcePath: string, attempt = 1): string {
  return attempt <= 1
    ? `${sourcePath}.retired`
    : `${sourcePath}.retired-${Math.max(2, Math.trunc(attempt))}`;
}

function assessPair(
  result: ManuscriptProjectLoadResult,
  leftSceneId: string,
):
  | {
      kind: "ready";
      pair: LocatedPair;
      project: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>;
    }
  | { kind: "unavailable"; reason: string } {
  if (result.kind !== "ready") {
    return unavailable("The manuscript structure is not currently valid and verified.");
  }
  const pair = locateAdjacentPair(result, leftSceneId);
  if (!pair) {
    return unavailable("This scene is not immediately followed by another scene in the same container.");
  }
  if (pair.left.source.kind !== "ready" || pair.right.source.kind !== "ready") {
    return unavailable("Both adjacent scene sources must be fingerprint-verified before merging.");
  }
  if (pair.left.item.includeInCompile !== pair.right.item.includeInCompile) {
    return unavailable("The adjacent scenes have different compile inclusion and cannot merge safely.");
  }
  const rawItems = rawContainerArray(result.source, pair);
  const rawRight = rawItems?.[pair.leftIndex + 1];
  if (!isMinimalRetirableScene(rawRight)) {
    return unavailable("The next scene has planning or unknown metadata that must be preserved separately before merging.");
  }
  return { kind: "ready", pair, project: result };
}

function locateAdjacentPair(
  result: Extract<ManuscriptProjectLoadResult, { kind: "ready" }>,
  leftSceneId: string,
): LocatedPair | null {
  for (let manuscriptIndex = 0; manuscriptIndex < result.reconciled.manuscripts.length; manuscriptIndex += 1) {
    const manuscript = result.reconciled.manuscripts[manuscriptIndex]!;
    for (let itemIndex = 0; itemIndex < manuscript.items.length; itemIndex += 1) {
      const item = manuscript.items[itemIndex]!;
      if (!("children" in item)) {
        if (item.item.id !== leftSceneId) continue;
        const right = manuscript.items[itemIndex + 1];
        if (!right || "children" in right) return null;
        return {
          left: item,
          right,
          manuscriptIndex,
          manuscriptTitle: manuscript.manuscript.title,
          chapterItemIndex: null,
          leftIndex: itemIndex,
          containerLabel: `manuscript “${manuscript.manuscript.title}” top level`,
          arrayJsonPath: `$.manuscripts[${manuscriptIndex}].items`,
        };
      }
      const childIndex = item.children.findIndex(({ item: child }) => child.id === leftSceneId);
      if (childIndex < 0) continue;
      const right = item.children[childIndex + 1];
      if (!right) return null;
      return {
        left: item.children[childIndex]!,
        right,
        manuscriptIndex,
        manuscriptTitle: manuscript.manuscript.title,
        chapterItemIndex: itemIndex,
        leftIndex: childIndex,
        containerLabel: `chapter “${item.item.title}”`,
        arrayJsonPath: `$.manuscripts[${manuscriptIndex}].items[${itemIndex}].children`,
      };
    }
  }
  return null;
}

function rawContainerArray(source: Record<string, unknown>, pair: LocatedPair): unknown[] | null {
  const manuscripts = Array.isArray(source.manuscripts) ? source.manuscripts : null;
  const manuscript = recordAt(manuscripts, pair.manuscriptIndex);
  const items = manuscript && Array.isArray(manuscript.items) ? manuscript.items : null;
  if (pair.chapterItemIndex === null) return items;
  const chapter = recordAt(items, pair.chapterItemIndex);
  return chapter && Array.isArray(chapter.children) ? chapter.children : null;
}

function isMinimalRetirableScene(value: unknown): boolean {
  if (!isRecord(value) || value.kind !== "scene") return false;
  const keys = Object.keys(value);
  if (keys.some((key) => !["id", "kind", "title", "source", "includeInCompile"].includes(key))) {
    return false;
  }
  if (!isRecord(value.source) || Object.keys(value.source).some((key) => key !== "path")) {
    return false;
  }
  return true;
}

function isSafeRetiredPath(path: string): boolean {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    (!path.endsWith(".retired") && !/\.retired-[2-9]\d*$/u.test(path))
  ) {
    return false;
  }
  return path.split("/").every((segment) =>
    Boolean(segment) && segment !== "." && segment !== ".." && !segment.startsWith("."),
  );
}

function missingBlankLineBoundary(left: string, right: string): string {
  const missing = Math.max(0, 2 - trailingNewlines(left) - leadingNewlines(right));
  return preferredNewline(left, right).repeat(missing);
}

function trailingNewlines(text: string): number {
  let count = 0;
  let index = text.length;
  while (index > 0) {
    if (text[index - 1] === "\n") {
      index -= text[index - 2] === "\r" ? 2 : 1;
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

function leadingNewlines(text: string): number {
  let count = 0;
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("\r\n", index)) {
      index += 2;
      count += 1;
      continue;
    }
    if (text[index] === "\n") {
      index += 1;
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

function preferredNewline(left: string, right: string): "\n" | "\r\n" {
  return /\r\n/u.test(left) || /^\r\n/u.test(right) ? "\r\n" : "\n";
}

function formatParseFailure(result: Exclude<ReturnType<typeof parseManuscriptStructure>, { kind: "valid" }>): string {
  if (result.kind === "invalid") return result.issues.map(({ path, message }) => `${path}: ${message}`).join(" ");
  if (result.kind === "malformed") return result.message;
  return `Unsupported structure version ${result.version}.`;
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

function unavailable(reason: string): { kind: "unavailable"; reason: string } {
  return { kind: "unavailable", reason };
}
