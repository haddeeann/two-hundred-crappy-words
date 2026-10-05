import { validateFileName } from "$lib/editor/file-tree";
import { validateProjectId } from "$lib/project/manifest";

export const MAPS_FILE = "200-crappy-words.maps.json";
export const MAPS_FORMAT = "200-crappy-words/maps";
export const MAPS_FORMAT_VERSION = 1 as const;
export const MAX_MAPS_BYTES = 5 * 1024 * 1024;
export const MAX_MAPS = 64;
export const MAX_MAP_ANCHORS = 10_000;
export const MAX_MAP_POLYGON_VERTICES = 256;
export const MAX_MAP_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_MAP_IMAGE_AXIS = 8_192;
export const MAX_MAP_IMAGE_PIXELS = 40_000_000;
export const MAX_MAP_ISSUES = 100;
export const MAX_MAP_TITLE_CODE_POINTS = 120;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;

export type MapMediaType = "image/png" | "image/jpeg" | "image/webp";

export interface MapIssue {
  path: string;
  message: string;
}

export interface MapImage {
  path: string;
  mediaType: MapMediaType;
  sha256: string;
  width: number;
  height: number;
}

export interface MapCanvas {
  width: number;
  height: number;
}

export interface MapPointGeometry {
  kind: "point";
  x: number;
  y: number;
}

export interface MapPolygonGeometry {
  kind: "polygon";
  points: [number, number][];
}

export type MapGeometry = MapPointGeometry | MapPolygonGeometry;

export interface MapAnchor {
  id: string;
  noteId: string;
  geometry: MapGeometry;
}

export interface ProjectMap {
  id: string;
  title: string;
  image: MapImage;
  canvas: MapCanvas;
  anchors: MapAnchor[];
}

export interface MapsProject {
  format: typeof MAPS_FORMAT;
  formatVersion: typeof MAPS_FORMAT_VERSION;
  projectId: string;
  maps: ProjectMap[];
}

export type MapsProjectResult =
  | { kind: "valid"; mapsProject: MapsProject; source: Record<string, unknown> }
  | { kind: "malformed"; message: string }
  | { kind: "invalid"; issues: MapIssue[] }
  | { kind: "unsupported-version"; version: number };

interface ParseContext {
  issues: IssueCollector;
  mapIds: Map<string, string>;
  anchorIds: Map<string, string>;
  anchorCount: number;
  anchorLimitReported: boolean;
}

class IssueCollector {
  readonly #issues: MapIssue[] = [];
  #omitted = false;

  add(path: string, message: string): void {
    if (this.#issues.length < MAX_MAP_ISSUES) this.#issues.push({ path, message });
    else this.#omitted = true;
  }

  get hasIssues(): boolean {
    return this.#issues.length > 0 || this.#omitted;
  }

  result(): MapIssue[] {
    if (!this.#omitted) return [...this.#issues];
    return [
      ...this.#issues,
      {
        path: "$",
        message: `Additional issues were omitted after the first ${MAX_MAP_ISSUES}.`,
      },
    ];
  }
}

export function parseMapsProject(text: string): MapsProjectResult {
  if (new TextEncoder().encode(text).byteLength > MAX_MAPS_BYTES) {
    return {
      kind: "invalid",
      issues: [{ path: "$", message: `The maps file must not exceed ${MAX_MAPS_BYTES} bytes.` }],
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    return {
      kind: "malformed",
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
  if (!isRecord(value)) {
    return {
      kind: "invalid",
      issues: [{ path: "$", message: "The maps file must be a JSON object." }],
    };
  }

  if (!Number.isSafeInteger(value.formatVersion) || (value.formatVersion as number) < 1) {
    return {
      kind: "invalid",
      issues: [{ path: "$.formatVersion", message: "formatVersion must be a positive integer." }],
    };
  }
  const formatVersion = value.formatVersion as number;
  if (formatVersion > MAPS_FORMAT_VERSION) {
    return { kind: "unsupported-version", version: formatVersion };
  }
  if (formatVersion !== MAPS_FORMAT_VERSION) {
    return {
      kind: "invalid",
      issues: [{ path: "$.formatVersion", message: `formatVersion ${formatVersion} is not supported.` }],
    };
  }

  const issues = new IssueCollector();
  const context: ParseContext = {
    issues,
    mapIds: new Map(),
    anchorIds: new Map(),
    anchorCount: 0,
    anchorLimitReported: false,
  };
  if (value.format !== MAPS_FORMAT) {
    issues.add("$.format", `format must be ${JSON.stringify(MAPS_FORMAT)}.`);
  }
  const projectId = parseUuid(value.projectId, "$.projectId", "projectId", context);
  const maps = parseMaps(value.maps, context);

  if (issues.hasIssues) return { kind: "invalid", issues: issues.result() };
  return {
    kind: "valid",
    mapsProject: {
      format: MAPS_FORMAT,
      formatVersion: MAPS_FORMAT_VERSION,
      projectId: projectId!,
      maps,
    },
    source: structuredClone(value),
  };
}

function parseMaps(value: unknown, context: ParseContext): ProjectMap[] {
  if (!Array.isArray(value)) {
    context.issues.add("$.maps", "maps must be an array.");
    return [];
  }
  if (value.length > MAX_MAPS) {
    context.issues.add("$.maps", `maps must contain at most ${MAX_MAPS} entries.`);
  }
  const maps: ProjectMap[] = [];
  for (let index = 0; index < Math.min(value.length, MAX_MAPS); index += 1) {
    const parsed = parseMap(value[index], `$.maps[${index}]`, context);
    if (parsed) maps.push(parsed);
  }
  return maps;
}

function parseMap(value: unknown, path: string, context: ParseContext): ProjectMap | null {
  if (!isRecord(value)) {
    context.issues.add(path, "A map must be a JSON object.");
    return null;
  }
  const id = parseUuid(value.id, `${path}.id`, "map id", context);
  if (id) registerUnique(id, path, context.mapIds, `${path}.id`, "map id", context);
  const title = parseText(value.title, `${path}.title`, context);
  const image = parseImage(value.image, `${path}.image`, context);
  const canvas = parseDimensions(value.canvas, `${path}.canvas`, "canvas", context);
  const anchors = parseAnchors(value.anchors, `${path}.anchors`, canvas, context);
  return id && title && image && canvas ? { id, title, image, canvas, anchors } : null;
}

function parseImage(value: unknown, path: string, context: ParseContext): MapImage | null {
  if (!isRecord(value)) {
    context.issues.add(path, "image must be a JSON object.");
    return null;
  }
  const relativePath = parseImagePath(value.path, `${path}.path`, context);
  const mediaType = parseMediaType(value.mediaType, `${path}.mediaType`, context);
  const sha256 = typeof value.sha256 === "string" && SHA_256_PATTERN.test(value.sha256)
    ? value.sha256
    : null;
  if (!sha256) {
    context.issues.add(`${path}.sha256`, "sha256 must be 64 lowercase hexadecimal characters.");
  }
  const dimensions = parseDimensions(value, path, "image", context);
  return relativePath && mediaType && sha256 && dimensions
    ? { path: relativePath, mediaType, sha256, ...dimensions }
    : null;
}

function parseDimensions(
  value: unknown,
  path: string,
  label: "image" | "canvas",
  context: ParseContext,
): MapCanvas | null {
  if (!isRecord(value)) {
    context.issues.add(path, `${label} must be a JSON object.`);
    return null;
  }
  const width = parseBoundedInteger(value.width, `${path}.width`, context);
  const height = parseBoundedInteger(value.height, `${path}.height`, context);
  if (width !== null && height !== null && width * height > MAX_MAP_IMAGE_PIXELS) {
    context.issues.add(path, `${label} must contain at most ${MAX_MAP_IMAGE_PIXELS} pixels.`);
  }
  return width !== null && height !== null && width * height <= MAX_MAP_IMAGE_PIXELS
    ? { width, height }
    : null;
}

function parseAnchors(
  value: unknown,
  path: string,
  canvas: MapCanvas | null,
  context: ParseContext,
): MapAnchor[] {
  if (!Array.isArray(value)) {
    context.issues.add(path, "anchors must be an array.");
    return [];
  }
  const remaining = Math.max(0, MAX_MAP_ANCHORS - context.anchorCount);
  if (value.length > remaining && !context.anchorLimitReported) {
    context.issues.add("$.maps", `maps must contain at most ${MAX_MAP_ANCHORS} anchors in total.`);
    context.anchorLimitReported = true;
  }
  const anchors: MapAnchor[] = [];
  const inspected = Math.min(value.length, remaining);
  context.anchorCount += inspected;
  for (let index = 0; index < inspected; index += 1) {
    const parsed = parseAnchor(value[index], `${path}[${index}]`, canvas, context);
    if (parsed) anchors.push(parsed);
  }
  return anchors;
}

function parseAnchor(
  value: unknown,
  path: string,
  canvas: MapCanvas | null,
  context: ParseContext,
): MapAnchor | null {
  if (!isRecord(value)) {
    context.issues.add(path, "An anchor must be a JSON object.");
    return null;
  }
  const id = parseUuid(value.id, `${path}.id`, "anchor id", context);
  if (id) registerUnique(id, path, context.anchorIds, `${path}.id`, "anchor id", context);
  const noteId = parseUuid(value.noteId, `${path}.noteId`, "noteId", context);
  const geometry = parseGeometry(value.geometry, `${path}.geometry`, canvas, context);
  return id && noteId && geometry ? { id, noteId, geometry } : null;
}

function parseGeometry(
  value: unknown,
  path: string,
  canvas: MapCanvas | null,
  context: ParseContext,
): MapGeometry | null {
  if (!isRecord(value)) {
    context.issues.add(path, "geometry must be a JSON object.");
    return null;
  }
  if (value.kind === "point") {
    const point = parsePoint(value.x, value.y, path, canvas, context);
    return point ? { kind: "point", x: point[0], y: point[1] } : null;
  }
  if (value.kind !== "polygon") {
    context.issues.add(`${path}.kind`, 'kind must be "point" or "polygon".');
    return null;
  }
  if (!Array.isArray(value.points)) {
    context.issues.add(`${path}.points`, "points must be an array.");
    return null;
  }
  if (value.points.length < 3 || value.points.length > MAX_MAP_POLYGON_VERTICES) {
    context.issues.add(
      `${path}.points`,
      `points must contain from 3 through ${MAX_MAP_POLYGON_VERTICES} vertices.`,
    );
  }
  const points: [number, number][] = [];
  for (let index = 0; index < Math.min(value.points.length, MAX_MAP_POLYGON_VERTICES); index += 1) {
    const candidate = value.points[index];
    const itemPath = `${path}.points[${index}]`;
    if (!Array.isArray(candidate) || candidate.length !== 2) {
      context.issues.add(itemPath, "A polygon vertex must be an [x, y] pair.");
      continue;
    }
    const point = parsePoint(candidate[0], candidate[1], itemPath, canvas, context);
    if (point) points.push(point);
  }
  if (points.length >= 2 && samePoint(points[0]!, points[points.length - 1]!)) {
    context.issues.add(`${path}.points`, "The closing vertex is implicit and must not repeat the first vertex.");
  }
  const distinct = new Map(points.map((point) => [`${point[0]},${point[1]}`, point]));
  if (distinct.size < 3) {
    context.issues.add(`${path}.points`, "A polygon needs at least three distinct vertices.");
  } else if (!hasNonCollinearVertices([...distinct.values()])) {
    context.issues.add(`${path}.points`, "A polygon needs at least three non-collinear vertices.");
  }
  return value.points.length >= 3 && value.points.length <= MAX_MAP_POLYGON_VERTICES &&
    points.length === value.points.length && distinct.size >= 3 &&
    !samePoint(points[0]!, points[points.length - 1]!) && hasNonCollinearVertices([...distinct.values()])
    ? { kind: "polygon", points }
    : null;
}

function parsePoint(
  xValue: unknown,
  yValue: unknown,
  path: string,
  canvas: MapCanvas | null,
  context: ParseContext,
): [number, number] | null {
  const x = parseCoordinate(xValue, `${path}.x`, "x", context);
  const y = parseCoordinate(yValue, `${path}.y`, "y", context);
  if (canvas && x !== null && x >= canvas.width) {
    context.issues.add(`${path}.x`, `x must be less than the canvas width ${canvas.width}.`);
  }
  if (canvas && y !== null && y >= canvas.height) {
    context.issues.add(`${path}.y`, `y must be less than the canvas height ${canvas.height}.`);
  }
  return x !== null && y !== null && (!canvas || (x < canvas.width && y < canvas.height))
    ? [x, y]
    : null;
}

function parseCoordinate(
  value: unknown,
  path: string,
  label: string,
  context: ParseContext,
): number | null {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    context.issues.add(path, `${label} must be a non-negative integer.`);
    return null;
  }
  return value as number;
}

function parseBoundedInteger(value: unknown, path: string, context: ParseContext): number | null {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_MAP_IMAGE_AXIS) {
    context.issues.add(path, `must be an integer from 1 through ${MAX_MAP_IMAGE_AXIS}.`);
    return null;
  }
  return value as number;
}

function parseImagePath(value: unknown, path: string, context: ParseContext): string | null {
  if (typeof value !== "string" || !value) {
    context.issues.add(path, "path must be a non-empty project-relative file path.");
    return null;
  }
  if (value.includes("\\")) {
    context.issues.add(path, "path must use forward slashes as separators.");
    return null;
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    context.issues.add(path, "path must stay within the project and contain no empty, . or .. segment.");
    return null;
  }
  for (const segment of segments) {
    const issue = validateFileName(segment);
    if (issue) {
      context.issues.add(path, `path contains an invalid segment: ${issue}`);
      return null;
    }
  }
  return value;
}

function parseMediaType(value: unknown, path: string, context: ParseContext): MapMediaType | null {
  if (value === "image/png" || value === "image/jpeg" || value === "image/webp") return value;
  context.issues.add(path, 'mediaType must be "image/png", "image/jpeg", or "image/webp".');
  return null;
}

function parseText(value: unknown, path: string, context: ParseContext): string | null {
  if (typeof value !== "string") {
    context.issues.add(path, "title must be text.");
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    context.issues.add(path, "title must not be empty.");
    return null;
  }
  if (CONTROL_CHARACTER_PATTERN.test(trimmed)) {
    context.issues.add(path, "title must not contain control characters.");
    return null;
  }
  if ([...trimmed].length > MAX_MAP_TITLE_CODE_POINTS) {
    context.issues.add(path, `title must contain at most ${MAX_MAP_TITLE_CODE_POINTS} Unicode characters.`);
    return null;
  }
  return trimmed;
}

function parseUuid(
  value: unknown,
  path: string,
  label: string,
  context: ParseContext,
): string | null {
  const issue = validateProjectId(value);
  if (issue) {
    context.issues.add(path, issue.replace("projectId", label));
    return null;
  }
  return value as string;
}

function registerUnique(
  id: string,
  ownerPath: string,
  seen: Map<string, string>,
  path: string,
  label: string,
  context: ParseContext,
): void {
  const previous = seen.get(id);
  if (previous) context.issues.add(path, `Duplicate ${label}; it is already used at ${previous}.`);
  else seen.set(id, ownerPath);
}

function hasNonCollinearVertices(points: readonly [number, number][]): boolean {
  const first = points[0]!;
  const second = points[1]!;
  return points.slice(2).some(
    (point) =>
      (second[0] - first[0]) * (point[1] - first[1]) !==
      (second[1] - first[1]) * (point[0] - first[0]),
  );
}

function samePoint(first: [number, number], second: [number, number]): boolean {
  return first[0] === second[0] && first[1] === second[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
