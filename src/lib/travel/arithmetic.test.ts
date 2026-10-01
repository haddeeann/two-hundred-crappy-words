import { describe, expect, it } from "vitest";

import type { ContinuityValue } from "$lib/lore/types";
import type { TimelineRange } from "$lib/timeline/normalize";
import {
  calculateTravelArrival,
  normalizeTravelDuration,
} from "./arithmetic";

const source = {
  range: { start: 0, end: 1, line: 1, column: 1 },
  fieldRanges: {},
  unknownKeys: [],
};

function quantity(
  amount: string,
  unit: string,
  unitSystem = "ucum",
): ContinuityValue {
  return { ...source, kind: "quantity", amount, unitSystem, unit };
}

function range(
  minimum: string,
  maximum: string,
  unit: string,
  unitSystem = "ucum",
): ContinuityValue {
  return {
    ...source,
    kind: "range",
    minimum,
    maximum,
    unitSystem,
    unit,
  };
}

function departure(
  earliest: bigint,
  latest = earliest,
  options: Partial<TimelineRange> = {},
): TimelineRange {
  return {
    calendarId: "gregorian",
    expression: "2161-04-06",
    axis: "gregorian",
    earliest,
    latest,
    startPrecision: "day",
    endPrecision: "day",
    interval: earliest !== latest,
    anchored: true,
    ...options,
  };
}

describe("travel duration normalization", () => {
  it.each([
    ["1", "s", 1n],
    ["1", "min", 60n],
    ["1", "h", 3_600n],
    ["1", "d", 86_400n],
    ["1", "wk", 604_800n],
    ["0.5", "h", 1_800n],
  ])("converts %s %s to exact elapsed seconds", (amount, unit, seconds) => {
    expect(normalizeTravelDuration(quantity(amount, unit))).toEqual({
      kind: "computable",
      duration: {
        minimumSeconds: { numerator: seconds, denominator: 1n },
        maximumSeconds: { numerator: seconds, denominator: 1n },
        writtenUnit: unit,
      },
    });
  });

  it("preserves decimal ranges exactly without binary floating point", () => {
    expect(normalizeTravelDuration(range("0.1", "0.3", "s"))).toEqual({
      kind: "computable",
      duration: {
        minimumSeconds: { numerator: 1n, denominator: 10n },
        maximumSeconds: { numerator: 3n, denominator: 10n },
        writtenUnit: "s",
      },
    });
  });

  it.each([
    [quantity("1", "h", "project"), "unsupported-unit-system"],
    [quantity("1", "mo"), "calendar-variable-unit"],
    [quantity("1", "a"), "calendar-variable-unit"],
    [quantity("1", "fortnight"), "unsupported-unit"],
    [quantity("-1", "h"), "negative-duration"],
    [range("3", "2", "h"), "reversed-duration"],
    [{ ...source, kind: "text", text: "soon" } as ContinuityValue, "wrong-value-kind"],
  ])("refuses unsupported or unsafe duration evidence", (value, code) => {
    expect(normalizeTravelDuration(value)).toMatchObject({
      kind: "non-computable",
      code,
    });
  });
});

describe("conservative calendar-day arrival enclosure", () => {
  it("widens a five-hour trip across both possible arrival dates", () => {
    const normalized = normalizeTravelDuration(quantity("5", "h"));
    if (normalized.kind !== "computable") throw new Error(normalized.reason);

    expect(calculateTravelArrival(departure(100n), normalized.duration)).toEqual({
      kind: "computable",
      arrival: {
        range: expect.objectContaining({
          earliest: 100n,
          latest: 101n,
          interval: true,
          startPrecision: "day",
          endPrecision: "day",
        }),
        minimumDayOffset: 0n,
        maximumDayOffset: 1n,
        widenedByDayPrecision: true,
      },
    });
  });

  it("keeps exact whole-day durations exact at day precision", () => {
    const normalized = normalizeTravelDuration(quantity("24", "h"));
    if (normalized.kind !== "computable") throw new Error(normalized.reason);

    expect(calculateTravelArrival(departure(100n), normalized.duration)).toMatchObject({
      kind: "computable",
      arrival: {
        range: { earliest: 101n, latest: 101n, interval: false },
        minimumDayOffset: 1n,
        maximumDayOffset: 1n,
        widenedByDayPrecision: false,
      },
    });
  });

  it("encloses reduced departure precision and a duration range outward", () => {
    const normalized = normalizeTravelDuration(range("31", "38", "h"));
    if (normalized.kind !== "computable") throw new Error(normalized.reason);

    expect(calculateTravelArrival(departure(100n, 110n), normalized.duration)).toMatchObject({
      kind: "computable",
      arrival: {
        range: { earliest: 101n, latest: 112n },
        minimumDayOffset: 1n,
        maximumDayOffset: 2n,
        widenedByDayPrecision: true,
      },
    });
  });

  it("accepts an explicitly anchored custom-calendar range on the shared axis", () => {
    const normalized = normalizeTravelDuration(quantity("2", "d"));
    if (normalized.kind !== "computable") throw new Error(normalized.reason);

    expect(calculateTravelArrival(
      departure(100n, 100n, { calendarId: "mission", anchored: true }),
      normalized.duration,
    )).toMatchObject({
      kind: "computable",
      arrival: {
        range: { calendarId: "mission", axis: "gregorian", earliest: 102n, latest: 102n },
      },
    });
  });

  it("declines elapsed-time addition on an unanchored fictional calendar", () => {
    const normalized = normalizeTravelDuration(quantity("2", "d"));
    if (normalized.kind !== "computable") throw new Error(normalized.reason);

    expect(calculateTravelArrival(
      departure(100n, 100n, {
        calendarId: "mission",
        axis: "calendar:mission",
        anchored: false,
      }),
      normalized.duration,
    )).toMatchObject({
      kind: "non-computable",
      code: "unanchored-calendar",
    });
  });
});
