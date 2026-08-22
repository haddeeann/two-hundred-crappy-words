import { isMarkdownPath } from "./normalize";
import type { LoreSourceDocument } from "./index";

export const DEFAULT_MAX_LORE_FILE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MAX_LORE_FILES = 5_000;
export const DEFAULT_MAX_LORE_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_REPORTED_SCAN_ISSUES = 200;

export interface LoreScanEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface LoreFileRevision {
  size: number;
  revision: string;
}

export interface LoreScanBackend {
  readDirectory(path: string): Promise<readonly LoreScanEntry[]>;
  readText(path: string): Promise<string>;
  inspectFile(path: string): Promise<LoreFileRevision>;
  join(parent: string, child: string): Promise<string>;
}

export interface LoreScanOptions {
  excludedPaths?: readonly string[];
  generatedPaths?: readonly string[];
  maxFileBytes?: number;
  maxFiles?: number;
  maxTotalBytes?: number;
}

export interface LoreScanIssue {
  kind:
    | "hidden-path"
    | "default-exclusion"
    | "configured-exclusion"
    | "generated-path"
    | "symbolic-link"
    | "oversized-file"
    | "unreadable-directory"
    | "unreadable-file"
    | "changed-during-read"
    | "scan-limit";
  path: string;
  message: string;
}

export interface LoreScanResult {
  sources: LoreSourceDocument[];
  issues: LoreScanIssue[];
  suppressedIssueCount: number;
  acceptedBytes: number;
  visitedMarkdownFiles: number;
  truncated: boolean;
}

export async function scanProjectLore(
  rootPath: string,
  backend: LoreScanBackend,
  options: LoreScanOptions = {},
): Promise<LoreScanResult> {
  const maxFileBytes = validLimit(options.maxFileBytes, DEFAULT_MAX_LORE_FILE_BYTES);
  const maxFiles = validLimit(options.maxFiles, DEFAULT_MAX_LORE_FILES);
  const maxTotalBytes = validLimit(options.maxTotalBytes, DEFAULT_MAX_LORE_TOTAL_BYTES);
  const excludedPaths = validateConfiguredPaths(options.excludedPaths ?? [], "excludedPaths");
  const generatedPaths = validateConfiguredPaths(options.generatedPaths ?? [], "generatedPaths");
  const sources: LoreSourceDocument[] = [];
  const issues: LoreScanIssue[] = [];
  let suppressedIssueCount = 0;
  let acceptedBytes = 0;
  let visitedMarkdownFiles = 0;
  let truncated = false;

  const report = (issue: LoreScanIssue) => {
    if (issues.length < MAX_REPORTED_SCAN_ISSUES) issues.push(issue);
    else suppressedIssueCount += 1;
  };

  const walk = async (absoluteDirectory: string, relativeDirectory: string): Promise<boolean> => {
    let entries: readonly LoreScanEntry[];
    try {
      entries = await backend.readDirectory(absoluteDirectory);
    } catch (cause) {
      report({
        kind: "unreadable-directory",
        path: relativeDirectory,
        message: `Could not index this directory: ${formatError(cause)}`,
      });
      return true;
    }

    const ordered = [...entries].sort((first, second) =>
      first.name.localeCompare(second.name, undefined, { sensitivity: "variant", numeric: true }),
    );
    for (const entry of ordered) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const exclusion = exclusionFor(relativePath, entry, excludedPaths, generatedPaths);
      if (exclusion) {
        report(exclusion);
        continue;
      }
      if (entry.isSymlink) {
        report({
          kind: "symbolic-link",
          path: relativePath,
          message: "Symbolic links are not followed by the lore index.",
        });
        continue;
      }
      const absolutePath = await backend.join(absoluteDirectory, entry.name);
      if (entry.isDirectory) {
        if (!(await walk(absolutePath, relativePath))) return false;
        continue;
      }
      if (!entry.isFile || !isMarkdownPath(relativePath)) continue;
      visitedMarkdownFiles += 1;

      if (sources.length >= maxFiles) {
        report({
          kind: "scan-limit",
          path: relativePath,
          message: `Indexing stopped after ${maxFiles.toLocaleString()} accepted Markdown files.`,
        });
        truncated = true;
        return false;
      }

      let accepted: { text: string; bytes: number } | null;
      try {
        accepted = await readStableFile(absolutePath, relativePath, backend, maxFileBytes, report);
      } catch (cause) {
        report({
          kind: "unreadable-file",
          path: relativePath,
          message: `Could not index this file: ${formatError(cause)}`,
        });
        continue;
      }
      if (!accepted) continue;
      if (acceptedBytes + accepted.bytes > maxTotalBytes) {
        report({
          kind: "scan-limit",
          path: relativePath,
          message: `Indexing stopped before accepted Markdown exceeded ${formatBytes(maxTotalBytes)}.`,
        });
        truncated = true;
        return false;
      }
      sources.push({ path: relativePath, text: accepted.text });
      acceptedBytes += accepted.bytes;
    }
    return true;
  };

  await walk(rootPath, "");
  return {
    sources,
    issues,
    suppressedIssueCount,
    acceptedBytes,
    visitedMarkdownFiles,
    truncated,
  };
}

async function readStableFile(
  absolutePath: string,
  relativePath: string,
  backend: LoreScanBackend,
  maxFileBytes: number,
  report: (issue: LoreScanIssue) => void,
): Promise<{ text: string; bytes: number } | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await backend.inspectFile(absolutePath);
    if (before.size > maxFileBytes) {
      report({
        kind: "oversized-file",
        path: relativePath,
        message: `This Markdown file is larger than ${formatBytes(maxFileBytes)} and was not indexed.`,
      });
      return null;
    }
    const text = await backend.readText(absolutePath);
    const after = await backend.inspectFile(absolutePath);
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > maxFileBytes) {
      report({
        kind: "oversized-file",
        path: relativePath,
        message: `This Markdown file is larger than ${formatBytes(maxFileBytes)} and was not indexed.`,
      });
      return null;
    }
    if (before.size === after.size && before.revision === after.revision && after.size === bytes) {
      return { text, bytes };
    }
  }
  report({
    kind: "changed-during-read",
    path: relativePath,
    message: "This file kept changing while it was read and remains visibly stale until refresh.",
  });
  return null;
}

function exclusionFor(
  path: string,
  entry: LoreScanEntry,
  excludedPaths: readonly string[],
  generatedPaths: readonly string[],
): LoreScanIssue | null {
  if (entry.name.startsWith(".")) {
    return { kind: "hidden-path", path, message: "Hidden paths are not indexed." };
  }
  if (entry.isDirectory && /^(?:node_modules|target)$/iu.test(entry.name)) {
    return {
      kind: "default-exclusion",
      path,
      message: "Dependency and build-output directories are not indexed.",
    };
  }
  if (matchesConfiguredPath(path, excludedPaths)) {
    return {
      kind: "configured-exclusion",
      path,
      message: "This path is excluded in app-local project settings.",
    };
  }
  if (matchesConfiguredPath(path, generatedPaths)) {
    return {
      kind: "generated-path",
      path,
      message: "This registered generated-output path is not indexed.",
    };
  }
  return null;
}

function matchesConfiguredPath(path: string, configured: readonly string[]): boolean {
  return configured.some((candidate) => path === candidate || path.startsWith(`${candidate}/`));
}

function validateConfiguredPaths(paths: readonly string[], option: string): string[] {
  return [...new Set(paths.map((path) => {
    if (
      !path ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").some((segment) => !segment || segment === "." || segment === "..")
    ) {
      throw new RangeError(`${option} must contain safe project-relative paths.`);
    }
    return path;
  }))];
}

function validLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("Lore scan limits must be positive safe integers.");
  }
  return value;
}

function formatBytes(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)} MiB`;
  if (bytes % 1024 === 0) return `${bytes / 1024} KiB`;
  return `${bytes} bytes`;
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
