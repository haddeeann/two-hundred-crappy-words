import {
  markdownFileStem,
  normalizeLoreName,
  relativeMarkdownStem,
  simplifyHeadingText,
} from "./normalize";
import type {
  LoreLinkResolution,
  ParsedHeading,
  ParsedWikiLink,
} from "./types";

export interface LoreResolvableDocument {
  path: string;
  title: string;
  aliases: readonly string[];
  headings: readonly ParsedHeading[];
}

export interface LoreResolutionCatalog {
  documents: ReadonlyMap<string, LoreResolvableDocument>;
  names: ReadonlyMap<string, ReadonlySet<string>>;
  paths: ReadonlyMap<string, ReadonlySet<string>>;
}

export function createResolutionCatalog(
  documents: readonly LoreResolvableDocument[],
): LoreResolutionCatalog {
  const byPath = new Map(documents.map((document) => [document.path, document]));
  const names = new Map<string, Set<string>>();
  const paths = new Map<string, Set<string>>();

  for (const document of documents) {
    const lookupNames = new Set([
      document.title,
      ...document.aliases,
      markdownFileStem(document.path),
      relativeMarkdownStem(document.path),
    ]);
    for (const name of lookupNames) addLookup(names, normalizeLoreName(name), document.path);
    addLookup(paths, normalizeLoreName(relativeMarkdownStem(document.path)), document.path);
  }

  return { documents: byPath, names, paths };
}

export function resolveWikiLink(
  sourcePath: string,
  link: ParsedWikiLink,
  catalog: LoreResolutionCatalog,
): LoreLinkResolution {
  const source = catalog.documents.get(sourcePath);
  if (!source) {
    return {
      kind: "invalid-target",
      candidatePaths: [],
      message: "The source note is not present in the current lore index.",
    };
  }

  let candidates: string[];
  if (!link.noteTarget && link.headingTarget !== null) {
    candidates = [sourcePath];
  } else if (isExplicitPath(link.noteTarget)) {
    const pathIssue = validateExplicitPath(link.noteTarget);
    if (pathIssue) {
      return {
        kind: "invalid-target",
        candidatePaths: [],
        message: pathIssue,
      };
    }
    candidates = [...(catalog.paths.get(normalizeLoreName(stripMarkdownExtension(link.noteTarget))) ?? [])];
  } else if (link.noteTarget.includes("\\")) {
    return {
      kind: "invalid-target",
      candidatePaths: [],
      message: "Wiki-link paths must use forward slashes.",
    };
  } else {
    candidates = [...(catalog.names.get(normalizeLoreName(link.noteTarget)) ?? [])];
  }
  candidates.sort((first, second) => first.localeCompare(second));

  if (candidates.length === 0) {
    return {
      kind: "broken-note",
      candidatePaths: [],
      message: `No indexed note matches “${link.noteTarget}”.`,
    };
  }
  if (candidates.length > 1) {
    return {
      kind: "ambiguous-note",
      candidatePaths: candidates,
      message: `“${link.noteTarget}” matches more than one indexed note. Use a project-relative path to disambiguate it.`,
    };
  }

  const targetPath = candidates[0]!;
  if (link.headingTarget === null) {
    return { kind: "resolved", targetPath, heading: null };
  }
  const target = catalog.documents.get(targetPath)!;
  const normalizedHeading = normalizeLoreName(simplifyHeadingText(link.headingTarget));
  const matchingHeadings = target.headings.filter(
    (heading) => normalizeLoreName(heading.lookupText) === normalizedHeading,
  );
  if (matchingHeadings.length === 0) {
    return {
      kind: "broken-heading",
      targetPath,
      candidateHeadings: [],
      message: `“${target.title}” has no heading named “${link.headingTarget}”.`,
    };
  }
  if (matchingHeadings.length > 1) {
    return {
      kind: "ambiguous-heading",
      targetPath,
      candidateHeadings: matchingHeadings,
      message: `“${target.title}” has more than one heading named “${link.headingTarget}”.`,
    };
  }
  return { kind: "resolved", targetPath, heading: matchingHeadings[0]! };
}

function isExplicitPath(target: string): boolean {
  return target.includes("/") || target.startsWith("/");
}

function validateExplicitPath(target: string): string | null {
  if (target.startsWith("/")) return "Wiki-link paths must be project-relative.";
  if (target.includes("\\")) return "Wiki-link paths must use forward slashes.";
  const segments = target.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return "Wiki-link paths cannot contain empty, . or .. segments.";
  }
  return null;
}

function stripMarkdownExtension(target: string): string {
  return target.replace(/\.(?:md|markdown)$/iu, "");
}

function addLookup(map: Map<string, Set<string>>, key: string, path: string): void {
  const matches = map.get(key) ?? new Set<string>();
  matches.add(path);
  map.set(key, matches);
}

export function duplicateHeadingNames(headings: readonly ParsedHeading[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const heading of headings) {
    const normalized = normalizeLoreName(heading.lookupText);
    if (seen.has(normalized)) duplicates.add(normalized);
    else seen.add(normalized);
  }
  return duplicates;
}
