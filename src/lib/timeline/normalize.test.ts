import { describe, expect, it } from "vitest";

import type {
  TimelineFixedCalendar,
  TimelineOrdinalCalendar,
} from "./format";
import {
  calculateCalendarYearAge,
  compareTimelineRanges,
  normalizeTimelineExpression,
  relateTimelineRanges,
  type TimelineRange,
} from "./normalize";

function fixedCalendar(
  overrides: Partial<TimelineFixedCalendar> = {},
): TimelineFixedCalendar {
  return {
    id: "red-reckoning",
    title: "Red Reckoning",
    kind: "fixed",
    months: [
      { id: "dawn", name: "Dawn", shortName: "Dwn", commonDays: 30, leapDays: 31 },
      { id: "ember", name: "Ember", shortName: "Emb", commonDays: 30, leapDays: 30 },
    ],
    weekdays: [],
    leapCycle: { years: 4, leapYears: [0] },
    eras: [
      { id: "af", name: "After Fall", abbreviation: "AF", yearOne: "0", direction: "forward" },
      { id: "bf", name: "Before Fall", abbreviation: "BF", yearOne: "-1", direction: "backward" },
    ],
    ...overrides,
  };
}

function ordinalCalendar(
  overrides: Partial<TimelineOrdinalCalendar> = {},
): TimelineOrdinalCalendar {
  return {
    id: "mission-day",
    title: "Mission Day",
    kind: "ordinal",
    unitSingular: "Day",
    unitPlural: "Days",
    ...overrides,
  };
}

function range(
  earliest: bigint,
  latest: bigint,
  axis: TimelineRange["axis"] = "gregorian",
): TimelineRange {
  return {
    calendarId: axis === "gregorian" ? "gregorian" : axis.slice("calendar:".length),
    expression: `${earliest}/${latest}`,
    axis,
    earliest,
    latest,
    startPrecision: "day",
    endPrecision: "day",
    interval: earliest !== latest,
    anchored: axis === "gregorian",
  };
}

describe("timeline expression normalization", () => {
  it("preserves Gregorian year, month, and day precision as inclusive ranges", () => {
    const year = normalizeTimelineExpression("gregorian", "2160", []);
    const month = normalizeTimelineExpression("gregorian", "2160-02", []);
    const leapDay = normalizeTimelineExpression("gregorian", "2160-02-29", []);

    expect(year).toMatchObject({
      kind: "computable",
      range: { startPrecision: "year", endPrecision: "year", interval: false },
    });
    expect(month).toMatchObject({
      kind: "computable",
      range: { startPrecision: "month", endPrecision: "month" },
    });
    expect(leapDay).toMatchObject({
      kind: "computable",
      range: { startPrecision: "day", endPrecision: "day" },
    });
    if (year.kind !== "computable" || month.kind !== "computable" || leapDay.kind !== "computable") return;
    expect(year.range.latest - year.range.earliest + 1n).toBe(366n);
    expect(month.range.latest - month.range.earliest + 1n).toBe(29n);
    expect(leapDay.range.earliest).toBe(month.range.latest);
  });

  it("handles Gregorian century rules, mixed-precision intervals, and real dates", () => {
    expect(normalizeTimelineExpression("gregorian", "2100-02-29", [])).toMatchObject({
      kind: "non-computable",
      code: "invalid-date",
    });
    expect(normalizeTimelineExpression("gregorian", "2000-02-29", [])).toMatchObject({
      kind: "computable",
    });
    const interval = normalizeTimelineExpression(
      "gregorian",
      "2160-02-20/2161",
      [],
    );
    expect(interval).toMatchObject({
      kind: "computable",
      range: {
        interval: true,
        startPrecision: "day",
        endPrecision: "year",
      },
    });
    if (interval.kind !== "computable") return;
    const endYear = normalizeTimelineExpression("gregorian", "2161", []);
    expect(endYear.kind).toBe("computable");
    if (endYear.kind === "computable") {
      expect(interval.range.latest).toBe(endYear.range.latest);
    }
  });

  it("uses bigint arithmetic beyond JavaScript Date and safe-integer ranges", () => {
    const first = normalizeTimelineExpression(
      "gregorian",
      "123456789012345678901234567890-01-01",
      [],
    );
    const next = normalizeTimelineExpression(
      "gregorian",
      "123456789012345678901234567890-01-02",
      [],
    );
    expect(first.kind).toBe("computable");
    expect(next.kind).toBe("computable");
    if (first.kind !== "computable" || next.kind !== "computable") return;
    expect(next.range.earliest - first.range.earliest).toBe(1n);
    expect(first.range.earliest > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("rejects malformed, open, and reversed Gregorian intervals", () => {
    expect(normalizeTimelineExpression("gregorian", "2160/", [])).toMatchObject({
      kind: "non-computable",
      code: "invalid-expression",
    });
    expect(normalizeTimelineExpression("gregorian", "2161/2160", [])).toMatchObject({
      kind: "non-computable",
      code: "reversed-interval",
    });
    expect(normalizeTimelineExpression("gregorian", "2160-2", [])).toMatchObject({
      kind: "non-computable",
      code: "invalid-expression",
    });
    expect(
      normalizeTimelineExpression("gregorian", "1".repeat(121), []),
    ).toMatchObject({
      kind: "non-computable",
      code: "invalid-expression",
    });
  });

  it("normalizes fixed calendars through reduced precision, eras, and leap cycles", () => {
    const calendar = fixedCalendar();
    const leapYear = normalizeTimelineExpression(calendar.id, "af:1", [calendar]);
    const commonYear = normalizeTimelineExpression(calendar.id, "af:2", [calendar]);
    const leapDay = normalizeTimelineExpression(calendar.id, "af:1-01-31", [calendar]);
    const beforeEra = normalizeTimelineExpression(calendar.id, "bf:1-02-30", [calendar]);

    expect(leapYear.kind).toBe("computable");
    expect(commonYear.kind).toBe("computable");
    expect(leapDay.kind).toBe("computable");
    expect(beforeEra.kind).toBe("computable");
    if (leapYear.kind !== "computable" || commonYear.kind !== "computable") return;
    expect(leapYear.range.latest - leapYear.range.earliest + 1n).toBe(61n);
    expect(commonYear.range.latest - commonYear.range.earliest + 1n).toBe(60n);
    expect(leapYear.range.axis).toBe("calendar:red-reckoning");
  });

  it("validates fixed expressions against definitions without guessing", () => {
    const calendar = fixedCalendar();
    expect(normalizeTimelineExpression(calendar.id, "missing:1-01-01", [calendar])).toMatchObject({
      kind: "non-computable",
      code: "invalid-date",
    });
    expect(normalizeTimelineExpression(calendar.id, "af:2-01-31", [calendar])).toMatchObject({
      kind: "non-computable",
      code: "invalid-date",
    });
    expect(normalizeTimelineExpression(calendar.id, "af:1-03", [calendar])).toMatchObject({
      kind: "non-computable",
      code: "invalid-date",
    });
    expect(normalizeTimelineExpression(calendar.id, "af:0", [calendar])).toMatchObject({
      kind: "non-computable",
      code: "invalid-date",
    });
  });

  it("maps anchored fixed dates onto the shared Gregorian day axis", () => {
    const calendar = fixedCalendar({
      anchor: {
        expression: "af:1-01-01",
        gregorian: "2160-01-01",
      },
    });
    const anchor = normalizeTimelineExpression(calendar.id, "af:1-01-01", [calendar]);
    const next = normalizeTimelineExpression(calendar.id, "af:1-01-02", [calendar]);
    const gregorian = normalizeTimelineExpression("gregorian", "2160-01-01", [calendar]);

    expect(anchor.kind).toBe("computable");
    expect(next.kind).toBe("computable");
    expect(gregorian.kind).toBe("computable");
    if (anchor.kind !== "computable" || next.kind !== "computable" || gregorian.kind !== "computable") return;
    expect(anchor.range).toMatchObject({ axis: "gregorian", anchored: true });
    expect(anchor.range.earliest).toBe(gregorian.range.earliest);
    expect(next.range.earliest).toBe(gregorian.range.earliest + 1n);
  });

  it("normalizes ordinal points and intervals with optional anchors", () => {
    const unanchored = ordinalCalendar();
    const span = normalizeTimelineExpression(unanchored.id, "-2/4", [unanchored]);
    expect(span).toMatchObject({
      kind: "computable",
      range: {
        axis: "calendar:mission-day",
        earliest: -2n,
        latest: 4n,
        startPrecision: "ordinal",
      },
    });

    const anchored = ordinalCalendar({
      anchor: { expression: "0", gregorian: "2160-01-01" },
    });
    const dayOne = normalizeTimelineExpression(anchored.id, "1", [anchored]);
    const gregorianNext = normalizeTimelineExpression("gregorian", "2160-01-02", []);
    expect(dayOne.kind).toBe("computable");
    expect(gregorianNext.kind).toBe("computable");
    if (dayOne.kind === "computable" && gregorianNext.kind === "computable") {
      expect(dayOne.range.earliest).toBe(gregorianNext.range.earliest);
      expect(dayOne.range.axis).toBe("gregorian");
    }
    expect(normalizeTimelineExpression(anchored.id, "01", [anchored])).toMatchObject({
      kind: "non-computable",
      code: "invalid-expression",
    });
  });

  it("keeps unknown calendars explicitly non-computable", () => {
    expect(normalizeTimelineExpression("lost-calendar", "41", [])).toEqual({
      kind: "non-computable",
      code: "unknown-calendar",
      reason: 'Calendar "lost-calendar" is not defined by this project.',
    });
  });
});

describe("completed calendar-year ages", () => {
  it("clamps a Gregorian leap-day anniversary to the final valid February day", () => {
    const before = normalizeTimelineExpression("gregorian", "2101-02-27", []);
    const clamped = normalizeTimelineExpression("gregorian", "2101-02-28", []);
    expect(before.kind).toBe("computable");
    expect(clamped.kind).toBe("computable");
    if (before.kind !== "computable" || clamped.kind !== "computable") return;

    expect(calculateCalendarYearAge("gregorian", "2100-02-29", before.range, []))
      .toMatchObject({ kind: "indeterminate" });
    expect(calculateCalendarYearAge("gregorian", "2096-02-29", before.range, []))
      .toMatchObject({ kind: "years", minimum: 4n, maximum: 4n });
    expect(calculateCalendarYearAge("gregorian", "2096-02-29", clamped.range, []))
      .toMatchObject({ kind: "years", minimum: 5n, maximum: 5n });
  });

  it("returns honest bounds for reduced-precision births and occurrences", () => {
    const occurrence = normalizeTimelineExpression("gregorian", "2160", []);
    expect(occurrence.kind).toBe("computable");
    if (occurrence.kind !== "computable") return;

    expect(calculateCalendarYearAge("gregorian", "2130-06", occurrence.range, []))
      .toMatchObject({ kind: "years", minimum: 29n, maximum: 30n });
  });

  it("uses a fixed birth calendar across an anchored occurrence axis", () => {
    const calendar = fixedCalendar({
      anchor: { expression: "af:1-01-01", gregorian: "2160-01-01" },
    });
    const occurrence = normalizeTimelineExpression(calendar.id, "af:6-01-30", [calendar]);
    const anniversary = normalizeTimelineExpression(calendar.id, "af:6-01-31", [calendar]);
    expect(occurrence.kind).toBe("computable");
    expect(anniversary.kind).toBe("non-computable");
    if (occurrence.kind !== "computable") return;

    expect(calculateCalendarYearAge(calendar.id, "af:1-01-31", occurrence.range, [calendar]))
      .toMatchObject({ kind: "years", minimum: 5n, maximum: 5n });
  });

  it("refuses ordinal-year ages, cross-axis claims, and overlapping birth ranges", () => {
    const ordinal = ordinalCalendar();
    const ordinalOccurrence = normalizeTimelineExpression(ordinal.id, "400", [ordinal]);
    const gregorianOccurrence = normalizeTimelineExpression("gregorian", "2160", []);
    const overlapping = normalizeTimelineExpression("gregorian", "2160-06", []);
    expect(ordinalOccurrence.kind).toBe("computable");
    expect(gregorianOccurrence.kind).toBe("computable");
    expect(overlapping.kind).toBe("computable");
    if (ordinalOccurrence.kind !== "computable" ||
        gregorianOccurrence.kind !== "computable" ||
        overlapping.kind !== "computable") return;

    expect(calculateCalendarYearAge(ordinal.id, "0", ordinalOccurrence.range, [ordinal]))
      .toMatchObject({ kind: "indeterminate", reason: expect.stringContaining("does not define") });
    expect(calculateCalendarYearAge("gregorian", "2150", ordinalOccurrence.range, [ordinal]))
      .toMatchObject({ kind: "indeterminate", reason: expect.stringContaining("share") });
    expect(calculateCalendarYearAge("gregorian", "2160", overlapping.range, []))
      .toMatchObject({ kind: "indeterminate", reason: expect.stringContaining("overlap") });
  });

  it("identifies a complete occurrence before every possible birth date", () => {
    const occurrence = normalizeTimelineExpression("gregorian", "2159-12-31", []);
    expect(occurrence.kind).toBe("computable");
    if (occurrence.kind !== "computable") return;
    expect(calculateCalendarYearAge("gregorian", "2160", occurrence.range, []))
      .toMatchObject({ kind: "pre-birth" });
  });
});

describe("timeline range relationships", () => {
  it("orders comparable ranges by earliest then latest coordinate", () => {
    expect(compareTimelineRanges(range(1n, 2n), range(2n, 2n))).toEqual({
      kind: "comparable",
      order: -1,
    });
    expect(compareTimelineRanges(range(1n, 3n), range(1n, 2n))).toEqual({
      kind: "comparable",
      order: 1,
    });
    expect(compareTimelineRanges(range(1n, 2n), range(1n, 2n))).toEqual({
      kind: "comparable",
      order: 0,
    });
  });

  it("refuses to order unanchored values from different calendars", () => {
    expect(
      compareTimelineRanges(
        range(1n, 1n, "calendar:first"),
        range(1n, 1n, "calendar:second"),
      ),
    ).toMatchObject({ kind: "indeterminate" });
  });

  it.each([
    [range(1n, 1n), range(1n, 1n), "same-range"],
    [range(1n, 2n), range(3n, 4n), "adjacent"],
    [range(4n, 5n), range(2n, 3n), "adjacent"],
    [range(1n, 2n), range(4n, 5n), "before"],
    [range(4n, 5n), range(1n, 2n), "after"],
    [range(1n, 4n), range(3n, 6n), "overlaps"],
  ])("derives %s and %s as %s", (first, second, relation) => {
    expect(relateTimelineRanges(first, second, "exact", "exact")).toMatchObject({
      relation,
    });
  });

  it("keeps uncertainty and cross-axis comparisons indeterminate", () => {
    expect(relateTimelineRanges(range(1n, 1n), range(4n, 4n), "approximate", "exact")).toMatchObject({
      relation: "indeterminate",
      reason: expect.stringContaining("explicitly exact"),
    });
    expect(
      relateTimelineRanges(
        range(1n, 1n, "calendar:first"),
        range(1n, 1n, "calendar:second"),
        "exact",
        "exact",
      ),
    ).toMatchObject({
      relation: "indeterminate",
      reason: expect.stringContaining("calendar axis"),
    });
  });
});
