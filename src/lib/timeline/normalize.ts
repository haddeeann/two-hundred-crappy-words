import {
  MAX_TIMELINE_EXPRESSION_CODE_POINTS,
  type TimelineCalendar,
  type TimelineFixedCalendar,
  type TimelineOrdinalCalendar,
} from "./format";

export type TimelinePrecision = "year" | "month" | "day" | "ordinal";
export type TimelineClaimCertainty = "exact" | "approximate" | "uncertain" | null;
export type TimelineRangeRelation =
  | "before"
  | "after"
  | "adjacent"
  | "overlaps"
  | "same-range"
  | "indeterminate";

export interface TimelineRange {
  calendarId: string;
  expression: string;
  axis: "gregorian" | `calendar:${string}`;
  earliest: bigint;
  latest: bigint;
  startPrecision: TimelinePrecision;
  endPrecision: TimelinePrecision;
  interval: boolean;
  anchored: boolean;
}

export type TimelineNormalizationResult =
  | { kind: "computable"; range: TimelineRange }
  | {
      kind: "non-computable";
      code:
        | "unknown-calendar"
        | "invalid-expression"
        | "invalid-date"
        | "reversed-interval";
      reason: string;
    };

export type TimelineRangeComparison =
  | { kind: "comparable"; order: -1 | 0 | 1 }
  | { kind: "indeterminate"; reason: string };

export interface TimelineRelationResult {
  relation: TimelineRangeRelation;
  reason: string;
}

export type TimelineCalendarYearAgeResult =
  | {
      kind: "years";
      minimum: bigint;
      maximum: bigint;
      birthRange: TimelineRange;
    }
  | {
      kind: "pre-birth";
      reason: string;
      birthRange: TimelineRange;
    }
  | {
      kind: "indeterminate";
      reason: string;
      birthRange: TimelineRange | null;
    };

interface EndpointRange {
  earliest: bigint;
  latest: bigint;
  precision: TimelinePrecision;
}

interface ParsedFixedEndpoint {
  year: bigint;
  month: number | null;
  day: number | null;
  precision: Exclude<TimelinePrecision, "ordinal">;
}

interface ExactCalendarDate {
  calendarId: string;
  year: bigint;
  month: number;
  day: number;
}

const GREGORIAN_ENDPOINT_PATTERN = /^(?<year>[0-9]{4,})(?:-(?<month>[0-9]{2})(?:-(?<day>[0-9]{2}))?)?$/u;
const FIXED_ENDPOINT_PATTERN = /^(?:(?<era>[a-z0-9]+(?:-[a-z0-9]+)*):)?(?<year>-?(?:0|[1-9][0-9]*))(?:-(?<month>0*[1-9][0-9]*)(?:-(?<day>0*[1-9][0-9]*))?)?$/u;
const ORDINAL_PATTERN = /^(?:0|-?[1-9][0-9]*)$/u;

export function normalizeTimelineExpression(
  calendarId: string,
  expression: string,
  calendars: readonly TimelineCalendar[],
): TimelineNormalizationResult {
  if ([...expression].length > MAX_TIMELINE_EXPRESSION_CODE_POINTS) {
    return invalidExpression(expression);
  }
  if (calendarId === "gregorian") {
    return normalizeExpression(
      calendarId,
      expression,
      "gregorian",
      true,
      parseGregorianEndpoint,
    );
  }
  const calendar = calendars.find(({ id }) => id === calendarId);
  if (!calendar) {
    return {
      kind: "non-computable",
      code: "unknown-calendar",
      reason: `Calendar ${JSON.stringify(calendarId)} is not defined by this project.`,
    };
  }
  return calendar.kind === "fixed"
    ? normalizeFixedExpression(calendar, expression)
    : normalizeOrdinalExpression(calendar, expression);
}

export function compareTimelineRanges(
  first: TimelineRange,
  second: TimelineRange,
): TimelineRangeComparison {
  if (first.axis !== second.axis) {
    return {
      kind: "indeterminate",
      reason: "These values do not share a computable calendar axis.",
    };
  }
  const earliest = compareBigInts(first.earliest, second.earliest);
  if (earliest !== 0) return { kind: "comparable", order: earliest };
  return { kind: "comparable", order: compareBigInts(first.latest, second.latest) };
}

export function relateTimelineRanges(
  first: TimelineRange,
  second: TimelineRange,
  firstCertainty: TimelineClaimCertainty,
  secondCertainty: TimelineClaimCertainty,
): TimelineRelationResult {
  if (firstCertainty !== "exact" || secondCertainty !== "exact") {
    return {
      relation: "indeterminate",
      reason: "A hard temporal relationship requires both source facts to be explicitly exact.",
    };
  }
  if (first.axis !== second.axis) {
    return {
      relation: "indeterminate",
      reason: "These values do not share a computable calendar axis.",
    };
  }
  if (first.earliest === second.earliest && first.latest === second.latest) {
    return { relation: "same-range", reason: "Both values normalize to the same inclusive range." };
  }
  if (first.latest + 1n === second.earliest || second.latest + 1n === first.earliest) {
    return { relation: "adjacent", reason: "The inclusive ranges are one calendar day apart." };
  }
  if (first.latest < second.earliest) {
    return { relation: "before", reason: "The first range ends before the second range begins." };
  }
  if (first.earliest > second.latest) {
    return { relation: "after", reason: "The first range begins after the second range ends." };
  }
  return { relation: "overlaps", reason: "The inclusive ranges share at least one calendar day." };
}

/**
 * Calculates completed years on the calendar in which the birth was written.
 * Reduced-precision inputs use their inclusive boundary dates. An anniversary
 * day that is absent from a shorter year clamps to the last day of that month.
 */
export function calculateCalendarYearAge(
  birthCalendarId: string,
  birthExpression: string,
  occurrence: TimelineRange,
  calendars: readonly TimelineCalendar[],
): TimelineCalendarYearAgeResult {
  const normalized = normalizeTimelineExpression(
    birthCalendarId,
    birthExpression,
    calendars,
  );
  if (normalized.kind !== "computable") {
    return { kind: "indeterminate", reason: normalized.reason, birthRange: null };
  }
  const birthRange = normalized.range;
  if (birthRange.axis !== occurrence.axis) {
    return {
      kind: "indeterminate",
      reason: "The birth and occurrence do not share a computable calendar axis.",
      birthRange,
    };
  }
  const boundaries = calendarDateBoundaries(
    birthCalendarId,
    birthExpression,
    calendars,
  );
  if (!boundaries) {
    return {
      kind: "indeterminate",
      reason: "This birth calendar does not define calendar years and anniversaries.",
      birthRange,
    };
  }
  if (occurrence.latest < birthRange.earliest) {
    return {
      kind: "pre-birth",
      reason: "The complete occurrence is before every possible birth date.",
      birthRange,
    };
  }
  if (occurrence.earliest < birthRange.latest) {
    return {
      kind: "indeterminate",
      reason: "The possible occurrence and birth ranges overlap, so a non-negative age is not guaranteed.",
      birthRange,
    };
  }
  return {
    kind: "years",
    minimum: completedCalendarYears(
      boundaries.latest,
      occurrence.earliest,
      calendars,
    ),
    maximum: completedCalendarYears(
      boundaries.earliest,
      occurrence.latest,
      calendars,
    ),
    birthRange,
  };
}

function normalizeFixedExpression(
  calendar: TimelineFixedCalendar,
  expression: string,
): TimelineNormalizationResult {
  const anchor = calendar.anchor;
  let anchorOffset = 0n;
  if (anchor) {
    const customAnchor = parseFixedEndpoint(anchor.expression, calendar);
    const gregorianAnchor = parseGregorianEndpoint(anchor.gregorian);
    if (!customAnchor.ok || !gregorianAnchor.ok) {
      return {
        kind: "non-computable",
        code: "invalid-date",
        reason: "The validated calendar anchor is not computable.",
      };
    }
    anchorOffset = gregorianAnchor.range.earliest - customAnchor.range.earliest;
  }
  const result = normalizeExpression(
    calendar.id,
    expression,
    anchor ? "gregorian" : `calendar:${calendar.id}`,
    Boolean(anchor),
    (endpoint) => parseFixedEndpoint(endpoint, calendar),
  );
  if (result.kind !== "computable" || !anchor) return result;
  return {
    kind: "computable",
    range: {
      ...result.range,
      earliest: result.range.earliest + anchorOffset,
      latest: result.range.latest + anchorOffset,
    },
  };
}

function normalizeOrdinalExpression(
  calendar: TimelineOrdinalCalendar,
  expression: string,
): TimelineNormalizationResult {
  const anchor = calendar.anchor;
  const anchorOffset = anchor
    ? gregorianDayOrdinal(anchor.gregorian) - BigInt(anchor.expression)
    : 0n;
  const result = normalizeExpression(
    calendar.id,
    expression,
    anchor ? "gregorian" : `calendar:${calendar.id}`,
    Boolean(anchor),
    parseOrdinalEndpoint,
  );
  if (result.kind !== "computable" || !anchor) return result;
  return {
    kind: "computable",
    range: {
      ...result.range,
      earliest: result.range.earliest + anchorOffset,
      latest: result.range.latest + anchorOffset,
    },
  };
}

function calendarDateBoundaries(
  calendarId: string,
  expression: string,
  calendars: readonly TimelineCalendar[],
): { earliest: ExactCalendarDate; latest: ExactCalendarDate } | null {
  const parts = expression.split("/");
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  if (calendarId === "gregorian") {
    return {
      earliest: gregorianDateBoundary(first, "earliest"),
      latest: gregorianDateBoundary(last, "latest"),
    };
  }
  const calendar = calendars.find(({ id }) => id === calendarId);
  if (!calendar || calendar.kind === "ordinal") return null;
  return {
    earliest: fixedDateBoundary(first, calendar, "earliest"),
    latest: fixedDateBoundary(last, calendar, "latest"),
  };
}

function gregorianDateBoundary(
  value: string,
  edge: "earliest" | "latest",
): ExactCalendarDate {
  const match = GREGORIAN_ENDPOINT_PATTERN.exec(value)!;
  const year = BigInt(match.groups!.year!);
  const month = match.groups!.month
    ? Number(match.groups!.month)
    : edge === "earliest" ? 1 : 12;
  const day = match.groups!.day
    ? Number(match.groups!.day)
    : edge === "earliest" ? 1 : gregorianMonthDays(year, month);
  return { calendarId: "gregorian", year, month, day };
}

function fixedDateBoundary(
  value: string,
  calendar: TimelineFixedCalendar,
  edge: "earliest" | "latest",
): ExactCalendarDate {
  const parsed = parseFixedDate(value, calendar);
  if (!parsed.ok) throw new RangeError("A normalized fixed date must remain parseable.");
  const month = parsed.date.month ?? (edge === "earliest" ? 1 : calendar.months.length);
  const day = parsed.date.day ?? (
    edge === "earliest" ? 1 : fixedMonthDays(calendar, parsed.date.year, month)
  );
  return {
    calendarId: calendar.id,
    year: parsed.date.year,
    month,
    day,
  };
}

function completedCalendarYears(
  birth: ExactCalendarDate,
  occurrenceCoordinate: bigint,
  calendars: readonly TimelineCalendar[],
): bigint {
  let lower = 0n;
  let upper = 1n;
  while (anniversaryCoordinate(birth, upper, calendars) <= occurrenceCoordinate) {
    lower = upper;
    upper *= 2n;
  }
  while (lower + 1n < upper) {
    const middle = lower + (upper - lower) / 2n;
    if (anniversaryCoordinate(birth, middle, calendars) <= occurrenceCoordinate) {
      lower = middle;
    } else {
      upper = middle;
    }
  }
  return lower;
}

function anniversaryCoordinate(
  birth: ExactCalendarDate,
  years: bigint,
  calendars: readonly TimelineCalendar[],
): bigint {
  const year = birth.year + years;
  if (birth.calendarId === "gregorian") {
    const day = Math.min(birth.day, gregorianMonthDays(year, birth.month));
    return gregorianOrdinal(year, birth.month, day);
  }
  const calendar = calendars.find(
    (candidate): candidate is TimelineFixedCalendar =>
      candidate.id === birth.calendarId && candidate.kind === "fixed",
  );
  if (!calendar) throw new RangeError("The birth calendar is no longer available.");
  const day = Math.min(birth.day, fixedMonthDays(calendar, year, birth.month));
  let coordinate = fixedOrdinal(calendar, year, birth.month, day);
  if (calendar.anchor) {
    const customAnchor = parseFixedEndpoint(calendar.anchor.expression, calendar);
    const gregorianAnchor = parseGregorianEndpoint(calendar.anchor.gregorian);
    if (!customAnchor.ok || !gregorianAnchor.ok) {
      throw new RangeError("A validated fixed-calendar anchor must remain computable.");
    }
    coordinate += gregorianAnchor.range.earliest - customAnchor.range.earliest;
  }
  return coordinate;
}

function normalizeExpression(
  calendarId: string,
  expression: string,
  axis: TimelineRange["axis"],
  anchored: boolean,
  parseEndpoint: (value: string) => EndpointParseResult,
): TimelineNormalizationResult {
  const parts = expression.split("/");
  if (parts.length > 2 || parts.some((part) => !part)) {
    return invalidExpression(expression);
  }
  const start = parseEndpoint(parts[0]!);
  if (!start.ok) return start.result;
  const end = parts.length === 2 ? parseEndpoint(parts[1]!) : start;
  if (!end.ok) return end.result;
  if (start.range.earliest > end.range.latest) {
    return {
      kind: "non-computable",
      code: "reversed-interval",
      reason: `The interval ${JSON.stringify(expression)} ends before it begins.`,
    };
  }
  return {
    kind: "computable",
    range: {
      calendarId,
      expression,
      axis,
      earliest: start.range.earliest,
      latest: end.range.latest,
      startPrecision: start.range.precision,
      endPrecision: end.range.precision,
      interval: parts.length === 2,
      anchored,
    },
  };
}

type EndpointParseResult =
  | { ok: true; range: EndpointRange }
  | { ok: false; result: TimelineNormalizationResult };

function parseGregorianEndpoint(value: string): EndpointParseResult {
  const match = GREGORIAN_ENDPOINT_PATTERN.exec(value);
  if (!match?.groups) return { ok: false, result: invalidExpression(value) };
  const year = BigInt(match.groups.year!);
  const month = match.groups.month ? Number(match.groups.month) : null;
  const day = match.groups.day ? Number(match.groups.day) : null;
  if (month === null) {
    return {
      ok: true,
      range: {
        earliest: gregorianOrdinal(year, 1, 1),
        latest: gregorianOrdinal(year + 1n, 1, 1) - 1n,
        precision: "year",
      },
    };
  }
  if (month < 1 || month > 12) {
    return { ok: false, result: invalidDate(value, "Month must be from 01 through 12.") };
  }
  if (day === null) {
    const nextYear = month === 12 ? year + 1n : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return {
      ok: true,
      range: {
        earliest: gregorianOrdinal(year, month, 1),
        latest: gregorianOrdinal(nextYear, nextMonth, 1) - 1n,
        precision: "month",
      },
    };
  }
  const maximumDay = gregorianMonthDays(year, month);
  if (day < 1 || day > maximumDay) {
    return {
      ok: false,
      result: invalidDate(value, `Day must be from 01 through ${String(maximumDay).padStart(2, "0")} for this month and year.`),
    };
  }
  const ordinal = gregorianOrdinal(year, month, day);
  return {
    ok: true,
    range: { earliest: ordinal, latest: ordinal, precision: "day" },
  };
}

function parseFixedEndpoint(
  value: string,
  calendar: TimelineFixedCalendar,
): EndpointParseResult {
  const parsed = parseFixedDate(value, calendar);
  if (!parsed.ok) return parsed;
  const { year, month, day, precision } = parsed.date;
  if (month === null) {
    return {
      ok: true,
      range: {
        earliest: fixedOrdinal(calendar, year, 1, 1),
        latest: fixedOrdinal(calendar, year + 1n, 1, 1) - 1n,
        precision,
      },
    };
  }
  if (day === null) {
    const nextYear = month === calendar.months.length ? year + 1n : year;
    const nextMonth = month === calendar.months.length ? 1 : month + 1;
    return {
      ok: true,
      range: {
        earliest: fixedOrdinal(calendar, year, month, 1),
        latest: fixedOrdinal(calendar, nextYear, nextMonth, 1) - 1n,
        precision,
      },
    };
  }
  const ordinal = fixedOrdinal(calendar, year, month, day);
  return {
    ok: true,
    range: { earliest: ordinal, latest: ordinal, precision },
  };
}

function parseFixedDate(
  value: string,
  calendar: TimelineFixedCalendar,
):
  | { ok: true; date: ParsedFixedEndpoint }
  | { ok: false; result: TimelineNormalizationResult } {
  const match = FIXED_ENDPOINT_PATTERN.exec(value);
  if (!match?.groups) return { ok: false, result: invalidExpression(value) };
  const writtenYear = match.groups.year!;
  let year: bigint;
  if (match.groups.era) {
    if (!/^[1-9][0-9]*$/u.test(writtenYear)) {
      return {
        ok: false,
        result: invalidDate(value, "An era-qualified year must be a positive integer."),
      };
    }
    const era = calendar.eras.find(({ id }) => id === match.groups!.era);
    if (!era) {
      return {
        ok: false,
        result: invalidDate(value, `Era ${JSON.stringify(match.groups.era)} is not defined by this calendar.`),
      };
    }
    const offset = BigInt(writtenYear) - 1n;
    year = BigInt(era.yearOne) + (era.direction === "forward" ? offset : -offset);
  } else {
    year = BigInt(writtenYear);
  }
  const month = match.groups.month ? Number(match.groups.month) : null;
  const day = match.groups.day ? Number(match.groups.day) : null;
  const precision: ParsedFixedEndpoint["precision"] =
    day !== null ? "day" : month !== null ? "month" : "year";
  if (month !== null &&
      (!Number.isSafeInteger(month) || month < 1 || month > calendar.months.length)) {
    return {
      ok: false,
      result: invalidDate(value, `Month must be from 1 through ${calendar.months.length}.`),
    };
  }
  if (day !== null && month !== null) {
    const maximumDay = fixedMonthDays(calendar, year, month);
    if (!Number.isSafeInteger(day) || day < 1 || day > maximumDay) {
      return {
        ok: false,
        result: invalidDate(value, `Day must be from 1 through ${maximumDay} for this month and year.`),
      };
    }
  }
  return { ok: true, date: { year, month, day, precision } };
}

function parseOrdinalEndpoint(value: string): EndpointParseResult {
  if (!ORDINAL_PATTERN.test(value)) {
    return { ok: false, result: invalidExpression(value) };
  }
  const coordinate = BigInt(value);
  return {
    ok: true,
    range: { earliest: coordinate, latest: coordinate, precision: "ordinal" },
  };
}

function gregorianDayOrdinal(value: string): bigint {
  const parsed = parseGregorianEndpoint(value);
  if (!parsed.ok || parsed.range.precision !== "day") {
    throw new RangeError("A validated Gregorian anchor must be a full date.");
  }
  return parsed.range.earliest;
}

function gregorianOrdinal(year: bigint, month: number, day: number): bigint {
  let result = daysBeforeGregorianYear(year);
  for (let current = 1; current < month; current += 1) {
    result += BigInt(gregorianMonthDays(year, current));
  }
  return result + BigInt(day - 1);
}

function daysBeforeGregorianYear(year: bigint): bigint {
  const cycle = floorDiv(year, 400n);
  const remainder = Number(year - cycle * 400n);
  const leapYears = remainder === 0
    ? 0
    : Math.floor((remainder - 1) / 4) - Math.floor((remainder - 1) / 100) + 1;
  return cycle * 146_097n + BigInt(365 * remainder + leapYears);
}

function gregorianMonthDays(year: bigint, month: number): number {
  if (month === 2) return isGregorianLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isGregorianLeapYear(year: bigint): boolean {
  return year % 400n === 0n || (year % 4n === 0n && year % 100n !== 0n);
}

function fixedOrdinal(
  calendar: TimelineFixedCalendar,
  year: bigint,
  month: number,
  day: number,
): bigint {
  let result = daysBeforeFixedYear(calendar, year);
  for (let current = 1; current < month; current += 1) {
    result += BigInt(fixedMonthDays(calendar, year, current));
  }
  return result + BigInt(day - 1);
}

function daysBeforeFixedYear(calendar: TimelineFixedCalendar, year: bigint): bigint {
  if (!calendar.leapCycle) {
    return year * BigInt(commonFixedYearDays(calendar));
  }
  const cycleYears = BigInt(calendar.leapCycle.years);
  const cycle = floorDiv(year, cycleYears);
  const remainder = Number(year - cycle * cycleYears);
  let result = cycle * fixedCycleDays(calendar);
  for (let current = 0; current < remainder; current += 1) {
    result += BigInt(fixedYearDays(calendar, BigInt(current)));
  }
  return result;
}

function fixedCycleDays(calendar: TimelineFixedCalendar): bigint {
  let result = 0n;
  for (let year = 0; year < calendar.leapCycle!.years; year += 1) {
    result += BigInt(fixedYearDays(calendar, BigInt(year)));
  }
  return result;
}

function commonFixedYearDays(calendar: TimelineFixedCalendar): number {
  return calendar.months.reduce((sum, { commonDays }) => sum + commonDays, 0);
}

function fixedYearDays(calendar: TimelineFixedCalendar, year: bigint): number {
  const leap = isFixedLeapYear(calendar, year);
  return calendar.months.reduce(
    (sum, month) => sum + (leap ? month.leapDays : month.commonDays),
    0,
  );
}

function fixedMonthDays(
  calendar: TimelineFixedCalendar,
  year: bigint,
  month: number,
): number {
  const definition = calendar.months[month - 1]!;
  return isFixedLeapYear(calendar, year)
    ? definition.leapDays
    : definition.commonDays;
}

function isFixedLeapYear(calendar: TimelineFixedCalendar, year: bigint): boolean {
  if (!calendar.leapCycle) return false;
  const remainder = Number(floorMod(year, BigInt(calendar.leapCycle.years)));
  return calendar.leapCycle.leapYears.includes(remainder);
}

function floorDiv(value: bigint, divisor: bigint): bigint {
  const quotient = value / divisor;
  const remainder = value % divisor;
  return remainder < 0n ? quotient - 1n : quotient;
}

function floorMod(value: bigint, divisor: bigint): bigint {
  const remainder = value % divisor;
  return remainder < 0n ? remainder + divisor : remainder;
}

function compareBigInts(first: bigint, second: bigint): -1 | 0 | 1 {
  return first < second ? -1 : first > second ? 1 : 0;
}

function invalidExpression(expression: string): TimelineNormalizationResult {
  return {
    kind: "non-computable",
    code: "invalid-expression",
    reason: `Expression ${JSON.stringify(expression)} does not use the approved calendar syntax.`,
  };
}

function invalidDate(expression: string, detail: string): TimelineNormalizationResult {
  return {
    kind: "non-computable",
    code: "invalid-date",
    reason: `${JSON.stringify(expression)} is not a valid calendar date. ${detail}`,
  };
}
