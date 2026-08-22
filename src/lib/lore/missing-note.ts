import { validateFileName, validateFolderName } from "$lib/editor/file-tree";
import { normalizeLoreName } from "./normalize";
import type { IndexedWikiLink, LoreProjectIndex } from "./types";

export type MissingLoreNotePlan =
  | {
      kind: "ready";
      path: string;
      title: string;
      text: string;
    }
  | {
      kind: "unavailable";
      reason: string;
    };

export function planMissingLoreNote(
  outgoing: IndexedWikiLink,
  index: LoreProjectIndex,
): MissingLoreNotePlan {
  if (outgoing.resolution.kind !== "broken-note") {
    return {
      kind: "unavailable",
      reason: "Only a link with one missing note target can create a note.",
    };
  }
  const target = outgoing.link.noteTarget.trim();
  if (!target) {
    return { kind: "unavailable", reason: "The link has no note name." };
  }
  const segments = target.split("/");
  const finalTarget = segments.at(-1)!;
  const fileName = /\.(?:md|markdown)$/iu.test(finalTarget)
    ? finalTarget
    : `${finalTarget}.md`;
  const pathSegments = [...segments.slice(0, -1), fileName];
  for (const directory of pathSegments.slice(0, -1)) {
    const issue = validateFolderName(directory);
    if (issue) return { kind: "unavailable", reason: issue };
    if (directory.startsWith(".") || /^(?:node_modules|target)$/iu.test(directory)) {
      return {
        kind: "unavailable",
        reason: "Hidden, dependency, and build-output folders cannot contain an indexed missing note.",
      };
    }
  }
  const fileIssue = validateFileName(fileName);
  if (fileIssue) return { kind: "unavailable", reason: fileIssue };
  if (fileName.startsWith(".")) {
    return { kind: "unavailable", reason: "A hidden file cannot become an indexed lore note." };
  }
  const path = pathSegments.join("/");
  const normalizedPath = normalizeLoreName(path);
  if ([...index.documents.keys()].some((candidate) => normalizeLoreName(candidate) === normalizedPath)) {
    return {
      kind: "unavailable",
      reason: "An indexed note already uses this project-relative path.",
    };
  }
  const title = finalTarget.replace(/\.(?:md|markdown)$/iu, "").trim();
  if (!title) return { kind: "unavailable", reason: "The note title would be empty." };
  const heading = outgoing.link.headingTarget?.trim();
  const text = `# ${title}\n${heading ? `\n## ${heading}\n` : ""}`;
  return { kind: "ready", path, title, text };
}
