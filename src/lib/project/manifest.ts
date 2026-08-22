import { validateFileName } from "$lib/editor/file-tree";

export const WORLD_PROJECT_MANIFEST_FILE = "200-crappy-words.project.json";
export const WORLD_PROJECT_FORMAT = "200-crappy-words/world-project";
export const WORLD_PROJECT_FORMAT_VERSION = 1;

export const WORLD_PROJECT_FOLDER_ROLES = [
  "manuscript",
  "characters",
  "locations",
  "factions",
  "species",
  "technology",
  "timeline",
  "research",
  "inbox",
] as const;

export type WorldProjectFolderRole =
  (typeof WORLD_PROJECT_FOLDER_ROLES)[number];

export type WorldProjectFolders = Partial<
  Record<WorldProjectFolderRole, string>
>;

export interface WorldProjectManifest {
  format: typeof WORLD_PROJECT_FORMAT;
  formatVersion: typeof WORLD_PROJECT_FORMAT_VERSION;
  projectId: string;
  name: string;
  folders: WorldProjectFolders;
}

export type WorldProjectManifestResult =
  | {
      kind: "valid";
      manifest: WorldProjectManifest;
      source: Record<string, unknown>;
    }
  | { kind: "malformed"; message: string }
  | { kind: "invalid"; issues: string[] }
  | { kind: "unsupported-version"; version: number };

export interface NewWorldProjectManifest {
  projectId: string;
  name: string;
  folders?: WorldProjectFolders;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWorldProjectFolderRole(
  value: string,
): value is WorldProjectFolderRole {
  return (WORLD_PROJECT_FOLDER_ROLES as readonly string[]).includes(value);
}

export function validateProjectId(value: unknown): string | null {
  if (typeof value !== "string" || !UUID_V4_PATTERN.test(value)) {
    return "projectId must be a canonical lowercase UUID v4.";
  }
  return null;
}

export function validateProjectName(value: unknown): string | null {
  if (typeof value !== "string") return "name must be text.";
  const trimmed = value.trim();
  if (!trimmed) return "name must not be empty.";
  if (CONTROL_CHARACTER_PATTERN.test(trimmed)) {
    return "name must not contain control characters.";
  }
  if ([...trimmed].length > 120) {
    return "name must contain at most 120 Unicode characters.";
  }
  return null;
}

export function validateProjectDirectoryPath(value: unknown): string | null {
  if (typeof value !== "string" || !value) {
    return "must be a non-empty project-relative directory path.";
  }
  if (value.includes("\\")) {
    return "must use forward slashes as separators.";
  }

  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return "must stay within the project and contain no empty, . or .. segment.";
  }

  for (const segment of segments) {
    const issue = validateFileName(segment);
    if (issue) return `contains an invalid path segment: ${issue}`;
  }
  return null;
}

export function parseWorldProjectManifest(
  text: string,
): WorldProjectManifestResult {
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
    return { kind: "invalid", issues: ["The manifest must be a JSON object."] };
  }

  const issues: string[] = [];
  if (value.format !== WORLD_PROJECT_FORMAT) {
    issues.push(`format must be "${WORLD_PROJECT_FORMAT}".`);
  }

  if (
    !Number.isSafeInteger(value.formatVersion) ||
    (value.formatVersion as number) < 1
  ) {
    issues.push("formatVersion must be a positive integer.");
  }
  if (issues.length > 0) return { kind: "invalid", issues };

  const formatVersion = value.formatVersion as number;
  if (formatVersion > WORLD_PROJECT_FORMAT_VERSION) {
    return { kind: "unsupported-version", version: formatVersion };
  }
  if (formatVersion !== WORLD_PROJECT_FORMAT_VERSION) {
    return {
      kind: "invalid",
      issues: [`formatVersion ${formatVersion} is not supported.`],
    };
  }

  const projectIdIssue = validateProjectId(value.projectId);
  if (projectIdIssue) issues.push(projectIdIssue);
  const nameIssue = validateProjectName(value.name);
  if (nameIssue) issues.push(nameIssue);
  if (!isRecord(value.folders)) {
    issues.push("folders must be a JSON object.");
  }

  const folders: WorldProjectFolders = {};
  if (isRecord(value.folders)) {
    for (const [role, path] of Object.entries(value.folders)) {
      if (!isWorldProjectFolderRole(role)) continue;
      const issue = validateProjectDirectoryPath(path);
      if (issue) issues.push(`folders.${role} ${issue}`);
      else folders[role] = path as string;
    }
  }

  if (issues.length > 0) return { kind: "invalid", issues };

  return {
    kind: "valid",
    manifest: {
      format: WORLD_PROJECT_FORMAT,
      formatVersion: WORLD_PROJECT_FORMAT_VERSION,
      projectId: value.projectId as string,
      name: (value.name as string).trim(),
      folders,
    },
    source: structuredClone(value),
  };
}

export function createWorldProjectManifest({
  projectId,
  name,
  folders = {},
}: NewWorldProjectManifest): WorldProjectManifest {
  const orderedFolders: WorldProjectFolders = {};
  for (const role of WORLD_PROJECT_FOLDER_ROLES) {
    const path = folders[role];
    if (path !== undefined) orderedFolders[role] = path;
  }

  const candidate: WorldProjectManifest = {
    format: WORLD_PROJECT_FORMAT,
    formatVersion: WORLD_PROJECT_FORMAT_VERSION,
    projectId,
    name: name.trim(),
    folders: orderedFolders,
  };
  const parsed = parseWorldProjectManifest(JSON.stringify(candidate));
  if (parsed.kind !== "valid") {
    const detail =
      parsed.kind === "invalid"
        ? parsed.issues.join(" ")
        : parsed.kind === "malformed"
          ? parsed.message
          : `Unsupported format version ${parsed.version}.`;
    throw new RangeError(`Cannot create world project manifest: ${detail}`);
  }
  return parsed.manifest;
}

export function serializeWorldProjectManifest(
  manifest: WorldProjectManifest,
): string {
  const validated = createWorldProjectManifest(manifest);
  return `${JSON.stringify(validated, null, 2)}\n`;
}

export function worldProjectStorageKey(projectId: string): string {
  const issue = validateProjectId(projectId);
  if (issue) throw new RangeError(issue);
  return `project:${projectId}`;
}
