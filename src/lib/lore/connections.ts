import type {
  IndexedWikiLink,
  LoreBacklink,
  LoreDocumentRecord,
  LoreProjectIndex,
  SourceRange,
} from "./types";

export interface LoreConnectionItem {
  key: string;
  direction: "outgoing" | "backlink";
  status: "resolved" | "broken" | "ambiguous" | "invalid";
  label: string;
  detail: string;
  context: string;
  sourceLocation: string;
  targetPath: string | null;
  targetRange: SourceRange | null;
}

export interface ActiveLoreConnections {
  title: string;
  outgoing: LoreConnectionItem[];
  backlinks: LoreConnectionItem[];
}

export function activeLoreConnections(
  index: LoreProjectIndex | null,
  activePath: string | null,
): ActiveLoreConnections | null {
  if (!index || !activePath) return null;
  const document = index.documents.get(activePath);
  if (!document) return null;
  return {
    title: document.title,
    outgoing: document.outgoing.map((outgoing, ordinal) =>
      outgoingConnection(index, document, outgoing, ordinal),
    ),
    backlinks: (index.backlinks.get(activePath) ?? []).map((backlink, ordinal) =>
      backlinkConnection(index, backlink, ordinal),
    ),
  };
}

function outgoingConnection(
  index: LoreProjectIndex,
  source: LoreDocumentRecord,
  outgoing: IndexedWikiLink,
  ordinal: number,
): LoreConnectionItem {
  const { link, resolution } = outgoing;
  const sourceLocation = `${source.path}:${link.range.line}:${link.range.column}`;
  if (resolution.kind === "resolved") {
    const target = index.documents.get(resolution.targetPath);
    const heading = resolution.heading;
    return {
      key: `out:${source.path}:${link.range.start}:${ordinal}`,
      direction: "outgoing",
      status: "resolved",
      label: `${target?.title ?? resolution.targetPath}${heading ? ` · ${heading.text}` : ""}`,
      detail: resolution.targetPath,
      context: outgoing.context,
      sourceLocation,
      targetPath: resolution.targetPath,
      targetRange: heading?.textRange ?? null,
    };
  }
  const status = resolution.kind.includes("ambiguous")
    ? "ambiguous"
    : resolution.kind === "invalid-target"
      ? "invalid"
      : "broken";
  const candidates = "candidatePaths" in resolution && resolution.candidatePaths.length > 0
    ? ` Candidates: ${resolution.candidatePaths.join(", ")}.`
    : "";
  return {
    key: `out:${source.path}:${link.range.start}:${ordinal}`,
    direction: "outgoing",
    status,
    label: link.headingTarget === null
      ? (link.noteTarget || "Empty target")
      : `${link.noteTarget || "This note"} · ${link.headingTarget}`,
    detail: `${resolution.message}${candidates}`,
    context: outgoing.context,
    sourceLocation,
    targetPath: null,
    targetRange: null,
  };
}

function backlinkConnection(
  index: LoreProjectIndex,
  backlink: LoreBacklink,
  ordinal: number,
): LoreConnectionItem {
  const source = index.documents.get(backlink.sourcePath);
  return {
    key: `back:${backlink.sourcePath}:${backlink.link.range.start}:${ordinal}`,
    direction: "backlink",
    status: "resolved",
    label: source?.title ?? backlink.sourcePath,
    detail: backlink.sourcePath,
    context: backlink.context,
    sourceLocation: `${backlink.sourcePath}:${backlink.link.range.line}:${backlink.link.range.column}`,
    targetPath: backlink.sourcePath,
    targetRange: backlink.link.range,
  };
}
