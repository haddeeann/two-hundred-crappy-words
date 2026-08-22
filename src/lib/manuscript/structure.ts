import { validateFileName } from "$lib/editor/file-tree";
import {
  validateProjectDirectoryPath,
  validateProjectId,
} from "$lib/project/manifest";

export const MANUSCRIPT_STRUCTURE_FILE = "200-crappy-words.manuscripts.json";
export const MANUSCRIPT_STRUCTURE_FORMAT_VERSION = 1;
export const MAX_MANUSCRIPT_STRUCTURE_BYTES = 10 * 1024 * 1024;
export const MAX_MANUSCRIPTS = 32;
export const MAX_MANUSCRIPT_ITEMS = 10_000;
export const MAX_MANUSCRIPT_ISSUES = 100;
export const MAX_OUTLINE_TITLE_CODE_POINTS = 120;
export const MAX_OUTLINE_SHORT_TEXT_CODE_POINTS = 240;
export const MAX_OUTLINE_LONG_TEXT_CODE_POINTS = 10_000;
export const MAX_OUTLINE_LABELS = 32;
export const MAX_OUTLINE_LABEL_CODE_POINTS = 120;
export const MAX_OUTLINE_TARGET_WORDS = 10_000_000;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const MULTILINE_CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

export interface ManuscriptSourceBinding {
  path: string;
  noteId?: string;
}

export interface ManuscriptOutlineMetadata {
  synopsis?: string;
  pov?: string;
  location?: string;
  storyDate?: string;
  status?: string;
  labels?: string[];
  notes?: string;
  targetWords?: number;
  includeInCompile: boolean;
}

export interface ManuscriptScene extends ManuscriptOutlineMetadata {
  id: string;
  kind: "scene";
  title: string;
  source: ManuscriptSourceBinding;
}

export interface ManuscriptChapter extends ManuscriptOutlineMetadata {
  id: string;
  kind: "chapter";
  title: string;
  folder?: string;
  overview?: ManuscriptSourceBinding;
  source?: ManuscriptSourceBinding;
  children: ManuscriptScene[];
}

export type ManuscriptOutlineItem = ManuscriptChapter | ManuscriptScene;

export interface ManuscriptDefinition {
  id: string;
  title: string;
  items: ManuscriptOutlineItem[];
}

export interface ManuscriptStructure {
  formatVersion: typeof MANUSCRIPT_STRUCTURE_FORMAT_VERSION;
  manuscripts: ManuscriptDefinition[];
}

export interface ManuscriptStructureIssue {
  path: string;
  message: string;
}

export type ManuscriptStructureResult =
  | {
      kind: "valid";
      structure: ManuscriptStructure;
      source: Record<string, unknown>;
    }
  | { kind: "malformed"; message: string }
  | { kind: "invalid"; issues: ManuscriptStructureIssue[] }
  | { kind: "unsupported-version"; version: number };

interface ParseContext {
  issues: IssueCollector;
  manuscriptIds: Map<string, string>;
  itemIds: Map<string, string>;
  bindingPaths: Map<string, string>;
  bindingNoteIds: Map<string, string>;
  itemCount: number;
  itemLimitReported: boolean;
}

class IssueCollector {
  readonly #issues: ManuscriptStructureIssue[] = [];
  #omitted = false;

  add(path: string, message: string): void {
    if (this.#issues.length < MAX_MANUSCRIPT_ISSUES) {
      this.#issues.push({ path, message });
      return;
    }
    this.#omitted = true;
  }

  get hasIssues(): boolean {
    return this.#issues.length > 0 || this.#omitted;
  }

  result(): ManuscriptStructureIssue[] {
    if (!this.#omitted) return [...this.#issues];
    return [
      ...this.#issues,
      {
        path: "$",
        message: `Additional issues were omitted after the first ${MAX_MANUSCRIPT_ISSUES}.`,
      },
    ];
  }
}

export function parseManuscriptStructure(
  text: string,
): ManuscriptStructureResult {
  if (new TextEncoder().encode(text).byteLength > MAX_MANUSCRIPT_STRUCTURE_BYTES) {
    return {
      kind: "invalid",
      issues: [
        {
          path: "$",
          message: `The structure file must not exceed ${MAX_MANUSCRIPT_STRUCTURE_BYTES} bytes.`,
        },
      ],
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
      issues: [{ path: "$", message: "The structure file must be a JSON object." }],
    };
  }

  if (
    !Number.isSafeInteger(value.formatVersion) ||
    (value.formatVersion as number) < 1
  ) {
    return {
      kind: "invalid",
      issues: [
        {
          path: "$.formatVersion",
          message: "formatVersion must be a positive integer.",
        },
      ],
    };
  }
  const formatVersion = value.formatVersion as number;
  if (formatVersion > MANUSCRIPT_STRUCTURE_FORMAT_VERSION) {
    return { kind: "unsupported-version", version: formatVersion };
  }
  if (formatVersion !== MANUSCRIPT_STRUCTURE_FORMAT_VERSION) {
    return {
      kind: "invalid",
      issues: [
        {
          path: "$.formatVersion",
          message: `formatVersion ${formatVersion} is not supported.`,
        },
      ],
    };
  }

  const issues = new IssueCollector();
  const context: ParseContext = {
    issues,
    manuscriptIds: new Map(),
    itemIds: new Map(),
    bindingPaths: new Map(),
    bindingNoteIds: new Map(),
    itemCount: 0,
    itemLimitReported: false,
  };
  const manuscripts: ManuscriptDefinition[] = [];
  if (!Array.isArray(value.manuscripts)) {
    issues.add("$.manuscripts", "manuscripts must be an array.");
  } else {
    if (value.manuscripts.length > MAX_MANUSCRIPTS) {
      issues.add(
        "$.manuscripts",
        `manuscripts must contain at most ${MAX_MANUSCRIPTS} entries.`,
      );
    }
    const manuscriptLimit = Math.min(value.manuscripts.length, MAX_MANUSCRIPTS);
    for (let index = 0; index < manuscriptLimit; index += 1) {
      const manuscript = parseManuscript(
        value.manuscripts[index],
        `$.manuscripts[${index}]`,
        context,
      );
      if (manuscript) manuscripts.push(manuscript);
    }
  }

  if (issues.hasIssues) return { kind: "invalid", issues: issues.result() };
  return {
    kind: "valid",
    structure: {
      formatVersion: MANUSCRIPT_STRUCTURE_FORMAT_VERSION,
      manuscripts,
    },
    source: structuredClone(value),
  };
}

export function serializeManuscriptStructure(
  structure: ManuscriptStructure,
): string {
  if (structure.formatVersion !== MANUSCRIPT_STRUCTURE_FORMAT_VERSION) {
    throw new RangeError(
      `Cannot serialize manuscript structure: formatVersion must be ${MANUSCRIPT_STRUCTURE_FORMAT_VERSION}.`,
    );
  }
  const candidate = {
    formatVersion: MANUSCRIPT_STRUCTURE_FORMAT_VERSION,
    manuscripts: structure.manuscripts.map(serializeManuscript),
  };
  const text = `${JSON.stringify(candidate, null, 2)}\n`;
  const parsed = parseManuscriptStructure(text);
  if (parsed.kind !== "valid") {
    const detail =
      parsed.kind === "invalid"
        ? parsed.issues.map(({ path, message }) => `${path}: ${message}`).join(" ")
        : parsed.kind === "malformed"
          ? parsed.message
          : `Unsupported format version ${parsed.version}.`;
    throw new RangeError(`Cannot serialize manuscript structure: ${detail}`);
  }
  return text;
}

export function validateManuscriptFilePath(value: unknown): string | null {
  if (typeof value !== "string" || !value) {
    return "must be a non-empty project-relative Markdown path.";
  }
  if (value.includes("\\")) return "must use forward slashes as separators.";
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return "must stay within the project and contain no empty, . or .. segment.";
  }
  for (const segment of segments) {
    const issue = validateFileName(segment);
    if (issue) return `contains an invalid path segment: ${issue}`;
  }
  if (!value.toLocaleLowerCase().endsWith(".md")) {
    return "must end with .md.";
  }
  return null;
}

function parseManuscript(
  value: unknown,
  path: string,
  context: ParseContext,
): ManuscriptDefinition | null {
  if (!isRecord(value)) {
    context.issues.add(path, "A manuscript must be a JSON object.");
    return null;
  }
  const id = parseUuid(value.id, `${path}.id`, context);
  if (id) registerUnique(id, path, context.manuscriptIds, `${path}.id`, "manuscript ID", context);
  const title = parseTitle(value.title, `${path}.title`, context);
  const items: ManuscriptOutlineItem[] = [];
  if (!Array.isArray(value.items)) {
    context.issues.add(`${path}.items`, "items must be an array.");
  } else {
    for (let index = 0; index < value.items.length; index += 1) {
      if (!reserveItem(context, `${path}.items`)) break;
      const item = parseOutlineItem(
        value.items[index],
        `${path}.items[${index}]`,
        context,
        false,
      );
      if (item) items.push(item);
    }
  }
  return id && title ? { id, title, items } : null;
}

function parseOutlineItem(
  value: unknown,
  path: string,
  context: ParseContext,
  nested: boolean,
): ManuscriptOutlineItem | null {
  if (!isRecord(value)) {
    context.issues.add(path, "An outline item must be a JSON object.");
    return null;
  }
  const id = parseUuid(value.id, `${path}.id`, context);
  if (id) registerUnique(id, path, context.itemIds, `${path}.id`, "outline item ID", context);
  const title = parseTitle(value.title, `${path}.title`, context);
  const metadata = parseMetadata(value, path, context);

  if (value.kind === "scene") {
    if ("children" in value) {
      context.issues.add(`${path}.children`, "A scene must not contain children.");
    }
    if ("folder" in value) {
      context.issues.add(`${path}.folder`, "Only a chapter may declare a folder.");
    }
    if ("overview" in value) {
      context.issues.add(`${path}.overview`, "Only a chapter may declare an overview.");
    }
    const source = parseBinding(value.source, `${path}.source`, context, true);
    return id && title && source
      ? { id, kind: "scene", title, source, ...metadata }
      : null;
  }

  if (value.kind === "chapter") {
    if (nested) {
      context.issues.add(`${path}.kind`, "A chapter must not be nested inside another chapter.");
    }
    const folder = parseOptionalFolder(value.folder, `${path}.folder`, context);
    const overview = parseBinding(
      value.overview,
      `${path}.overview`,
      context,
      false,
    );
    const source = parseBinding(value.source, `${path}.source`, context, false);
    const children: ManuscriptScene[] = [];
    if (value.children !== undefined && !Array.isArray(value.children)) {
      context.issues.add(`${path}.children`, "children must be an array when present.");
    } else if (Array.isArray(value.children)) {
      for (let index = 0; index < value.children.length; index += 1) {
        if (!reserveItem(context, `${path}.children`)) break;
        const child = parseOutlineItem(
          value.children[index],
          `${path}.children[${index}]`,
          context,
          true,
        );
        if (child?.kind === "scene") children.push(child);
      }
    }
    if (source && Array.isArray(value.children) && value.children.length > 0) {
      context.issues.add(
        path,
        "A chapter must not have both its own prose source and child scenes.",
      );
    }
    return id && title
      ? {
          id,
          kind: "chapter",
          title,
          ...(folder ? { folder } : {}),
          ...(overview ? { overview } : {}),
          ...(source ? { source } : {}),
          children,
          ...metadata,
        }
      : null;
  }

  context.issues.add(`${path}.kind`, 'kind must be "chapter" or "scene".');
  return null;
}

function parseMetadata(
  value: Record<string, unknown>,
  path: string,
  context: ParseContext,
): ManuscriptOutlineMetadata {
  const synopsis = parseOptionalText(
    value.synopsis,
    `${path}.synopsis`,
    MAX_OUTLINE_LONG_TEXT_CODE_POINTS,
    true,
    context,
  );
  const notes = parseOptionalText(
    value.notes,
    `${path}.notes`,
    MAX_OUTLINE_LONG_TEXT_CODE_POINTS,
    true,
    context,
  );
  const pov = parseOptionalText(value.pov, `${path}.pov`, MAX_OUTLINE_SHORT_TEXT_CODE_POINTS, false, context);
  const location = parseOptionalText(value.location, `${path}.location`, MAX_OUTLINE_SHORT_TEXT_CODE_POINTS, false, context);
  const storyDate = parseOptionalText(value.storyDate, `${path}.storyDate`, MAX_OUTLINE_SHORT_TEXT_CODE_POINTS, false, context);
  const status = parseOptionalText(value.status, `${path}.status`, MAX_OUTLINE_SHORT_TEXT_CODE_POINTS, false, context);
  const labels = parseLabels(value.labels, `${path}.labels`, context);
  const targetWords = parseTargetWords(value.targetWords, `${path}.targetWords`, context);
  let includeInCompile = true;
  if (value.includeInCompile !== undefined) {
    if (typeof value.includeInCompile !== "boolean") {
      context.issues.add(`${path}.includeInCompile`, "includeInCompile must be true or false.");
    } else {
      includeInCompile = value.includeInCompile;
    }
  }
  return {
    ...(synopsis !== undefined ? { synopsis } : {}),
    ...(pov !== undefined ? { pov } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(storyDate !== undefined ? { storyDate } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(labels !== undefined ? { labels } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(targetWords !== undefined ? { targetWords } : {}),
    includeInCompile,
  };
}

function parseBinding(
  value: unknown,
  path: string,
  context: ParseContext,
  required: boolean,
): ManuscriptSourceBinding | undefined {
  if (value === undefined) {
    if (required) context.issues.add(path, "A scene source is required.");
    return undefined;
  }
  if (!isRecord(value)) {
    context.issues.add(path, "A source binding must be a JSON object.");
    return undefined;
  }
  const pathIssue = validateManuscriptFilePath(value.path);
  if (pathIssue) context.issues.add(`${path}.path`, pathIssue);
  const sourcePath = pathIssue ? null : (value.path as string);
  let noteId: string | undefined;
  if (value.noteId !== undefined) {
    const noteIdIssue = validateProjectId(value.noteId);
    if (noteIdIssue) context.issues.add(`${path}.noteId`, noteIdIssue.replace("projectId", "noteId"));
    else noteId = value.noteId as string;
  }
  if (sourcePath) {
    registerUnique(sourcePath, path, context.bindingPaths, `${path}.path`, "source path", context);
  }
  if (noteId) {
    registerUnique(noteId, path, context.bindingNoteIds, `${path}.noteId`, "source note ID", context);
  }
  return sourcePath
    ? { path: sourcePath, ...(noteId ? { noteId } : {}) }
    : undefined;
}

function parseOptionalFolder(
  value: unknown,
  path: string,
  context: ParseContext,
): string | undefined {
  if (value === undefined) return undefined;
  const issue = validateProjectDirectoryPath(value);
  if (issue) {
    context.issues.add(path, issue);
    return undefined;
  }
  return value as string;
}

function parseUuid(
  value: unknown,
  path: string,
  context: ParseContext,
): string | null {
  const issue = validateProjectId(value);
  if (issue) {
    context.issues.add(path, issue.replace("projectId", "id"));
    return null;
  }
  return value as string;
}

function parseTitle(
  value: unknown,
  path: string,
  context: ParseContext,
): string | null {
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
  if ([...trimmed].length > MAX_OUTLINE_TITLE_CODE_POINTS) {
    context.issues.add(
      path,
      `title must contain at most ${MAX_OUTLINE_TITLE_CODE_POINTS} Unicode characters.`,
    );
    return null;
  }
  return trimmed;
}

function parseOptionalText(
  value: unknown,
  path: string,
  limit: number,
  multiline: boolean,
  context: ParseContext,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    context.issues.add(path, "must be text when present.");
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    context.issues.add(path, "must not be empty when present.");
    return undefined;
  }
  const controlPattern = multiline
    ? MULTILINE_CONTROL_CHARACTER_PATTERN
    : CONTROL_CHARACTER_PATTERN;
  if (controlPattern.test(trimmed)) {
    context.issues.add(path, "must not contain unsupported control characters.");
    return undefined;
  }
  if ([...trimmed].length > limit) {
    context.issues.add(path, `must contain at most ${limit} Unicode characters.`);
    return undefined;
  }
  return trimmed;
}

function parseLabels(
  value: unknown,
  path: string,
  context: ParseContext,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    context.issues.add(path, "labels must be an array when present.");
    return undefined;
  }
  if (value.length > MAX_OUTLINE_LABELS) {
    context.issues.add(path, `labels must contain at most ${MAX_OUTLINE_LABELS} entries.`);
  }
  const labels: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < Math.min(value.length, MAX_OUTLINE_LABELS); index += 1) {
    const labelPath = `${path}[${index}]`;
    const label = parseOptionalText(
      value[index],
      labelPath,
      MAX_OUTLINE_LABEL_CODE_POINTS,
      false,
      context,
    );
    if (label === undefined) continue;
    if (seen.has(label)) {
      context.issues.add(labelPath, `Duplicate label ${JSON.stringify(label)}.`);
      continue;
    }
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

function parseTargetWords(
  value: unknown,
  path: string,
  context: ParseContext,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > MAX_OUTLINE_TARGET_WORDS
  ) {
    context.issues.add(
      path,
      `targetWords must be a whole number from 1 through ${MAX_OUTLINE_TARGET_WORDS}.`,
    );
    return undefined;
  }
  return value as number;
}

function reserveItem(context: ParseContext, path: string): boolean {
  if (context.itemCount >= MAX_MANUSCRIPT_ITEMS) {
    if (!context.itemLimitReported) {
      context.issues.add(
        path,
        `The structure must contain at most ${MAX_MANUSCRIPT_ITEMS} outline items.`,
      );
      context.itemLimitReported = true;
    }
    return false;
  }
  context.itemCount += 1;
  return true;
}

function registerUnique(
  value: string,
  ownerPath: string,
  registry: Map<string, string>,
  issuePath: string,
  label: string,
  context: ParseContext,
): void {
  const previous = registry.get(value);
  if (previous) {
    context.issues.add(
      issuePath,
      `Duplicate ${label} ${JSON.stringify(value)}; first used at ${previous}.`,
    );
    return;
  }
  registry.set(value, ownerPath);
}

function serializeManuscript(manuscript: ManuscriptDefinition) {
  return {
    id: manuscript.id,
    title: manuscript.title,
    items: manuscript.items.map(serializeOutlineItem),
  };
}

function serializeOutlineItem(item: ManuscriptOutlineItem): Record<string, unknown> {
  const metadata = serializeMetadata(item);
  if (item.kind === "scene") {
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      ...metadata,
      source: serializeBinding(item.source),
    };
  }
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    ...metadata,
    ...(item.folder ? { folder: item.folder } : {}),
    ...(item.overview ? { overview: serializeBinding(item.overview) } : {}),
    ...(item.source ? { source: serializeBinding(item.source) } : {}),
    ...(item.children.length > 0
      ? { children: item.children.map(serializeOutlineItem) }
      : {}),
  };
}

function serializeMetadata(metadata: ManuscriptOutlineMetadata): Record<string, unknown> {
  return {
    ...(metadata.synopsis !== undefined ? { synopsis: metadata.synopsis } : {}),
    ...(metadata.pov !== undefined ? { pov: metadata.pov } : {}),
    ...(metadata.location !== undefined ? { location: metadata.location } : {}),
    ...(metadata.storyDate !== undefined ? { storyDate: metadata.storyDate } : {}),
    ...(metadata.status !== undefined ? { status: metadata.status } : {}),
    ...(metadata.labels !== undefined ? { labels: [...metadata.labels] } : {}),
    ...(metadata.notes !== undefined ? { notes: metadata.notes } : {}),
    ...(metadata.targetWords !== undefined ? { targetWords: metadata.targetWords } : {}),
    ...(!metadata.includeInCompile ? { includeInCompile: false } : {}),
  };
}

function serializeBinding(binding: ManuscriptSourceBinding) {
  return {
    path: binding.path,
    ...(binding.noteId ? { noteId: binding.noteId } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
