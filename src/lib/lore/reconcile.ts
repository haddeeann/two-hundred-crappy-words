import { isMarkdownPath } from "./normalize";
import {
  DEFAULT_MAX_LORE_FILE_BYTES,
  DEFAULT_MAX_LORE_FILES,
  DEFAULT_MAX_LORE_TOTAL_BYTES,
  loreExclusionForEntry,
  readStableLoreFile,
  scanLoreSubtree,
  validateLoreConfiguredPaths,
  type LoreScanBackend,
  type LoreScanEntry,
  type LoreScanIssue,
  type LoreScanOptions,
} from "./scan";
import type { LoreProjectIndex } from "./types";

export interface LoreReconcileRequest {
  rootPath: string;
  relativePaths: readonly string[];
  currentIndex: LoreProjectIndex;
  backend: LoreScanBackend;
  options?: LoreScanOptions;
}

export interface LoreReconcileResult {
  changes: ReadonlyMap<string, string | null>;
  issues: LoreScanIssue[];
  stale: boolean;
}

type LocatedPath =
  | { kind: "found"; absolutePath: string; entry: LoreScanEntry }
  | { kind: "missing" }
  | { kind: "excluded"; issue: LoreScanIssue }
  | { kind: "unreadable"; issue: LoreScanIssue };

export async function reconcileLoreChanges({
  rootPath,
  relativePaths,
  currentIndex,
  backend,
  options = {},
}: LoreReconcileRequest): Promise<LoreReconcileResult> {
  const paths = collapseLoreChangePaths(relativePaths);
  const excludedPaths = validateLoreConfiguredPaths(
    options.excludedPaths ?? [],
    "excludedPaths",
  );
  const generatedPaths = validateLoreConfiguredPaths(
    options.generatedPaths ?? [],
    "generatedPaths",
  );
  const changes = new Map<string, string | null>();
  const issues: LoreScanIssue[] = [];
  let stale = false;

  for (const relativePath of paths) {
    if (!relativePath) {
      const scan = await scanLoreSubtree(rootPath, "", backend, options);
      if (scan.truncated) {
        issues.push(...scan.issues);
        stale = true;
        continue;
      }
      replacePrefix("", currentIndex, scan.sources, changes);
      issues.push(...scan.issues);
      continue;
    }

    const located = await locateProjectPath(
      rootPath,
      relativePath,
      backend,
      excludedPaths,
      generatedPaths,
    );
    if (located.kind === "unreadable") {
      issues.push(located.issue);
      stale = true;
      continue;
    }
    if (located.kind === "missing") {
      removePrefix(relativePath, currentIndex, changes);
      continue;
    }
    if (located.kind === "excluded") {
      removePrefix(relativePath, currentIndex, changes);
      issues.push(located.issue);
      continue;
    }

    if (located.entry.isDirectory) {
      const scan = await scanLoreSubtree(
        located.absolutePath,
        relativePath,
        backend,
        options,
      );
      if (scan.truncated) {
        issues.push(...scan.issues);
        stale = true;
        continue;
      }
      replacePrefix(relativePath, currentIndex, scan.sources, changes);
      issues.push(...scan.issues);
      continue;
    }

    if (!located.entry.isFile || !isMarkdownPath(relativePath)) {
      removePrefix(relativePath, currentIndex, changes);
      continue;
    }

    const fileIssues: LoreScanIssue[] = [];
    try {
      const accepted = await readStableLoreFile(
        located.absolutePath,
        relativePath,
        backend,
        options.maxFileBytes ?? DEFAULT_MAX_LORE_FILE_BYTES,
        (issue) => fileIssues.push(issue),
      );
      issues.push(...fileIssues);
      if (accepted) changes.set(relativePath, accepted.text);
      else if (fileIssues.some(({ kind }) => kind === "oversized-file")) {
        changes.set(relativePath, null);
      } else {
        stale = true;
      }
    } catch (cause) {
      issues.push({
        kind: "unreadable-file",
        path: relativePath,
        message: `Could not reconcile this file: ${formatError(cause)}`,
      });
      stale = true;
    }
  }

  if (!stale && exceedsProjectLimits(currentIndex, changes, options)) {
    changes.clear();
    issues.push({
      kind: "scan-limit",
      path: "",
      message: "Incremental changes would exceed the project lore-index safety limits; use refresh after reducing the indexed set.",
    });
    stale = true;
  }
  return { changes, issues, stale };
}

export function collapseLoreChangePaths(paths: readonly string[]): string[] {
  const safe = [...new Set(paths.map(normalizeRelativePath).filter((path): path is string => path !== null))]
    .sort((first, second) => first.length - second.length || first.localeCompare(second));
  const collapsed: string[] = [];
  for (const path of safe) {
    if (
      collapsed.some(
        (parent) => !parent || path === parent || path.startsWith(`${parent}/`),
      )
    ) {
      continue;
    }
    collapsed.push(path);
  }
  return collapsed;
}

async function locateProjectPath(
  rootPath: string,
  relativePath: string,
  backend: LoreScanBackend,
  excludedPaths: readonly string[],
  generatedPaths: readonly string[],
): Promise<LocatedPath> {
  let absoluteDirectory = rootPath;
  let traversed = "";
  const segments = relativePath.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    let entries: readonly LoreScanEntry[];
    try {
      entries = await backend.readDirectory(absoluteDirectory);
    } catch (cause) {
      return {
        kind: "unreadable",
        issue: {
          kind: "unreadable-directory",
          path: traversed,
          message: `Could not reconcile this directory: ${formatError(cause)}`,
        },
      };
    }
    const entry = entries.find((candidate) => candidate.name === segment);
    if (!entry) return { kind: "missing" };
    traversed = traversed ? `${traversed}/${segment}` : segment;
    const exclusion = loreExclusionForEntry(
      traversed,
      entry,
      excludedPaths,
      generatedPaths,
    );
    if (exclusion) return { kind: "excluded", issue: exclusion };
    if (entry.isSymlink) {
      return {
        kind: "excluded",
        issue: {
          kind: "symbolic-link",
          path: traversed,
          message: "Symbolic links are not followed by the lore index.",
        },
      };
    }
    const absolutePath = await backend.join(absoluteDirectory, segment);
    if (index === segments.length - 1) {
      return { kind: "found", absolutePath, entry };
    }
    if (!entry.isDirectory) return { kind: "missing" };
    absoluteDirectory = absolutePath;
  }
  return { kind: "missing" };
}

function replacePrefix(
  prefix: string,
  currentIndex: LoreProjectIndex,
  sources: readonly { path: string; text: string }[],
  changes: Map<string, string | null>,
): void {
  const nextPaths = new Set(sources.map(({ path }) => path));
  for (const path of currentIndex.documents.keys()) {
    if (isWithinPrefix(path, prefix) && !nextPaths.has(path)) changes.set(path, null);
  }
  for (const source of sources) changes.set(source.path, source.text);
}

function removePrefix(
  prefix: string,
  currentIndex: LoreProjectIndex,
  changes: Map<string, string | null>,
): void {
  for (const path of currentIndex.documents.keys()) {
    if (isWithinPrefix(path, prefix)) changes.set(path, null);
  }
}

function isWithinPrefix(path: string, prefix: string): boolean {
  return !prefix || path === prefix || path.startsWith(`${prefix}/`);
}

function exceedsProjectLimits(
  currentIndex: LoreProjectIndex,
  changes: ReadonlyMap<string, string | null>,
  options: LoreScanOptions,
): boolean {
  const sizes = new Map(
    [...currentIndex.documents].map(([path, record]) => [path, record.size]),
  );
  for (const [path, text] of changes) {
    if (text === null) sizes.delete(path);
    else sizes.set(path, new TextEncoder().encode(text).byteLength);
  }
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_LORE_FILES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_LORE_TOTAL_BYTES;
  return (
    sizes.size > maxFiles ||
    [...sizes.values()].reduce((total, size) => total + size, 0) > maxTotalBytes
  );
}

function normalizeRelativePath(path: string): string | null {
  const normalized = path.replace(/^\.\//u, "").replace(/\/$/u, "");
  if (!normalized) return "";
  if (
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }
  return normalized;
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
