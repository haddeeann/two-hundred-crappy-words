import type { LoreProjectIndex } from "$lib/lore/types";
import type { MapAnchor, MapsProject, ProjectMap } from "./format";

export type MapAnchorTarget =
  | { kind: "resolved"; path: string; title: string; noteType: string }
  | { kind: "missing"; message: string }
  | { kind: "ambiguous"; paths: string[]; message: string }
  | { kind: "unstructured"; path: string; title: string; message: string };

export interface MapAnchorModel {
  anchor: MapAnchor;
  target: MapAnchorTarget;
}

export interface ProjectMapModel {
  map: ProjectMap;
  anchors: MapAnchorModel[];
}

export interface MapsWorkspaceModel {
  maps: ProjectMapModel[];
  problemAnchorCount: number;
}

export function deriveMapsWorkspaceModel(
  project: MapsProject,
  loreIndex: LoreProjectIndex | null,
): MapsWorkspaceModel {
  const documentsById = new Map<string, Array<{ path: string; title: string; type: string | null }>>();
  for (const document of loreIndex?.documents.values() ?? []) {
    if (!document.id) continue;
    const values = documentsById.get(document.id) ?? [];
    values.push({ path: document.path, title: document.title, type: document.type });
    documentsById.set(document.id, values);
  }

  let problemAnchorCount = 0;
  const maps = project.maps.map((map) => ({
    map,
    anchors: map.anchors.map((anchor) => {
      const target = resolveAnchorTarget(anchor.noteId, documentsById);
      if (target.kind !== "resolved") problemAnchorCount += 1;
      return { anchor, target };
    }),
  }));
  return { maps, problemAnchorCount };
}

function resolveAnchorTarget(
  noteId: string,
  documentsById: ReadonlyMap<string, Array<{ path: string; title: string; type: string | null }>>,
): MapAnchorTarget {
  const matches = documentsById.get(noteId) ?? [];
  if (matches.length === 0) {
    return {
      kind: "missing",
      message: `No indexed note has stable ID ${noteId}. The anchor was not retargeted.`,
    };
  }
  if (matches.length > 1) {
    const paths = matches.map(({ path }) => path).sort((a, b) => a.localeCompare(b));
    return {
      kind: "ambiguous",
      paths,
      message: `Stable ID ${noteId} appears in more than one note. Choose no target until the duplicate is resolved.`,
    };
  }
  const [match] = matches;
  if (!match!.type) {
    return {
      kind: "unstructured",
      path: match!.path,
      title: match!.title,
      message: `${match!.path} has the recorded stable ID but no structured note type.`,
    };
  }
  return { kind: "resolved", path: match!.path, title: match!.title, noteType: match!.type };
}
