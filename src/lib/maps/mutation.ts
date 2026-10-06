import { fingerprintContent } from "$lib/editor/recovery";
import {
  MAPS_FORMAT,
  MAPS_FORMAT_VERSION,
  parseMapsProject,
  type MapImage,
  type MapIssue,
} from "./format";

export type MapsMutationRequest =
  | { kind: "add-map"; mapId: string; title: string; image: MapImage }
  | { kind: "remove-map"; mapId: string }
  | {
      kind: "add-point";
      mapId: string;
      anchorId: string;
      noteId: string;
      x: number;
      y: number;
    }
  | {
      kind: "update-point";
      mapId: string;
      anchorId: string;
      noteId: string;
      x: number;
      y: number;
    }
  | { kind: "remove-anchor"; mapId: string; anchorId: string };

export type MapsMutationPlan =
  | { kind: "unavailable"; reason: string }
  | { kind: "blocked"; issues: MapIssue[] }
  | { kind: "unchanged"; summary: string }
  | {
      kind: "ready";
      operation: MapsMutationRequest["kind"];
      request: MapsMutationRequest;
      projectId: string;
      summary: string;
      originalText: string | null;
      originalFingerprint: string | null;
      updatedText: string;
      updatedFingerprint: string;
    };

export function planMapsMutation(
  originalText: string | null,
  expectedProjectId: string,
  request: MapsMutationRequest,
): MapsMutationPlan {
  let source: Record<string, unknown>;
  if (originalText === null) {
    if (request.kind !== "add-map") {
      return unavailable("Create the first map before editing anchors or removing map metadata.");
    }
    source = {
      format: MAPS_FORMAT,
      formatVersion: MAPS_FORMAT_VERSION,
      projectId: expectedProjectId,
      maps: [],
    };
  } else {
    const parsed = parseMapsProject(originalText);
    if (parsed.kind === "malformed") return unavailable(`The maps file is not valid JSON: ${parsed.message}`);
    if (parsed.kind === "unsupported-version") return unavailable(`The maps file uses unsupported version ${parsed.version}.`);
    if (parsed.kind === "invalid") return { kind: "blocked", issues: parsed.issues };
    if (parsed.mapsProject.projectId !== expectedProjectId) {
      return unavailable("The maps file belongs to a different world project.");
    }
    source = cloneRecord(parsed.source);
  }

  const maps = source.maps;
  if (!Array.isArray(maps)) return unavailable("The source maps array is unavailable.");
  const summary = applyMutation(maps, request);
  if (summary.kind !== "applied") return summary;

  const updatedText = `${JSON.stringify(source, null, 2)}\n`;
  if (updatedText === originalText) return { kind: "unchanged", summary: summary.summary };
  const verified = parseMapsProject(updatedText);
  if (verified.kind !== "valid") {
    if (verified.kind === "invalid") return { kind: "blocked", issues: verified.issues };
    return unavailable(
      verified.kind === "malformed"
        ? `The proposed maps JSON is malformed: ${verified.message}`
        : `The proposed maps JSON uses unsupported version ${verified.version}.`,
    );
  }
  if (verified.mapsProject.projectId !== expectedProjectId) {
    return unavailable("The proposed maps file no longer matches this world project.");
  }

  return {
    kind: "ready",
    operation: request.kind,
    request: cloneJson(request),
    projectId: expectedProjectId,
    summary: summary.summary,
    originalText,
    originalFingerprint: originalText === null ? null : fingerprintContent(originalText),
    updatedText,
    updatedFingerprint: fingerprintContent(updatedText),
  };
}

function applyMutation(
  maps: unknown[],
  request: MapsMutationRequest,
): { kind: "applied"; summary: string } | Exclude<MapsMutationPlan, { kind: "ready" }> {
  if (request.kind === "add-map") {
    if (maps.some((value) => isRecord(value) && value.id === request.mapId)) {
      return unavailable("A map already uses that stable ID.");
    }
    maps.push({
      id: request.mapId,
      title: request.title.trim(),
      image: cloneJson(request.image),
      canvas: { width: request.image.width, height: request.image.height },
      anchors: [],
    });
    return { kind: "applied", summary: `Add map ${request.title.trim() || request.mapId}.` };
  }

  const mapIndex = maps.findIndex((value) => isRecord(value) && value.id === request.mapId);
  if (mapIndex < 0) return unavailable("That map is no longer present in the verified maps file.");
  const map = maps[mapIndex];
  if (!isRecord(map)) return unavailable("That map source is unavailable.");

  if (request.kind === "remove-map") {
    const title = typeof map.title === "string" ? map.title : request.mapId;
    maps.splice(mapIndex, 1);
    return { kind: "applied", summary: `Remove map metadata for ${title}; keep its image and notes.` };
  }

  if (!Array.isArray(map.anchors)) return unavailable("That map's source anchors are unavailable.");
  if (request.kind === "add-point") {
    if (map.anchors.some((value) => isRecord(value) && value.id === request.anchorId)) {
      return unavailable("An anchor already uses that stable ID.");
    }
    map.anchors.push({
      id: request.anchorId,
      noteId: request.noteId,
      geometry: { kind: "point", x: request.x, y: request.y },
    });
    return { kind: "applied", summary: "Add one note-linked point anchor." };
  }

  const anchorIndex = map.anchors.findIndex(
    (value) => isRecord(value) && value.id === request.anchorId,
  );
  if (anchorIndex < 0) return unavailable("That anchor is no longer present on the selected map.");
  const anchor = map.anchors[anchorIndex];
  if (!isRecord(anchor)) return unavailable("That anchor source is unavailable.");

  if (request.kind === "remove-anchor") {
    map.anchors.splice(anchorIndex, 1);
    return { kind: "applied", summary: "Remove one anchor; keep its linked note and map image." };
  }

  if (!isRecord(anchor.geometry) || anchor.geometry.kind !== "point") {
    return unavailable("Only point anchors can be changed in this authoring slice.");
  }
  const unchanged = anchor.noteId === request.noteId &&
    anchor.geometry.x === request.x && anchor.geometry.y === request.y;
  if (unchanged) return { kind: "unchanged", summary: "The point anchor is already unchanged." };
  anchor.noteId = request.noteId;
  anchor.geometry.x = request.x;
  anchor.geometry.y = request.y;
  return { kind: "applied", summary: "Update one note-linked point anchor." };
}

function unavailable(reason: string): Extract<MapsMutationPlan, { kind: "unavailable" }> {
  return { kind: "unavailable", reason };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return cloneJson(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
