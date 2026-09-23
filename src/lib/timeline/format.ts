import { validateProjectId } from "$lib/project/manifest";

export const TIMELINE_FILE = "200-crappy-words.timeline.json";
export const TIMELINE_FORMAT = "200-crappy-words/timeline";
export const TIMELINE_FORMAT_VERSION = 1 as const;
export const MAX_TIMELINE_BYTES = 1024 * 1024;
export const MAX_TIMELINE_CALENDARS = 32;
export const MAX_TIMELINE_TRACKS = 128;
export const MAX_TIMELINE_TRACK_MEMBERSHIPS = 10_000;
export const MAX_TIMELINE_MONTHS = 64;
export const MAX_TIMELINE_WEEKDAYS = 64;
export const MAX_TIMELINE_ERAS = 128;
export const MAX_TIMELINE_ISSUES = 100;
export const MAX_TIMELINE_CYCLE_YEARS = 10_000;
export const MAX_TIMELINE_DAYS_PER_MONTH = 1_000_000;
export const MAX_TIMELINE_ID_CODE_POINTS = 80;
export const MAX_TIMELINE_TITLE_CODE_POINTS = 120;
export const MAX_TIMELINE_EXPRESSION_CODE_POINTS = 120;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const KEBAB_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const INTEGER_PATTERN = /^(?:0|-?[1-9][0-9]*)$/u;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/u;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/u;
const FIXED_FULL_DATE_PATTERN = /^(?:(?<era>[a-z0-9]+(?:-[a-z0-9]+)*):)?(?<year>-?(?:0|[1-9][0-9]*))-(?<month>0*[1-9][0-9]*)-(?<day>0*[1-9][0-9]*)$/u;
const GREGORIAN_FULL_DATE_PATTERN = /^(?<year>[0-9]{4,})-(?<month>[0-9]{2})-(?<day>[0-9]{2})$/u;

export interface TimelineIssue {
  path: string;
  message: string;
}

export interface TimelineMonth {
  id: string;
  name: string;
  shortName: string;
  commonDays: number;
  leapDays: number;
}

export interface TimelineWeekday {
  id: string;
  name: string;
  shortName: string;
}

export interface TimelineLeapCycle {
  years: number;
  leapYears: number[];
}

export interface TimelineEra {
  id: string;
  name: string;
  abbreviation: string;
  yearOne: string;
  direction: "forward" | "backward";
}

export interface TimelineFixedAnchor {
  expression: string;
  gregorian: string;
  weekday?: string;
}

export interface TimelineOrdinalAnchor {
  expression: string;
  gregorian: string;
}

export interface TimelineFixedCalendar {
  id: string;
  title: string;
  kind: "fixed";
  months: TimelineMonth[];
  weekdays: TimelineWeekday[];
  leapCycle?: TimelineLeapCycle;
  eras: TimelineEra[];
  anchor?: TimelineFixedAnchor;
}

export interface TimelineOrdinalCalendar {
  id: string;
  title: string;
  kind: "ordinal";
  unitSingular: string;
  unitPlural: string;
  anchor?: TimelineOrdinalAnchor;
}

export type TimelineCalendar = TimelineFixedCalendar | TimelineOrdinalCalendar;

export interface TimelineTrack {
  id: string;
  title: string;
  color?: string;
  noteIds: string[];
}

export interface TimelineProject {
  format: typeof TIMELINE_FORMAT;
  formatVersion: typeof TIMELINE_FORMAT_VERSION;
  projectId: string;
  calendars: TimelineCalendar[];
  tracks: TimelineTrack[];
}

export type TimelineProjectResult =
  | {
      kind: "valid";
      timeline: TimelineProject;
      source: Record<string, unknown>;
    }
  | { kind: "malformed"; message: string }
  | { kind: "invalid"; issues: TimelineIssue[] }
  | { kind: "unsupported-version"; version: number };

interface ParseContext {
  issues: IssueCollector;
  calendarIds: Map<string, string>;
  trackIds: Map<string, string>;
  memberships: number;
  membershipLimitReported: boolean;
}

class IssueCollector {
  readonly #issues: TimelineIssue[] = [];
  #omitted = false;

  add(path: string, message: string): void {
    if (this.#issues.length < MAX_TIMELINE_ISSUES) {
      this.#issues.push({ path, message });
      return;
    }
    this.#omitted = true;
  }

  get hasIssues(): boolean {
    return this.#issues.length > 0 || this.#omitted;
  }

  result(): TimelineIssue[] {
    if (!this.#omitted) return [...this.#issues];
    return [
      ...this.#issues,
      {
        path: "$",
        message: `Additional issues were omitted after the first ${MAX_TIMELINE_ISSUES}.`,
      },
    ];
  }
}

export function parseTimelineProject(text: string): TimelineProjectResult {
  if (new TextEncoder().encode(text).byteLength > MAX_TIMELINE_BYTES) {
    return {
      kind: "invalid",
      issues: [
        {
          path: "$",
          message: `The timeline file must not exceed ${MAX_TIMELINE_BYTES} bytes.`,
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
      issues: [{ path: "$", message: "The timeline file must be a JSON object." }],
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
  if (formatVersion > TIMELINE_FORMAT_VERSION) {
    return { kind: "unsupported-version", version: formatVersion };
  }
  if (formatVersion !== TIMELINE_FORMAT_VERSION) {
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
    calendarIds: new Map(),
    trackIds: new Map(),
    memberships: 0,
    membershipLimitReported: false,
  };
  if (value.format !== TIMELINE_FORMAT) {
    issues.add("$.format", `format must be ${JSON.stringify(TIMELINE_FORMAT)}.`);
  }
  const projectId = parseUuid(value.projectId, "$.projectId", "projectId", context);
  const calendars = parseCalendars(value.calendars, context);
  const tracks = parseTracks(value.tracks, context);

  if (issues.hasIssues) return { kind: "invalid", issues: issues.result() };
  return {
    kind: "valid",
    timeline: {
      format: TIMELINE_FORMAT,
      formatVersion: TIMELINE_FORMAT_VERSION,
      projectId: projectId!,
      calendars,
      tracks,
    },
    source: structuredClone(value),
  };
}

export function serializeTimelineProject(timeline: TimelineProject): string {
  if (timeline.format !== TIMELINE_FORMAT) {
    throw new RangeError(
      `Cannot serialize timeline project: format must be ${JSON.stringify(TIMELINE_FORMAT)}.`,
    );
  }
  if (timeline.formatVersion !== TIMELINE_FORMAT_VERSION) {
    throw new RangeError(
      `Cannot serialize timeline project: formatVersion must be ${TIMELINE_FORMAT_VERSION}.`,
    );
  }
  const candidate = {
    format: TIMELINE_FORMAT,
    formatVersion: TIMELINE_FORMAT_VERSION,
    projectId: timeline.projectId,
    calendars: timeline.calendars.map(serializeCalendar),
    tracks: timeline.tracks.map(serializeTrack),
  };
  const text = `${JSON.stringify(candidate, null, 2)}\n`;
  const result = parseTimelineProject(text);
  if (result.kind !== "valid") {
    const detail =
      result.kind === "invalid"
        ? result.issues.map(({ path, message }) => `${path}: ${message}`).join(" ")
        : result.kind === "malformed"
          ? result.message
          : `Unsupported format version ${result.version}.`;
    throw new RangeError(`Cannot serialize timeline project: ${detail}`);
  }
  return text;
}

function parseCalendars(value: unknown, context: ParseContext): TimelineCalendar[] {
  if (!Array.isArray(value)) {
    context.issues.add("$.calendars", "calendars must be an array.");
    return [];
  }
  if (value.length > MAX_TIMELINE_CALENDARS) {
    context.issues.add(
      "$.calendars",
      `calendars must contain at most ${MAX_TIMELINE_CALENDARS} entries.`,
    );
  }
  const calendars: TimelineCalendar[] = [];
  for (let index = 0; index < Math.min(value.length, MAX_TIMELINE_CALENDARS); index += 1) {
    const path = `$.calendars[${index}]`;
    const calendar = parseCalendar(value[index], path, context);
    if (calendar) calendars.push(calendar);
  }
  return calendars;
}

function parseCalendar(
  value: unknown,
  path: string,
  context: ParseContext,
): TimelineCalendar | null {
  if (!isRecord(value)) {
    context.issues.add(path, "A calendar must be a JSON object.");
    return null;
  }
  const id = parseKebab(value.id, `${path}.id`, "calendar id", context);
  if (id === "gregorian") {
    context.issues.add(`${path}.id`, 'The calendar id "gregorian" is reserved.');
  }
  if (id) registerUnique(id, path, context.calendarIds, `${path}.id`, "calendar id", context);
  const title = parseText(value.title, `${path}.title`, "title", MAX_TIMELINE_TITLE_CODE_POINTS, context);

  if (value.kind === "fixed") {
    const months = parseMonths(value.months, path, context);
    const weekdays = parseWeekdays(value.weekdays, path, context);
    const leapCycle = parseLeapCycle(value.leapCycle, path, context);
    const eras = parseEras(value.eras, path, context);
    const anchor = parseFixedAnchor(
      value.anchor,
      path,
      { months, weekdays, leapCycle, eras },
      context,
    );
    return id && id !== "gregorian" && title && months.length > 0
      ? {
          id,
          title,
          kind: "fixed",
          months,
          weekdays,
          ...(leapCycle ? { leapCycle } : {}),
          eras,
          ...(anchor ? { anchor } : {}),
        }
      : null;
  }
  if (value.kind === "ordinal") {
    const unitSingular = parseText(
      value.unitSingular,
      `${path}.unitSingular`,
      "unitSingular",
      MAX_TIMELINE_TITLE_CODE_POINTS,
      context,
    );
    const unitPlural = parseText(
      value.unitPlural,
      `${path}.unitPlural`,
      "unitPlural",
      MAX_TIMELINE_TITLE_CODE_POINTS,
      context,
    );
    const anchor = parseOrdinalAnchor(value.anchor, path, context);
    return id && id !== "gregorian" && title && unitSingular && unitPlural
      ? {
          id,
          title,
          kind: "ordinal",
          unitSingular,
          unitPlural,
          ...(anchor ? { anchor } : {}),
        }
      : null;
  }

  context.issues.add(`${path}.kind`, 'kind must be "fixed" or "ordinal".');
  return null;
}

function parseMonths(
  value: unknown,
  parentPath: string,
  context: ParseContext,
): TimelineMonth[] {
  const path = `${parentPath}.months`;
  if (!Array.isArray(value)) {
    context.issues.add(path, "months must be an array.");
    return [];
  }
  if (value.length < 1 || value.length > MAX_TIMELINE_MONTHS) {
    context.issues.add(
      path,
      `months must contain from 1 through ${MAX_TIMELINE_MONTHS} entries.`,
    );
  }
  const months: TimelineMonth[] = [];
  const ids = new Map<string, string>();
  for (let index = 0; index < Math.min(value.length, MAX_TIMELINE_MONTHS); index += 1) {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(value[index])) {
      context.issues.add(itemPath, "A month must be a JSON object.");
      continue;
    }
    const item = value[index] as Record<string, unknown>;
    const id = parseKebab(item.id, `${itemPath}.id`, "month id", context);
    if (id) registerUnique(id, itemPath, ids, `${itemPath}.id`, "month id", context);
    const name = parseText(item.name, `${itemPath}.name`, "name", MAX_TIMELINE_TITLE_CODE_POINTS, context);
    const shortName = parseText(item.shortName, `${itemPath}.shortName`, "shortName", MAX_TIMELINE_TITLE_CODE_POINTS, context);
    const commonDays = parseBoundedInteger(
      item.commonDays,
      `${itemPath}.commonDays`,
      1,
      MAX_TIMELINE_DAYS_PER_MONTH,
      context,
    );
    const leapDays = item.leapDays === undefined
      ? commonDays
      : parseBoundedInteger(
          item.leapDays,
          `${itemPath}.leapDays`,
          1,
          MAX_TIMELINE_DAYS_PER_MONTH,
          context,
        );
    if (id && name && shortName && commonDays !== null && leapDays !== null) {
      months.push({ id, name, shortName, commonDays, leapDays });
    }
  }
  return months;
}

function parseWeekdays(
  value: unknown,
  parentPath: string,
  context: ParseContext,
): TimelineWeekday[] {
  const path = `${parentPath}.weekdays`;
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    context.issues.add(path, "weekdays must be an array when present.");
    return [];
  }
  if (value.length > MAX_TIMELINE_WEEKDAYS) {
    context.issues.add(
      path,
      `weekdays must contain at most ${MAX_TIMELINE_WEEKDAYS} entries.`,
    );
  }
  const weekdays: TimelineWeekday[] = [];
  const ids = new Map<string, string>();
  for (let index = 0; index < Math.min(value.length, MAX_TIMELINE_WEEKDAYS); index += 1) {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(value[index])) {
      context.issues.add(itemPath, "A weekday must be a JSON object.");
      continue;
    }
    const item = value[index] as Record<string, unknown>;
    const id = parseKebab(item.id, `${itemPath}.id`, "weekday id", context);
    if (id) registerUnique(id, itemPath, ids, `${itemPath}.id`, "weekday id", context);
    const name = parseText(item.name, `${itemPath}.name`, "name", MAX_TIMELINE_TITLE_CODE_POINTS, context);
    const shortName = parseText(item.shortName, `${itemPath}.shortName`, "shortName", MAX_TIMELINE_TITLE_CODE_POINTS, context);
    if (id && name && shortName) weekdays.push({ id, name, shortName });
  }
  return weekdays;
}

function parseLeapCycle(
  value: unknown,
  parentPath: string,
  context: ParseContext,
): TimelineLeapCycle | undefined {
  const path = `${parentPath}.leapCycle`;
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    context.issues.add(path, "leapCycle must be a JSON object when present.");
    return undefined;
  }
  const years = parseBoundedInteger(
    value.years,
    `${path}.years`,
    1,
    MAX_TIMELINE_CYCLE_YEARS,
    context,
  );
  const leapYears: number[] = [];
  if (!Array.isArray(value.leapYears)) {
    context.issues.add(`${path}.leapYears`, "leapYears must be an array.");
  } else if (years !== null) {
    if (value.leapYears.length < 1 || value.leapYears.length > years) {
      context.issues.add(
        `${path}.leapYears`,
        `leapYears must contain from 1 through ${years} entries.`,
      );
    }
    const seen = new Set<number>();
    for (let index = 0; index < Math.min(value.leapYears.length, years); index += 1) {
      const remainder = parseBoundedInteger(
        value.leapYears[index],
        `${path}.leapYears[${index}]`,
        0,
        years - 1,
        context,
      );
      if (remainder === null) continue;
      if (seen.has(remainder)) {
        context.issues.add(
          `${path}.leapYears[${index}]`,
          `Duplicate leap-year remainder ${remainder}.`,
        );
        continue;
      }
      seen.add(remainder);
      leapYears.push(remainder);
    }
  }
  return years !== null && leapYears.length > 0 ? { years, leapYears } : undefined;
}

function parseEras(
  value: unknown,
  parentPath: string,
  context: ParseContext,
): TimelineEra[] {
  const path = `${parentPath}.eras`;
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    context.issues.add(path, "eras must be an array when present.");
    return [];
  }
  if (value.length > MAX_TIMELINE_ERAS) {
    context.issues.add(path, `eras must contain at most ${MAX_TIMELINE_ERAS} entries.`);
  }
  const eras: TimelineEra[] = [];
  const ids = new Map<string, string>();
  for (let index = 0; index < Math.min(value.length, MAX_TIMELINE_ERAS); index += 1) {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(value[index])) {
      context.issues.add(itemPath, "An era must be a JSON object.");
      continue;
    }
    const item = value[index] as Record<string, unknown>;
    const id = parseKebab(item.id, `${itemPath}.id`, "era id", context);
    if (id) registerUnique(id, itemPath, ids, `${itemPath}.id`, "era id", context);
    const name = parseText(item.name, `${itemPath}.name`, "name", MAX_TIMELINE_TITLE_CODE_POINTS, context);
    const abbreviation = parseText(
      item.abbreviation,
      `${itemPath}.abbreviation`,
      "abbreviation",
      MAX_TIMELINE_TITLE_CODE_POINTS,
      context,
    );
    const yearOne = parseCanonicalInteger(item.yearOne, `${itemPath}.yearOne`, context);
    const direction = item.direction;
    if (direction !== "forward" && direction !== "backward") {
      context.issues.add(`${itemPath}.direction`, 'direction must be "forward" or "backward".');
    }
    if (id && name && abbreviation && yearOne !== null && (direction === "forward" || direction === "backward")) {
      eras.push({ id, name, abbreviation, yearOne, direction });
    }
  }
  return eras;
}

function parseFixedAnchor(
  value: unknown,
  parentPath: string,
  calendar: Pick<TimelineFixedCalendar, "months" | "weekdays" | "leapCycle" | "eras">,
  context: ParseContext,
): TimelineFixedAnchor | undefined {
  const path = `${parentPath}.anchor`;
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    context.issues.add(path, "anchor must be a JSON object when present.");
    return undefined;
  }
  const expression = parseText(
    value.expression,
    `${path}.expression`,
    "expression",
    MAX_TIMELINE_EXPRESSION_CODE_POINTS,
    context,
  );
  const gregorian = parseText(
    value.gregorian,
    `${path}.gregorian`,
    "gregorian",
    MAX_TIMELINE_EXPRESSION_CODE_POINTS,
    context,
  );
  let validExpression = false;
  if (expression) {
    validExpression = validateFixedAnchorExpression(expression, calendar, `${path}.expression`, context);
  }
  let validGregorian = false;
  if (gregorian) {
    validGregorian = validateGregorianFullDate(gregorian);
    if (!validGregorian) {
      context.issues.add(
        `${path}.gregorian`,
        "gregorian must be a real full date with a four-or-more-digit unsigned year.",
      );
    }
  }
  let weekday: string | undefined;
  if (value.weekday !== undefined) {
    weekday = parseKebab(value.weekday, `${path}.weekday`, "weekday", context) ?? undefined;
    if (weekday && !calendar.weekdays.some(({ id }) => id === weekday)) {
      context.issues.add(`${path}.weekday`, `weekday ${JSON.stringify(weekday)} is not defined by this calendar.`);
    }
  }
  return expression && gregorian && validExpression && validGregorian &&
    (!weekday || calendar.weekdays.some(({ id }) => id === weekday))
    ? { expression, gregorian, ...(weekday ? { weekday } : {}) }
    : undefined;
}

function parseOrdinalAnchor(
  value: unknown,
  parentPath: string,
  context: ParseContext,
): TimelineOrdinalAnchor | undefined {
  const path = `${parentPath}.anchor`;
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    context.issues.add(path, "anchor must be a JSON object when present.");
    return undefined;
  }
  const expression = parseCanonicalInteger(value.expression, `${path}.expression`, context);
  const gregorian = parseText(
    value.gregorian,
    `${path}.gregorian`,
    "gregorian",
    MAX_TIMELINE_EXPRESSION_CODE_POINTS,
    context,
  );
  let validGregorian = false;
  if (gregorian) {
    validGregorian = validateGregorianFullDate(gregorian);
    if (!validGregorian) {
      context.issues.add(
        `${path}.gregorian`,
        "gregorian must be a real full date with a four-or-more-digit unsigned year.",
      );
    }
  }
  return expression !== null && gregorian && validGregorian
    ? { expression, gregorian }
    : undefined;
}

function parseTracks(value: unknown, context: ParseContext): TimelineTrack[] {
  if (!Array.isArray(value)) {
    context.issues.add("$.tracks", "tracks must be an array.");
    return [];
  }
  if (value.length > MAX_TIMELINE_TRACKS) {
    context.issues.add(
      "$.tracks",
      `tracks must contain at most ${MAX_TIMELINE_TRACKS} entries.`,
    );
  }
  const tracks: TimelineTrack[] = [];
  for (let index = 0; index < Math.min(value.length, MAX_TIMELINE_TRACKS); index += 1) {
    const path = `$.tracks[${index}]`;
    if (!isRecord(value[index])) {
      context.issues.add(path, "A track must be a JSON object.");
      continue;
    }
    const track = value[index] as Record<string, unknown>;
    const id = parseUuid(track.id, `${path}.id`, "track id", context);
    if (id) registerUnique(id, path, context.trackIds, `${path}.id`, "track id", context);
    const title = parseText(track.title, `${path}.title`, "title", MAX_TIMELINE_TITLE_CODE_POINTS, context);
    let color: string | undefined;
    if (track.color !== undefined) {
      if (typeof track.color !== "string" || !COLOR_PATTERN.test(track.color)) {
        context.issues.add(`${path}.color`, "color must be a six-digit hexadecimal color such as #8a5cf5.");
      } else {
        color = track.color;
      }
    }
    const noteIds = parseTrackNoteIds(track.noteIds, path, context);
    if (id && title) tracks.push({ id, title, ...(color ? { color } : {}), noteIds });
  }
  return tracks;
}

function parseTrackNoteIds(
  value: unknown,
  parentPath: string,
  context: ParseContext,
): string[] {
  const path = `${parentPath}.noteIds`;
  if (!Array.isArray(value)) {
    context.issues.add(path, "noteIds must be an array.");
    return [];
  }
  const noteIds: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    if (context.memberships >= MAX_TIMELINE_TRACK_MEMBERSHIPS) {
      if (!context.membershipLimitReported) {
        context.issues.add(
          path,
          `The timeline must contain at most ${MAX_TIMELINE_TRACK_MEMBERSHIPS} track memberships.`,
        );
        context.membershipLimitReported = true;
      }
      break;
    }
    context.memberships += 1;
    const noteId = parseUuid(value[index], `${path}[${index}]`, "note id", context);
    if (!noteId) continue;
    if (seen.has(noteId)) {
      context.issues.add(`${path}[${index}]`, `Duplicate note id ${JSON.stringify(noteId)} in this track.`);
      continue;
    }
    seen.add(noteId);
    noteIds.push(noteId);
  }
  return noteIds;
}

function validateFixedAnchorExpression(
  expression: string,
  calendar: Pick<TimelineFixedCalendar, "months" | "leapCycle" | "eras">,
  path: string,
  context: ParseContext,
): boolean {
  const match = FIXED_FULL_DATE_PATTERN.exec(expression);
  if (!match?.groups) {
    context.issues.add(path, "expression must be one full fixed-calendar date.");
    return false;
  }
  const eraId = match.groups.era;
  const writtenYear = match.groups.year!;
  let internalYear: bigint;
  if (eraId) {
    if (!POSITIVE_INTEGER_PATTERN.test(writtenYear)) {
      context.issues.add(path, "An era-qualified anchor year must be a positive integer.");
      return false;
    }
    const era = calendar.eras.find(({ id }) => id === eraId);
    if (!era) {
      context.issues.add(path, `Era ${JSON.stringify(eraId)} is not defined by this calendar.`);
      return false;
    }
    const offset = BigInt(writtenYear) - 1n;
    internalYear = BigInt(era.yearOne) + (era.direction === "forward" ? offset : -offset);
  } else {
    internalYear = BigInt(writtenYear);
  }
  const monthNumber = Number(match.groups.month);
  if (!Number.isSafeInteger(monthNumber) || monthNumber < 1 || monthNumber > calendar.months.length) {
    context.issues.add(path, `Month must be from 1 through ${calendar.months.length}.`);
    return false;
  }
  const month = calendar.months[monthNumber - 1]!;
  const leap = calendar.leapCycle
    ? calendar.leapCycle.leapYears.includes(euclideanRemainder(internalYear, calendar.leapCycle.years))
    : false;
  const maximumDay = leap ? month.leapDays : month.commonDays;
  const day = Number(match.groups.day);
  if (!Number.isSafeInteger(day) || day < 1 || day > maximumDay) {
    context.issues.add(path, `Day must be from 1 through ${maximumDay} for this month and year.`);
    return false;
  }
  return true;
}

function validateGregorianFullDate(value: string): boolean {
  const match = GREGORIAN_FULL_DATE_PATTERN.exec(value);
  if (!match?.groups) return false;
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  if (month < 1 || month > 12) return false;
  const year = BigInt(match.groups.year!);
  const days = [31, isGregorianLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1]!;
}

function isGregorianLeapYear(year: bigint): boolean {
  return year % 400n === 0n || (year % 4n === 0n && year % 100n !== 0n);
}

function euclideanRemainder(value: bigint, divisor: number): number {
  const base = BigInt(divisor);
  const remainder = value % base;
  return Number(remainder < 0n ? remainder + base : remainder);
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

function parseKebab(
  value: unknown,
  path: string,
  label: string,
  context: ParseContext,
): string | null {
  if (
    typeof value !== "string" ||
    !KEBAB_PATTERN.test(value) ||
    [...value].length > MAX_TIMELINE_ID_CODE_POINTS
  ) {
    context.issues.add(
      path,
      `${label} must use at most ${MAX_TIMELINE_ID_CODE_POINTS} lowercase kebab-case characters.`,
    );
    return null;
  }
  return value;
}

function parseText(
  value: unknown,
  path: string,
  label: string,
  maximum: number,
  context: ParseContext,
): string | null {
  if (typeof value !== "string") {
    context.issues.add(path, `${label} must be text.`);
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    context.issues.add(path, `${label} must not be empty.`);
    return null;
  }
  if (CONTROL_CHARACTER_PATTERN.test(trimmed)) {
    context.issues.add(path, `${label} must not contain control characters.`);
    return null;
  }
  if ([...trimmed].length > maximum) {
    context.issues.add(path, `${label} must contain at most ${maximum} Unicode characters.`);
    return null;
  }
  return trimmed;
}

function parseCanonicalInteger(
  value: unknown,
  path: string,
  context: ParseContext,
): string | null {
  if (
    typeof value !== "string" ||
    !INTEGER_PATTERN.test(value) ||
    [...value].length > MAX_TIMELINE_EXPRESSION_CODE_POINTS
  ) {
    context.issues.add(
      path,
      `must be a canonical signed integer string of at most ${MAX_TIMELINE_EXPRESSION_CODE_POINTS} characters.`,
    );
    return null;
  }
  return value;
}

function parseBoundedInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  context: ParseContext,
): number | null {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    context.issues.add(path, `must be a whole number from ${minimum} through ${maximum}.`);
    return null;
  }
  return value as number;
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

function serializeCalendar(calendar: TimelineCalendar): Record<string, unknown> {
  if (calendar.kind === "ordinal") {
    return {
      id: calendar.id,
      title: calendar.title,
      kind: calendar.kind,
      unitSingular: calendar.unitSingular,
      unitPlural: calendar.unitPlural,
      ...(calendar.anchor ? { anchor: { ...calendar.anchor } } : {}),
    };
  }
  return {
    id: calendar.id,
    title: calendar.title,
    kind: calendar.kind,
    months: calendar.months.map((month) => ({ ...month })),
    ...(calendar.weekdays.length > 0
      ? { weekdays: calendar.weekdays.map((weekday) => ({ ...weekday })) }
      : {}),
    ...(calendar.leapCycle
      ? {
          leapCycle: {
            years: calendar.leapCycle.years,
            leapYears: [...calendar.leapCycle.leapYears],
          },
        }
      : {}),
    ...(calendar.eras.length > 0 ? { eras: calendar.eras.map((era) => ({ ...era })) } : {}),
    ...(calendar.anchor ? { anchor: { ...calendar.anchor } } : {}),
  };
}

function serializeTrack(track: TimelineTrack): Record<string, unknown> {
  return {
    id: track.id,
    title: track.title,
    ...(track.color ? { color: track.color } : {}),
    noteIds: [...track.noteIds],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
