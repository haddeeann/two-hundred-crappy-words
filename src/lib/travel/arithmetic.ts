import type { ContinuityValue } from "$lib/lore/types";
import type { TimelineRange } from "$lib/timeline/normalize";

const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;
const SECONDS_PER_DAY = 86_400n;

const UCUM_SECONDS = new Map<string, bigint>([
  ["s", 1n],
  ["min", 60n],
  ["h", 3_600n],
  ["d", SECONDS_PER_DAY],
  ["wk", 604_800n],
]);

export interface ExactRational {
  numerator: bigint;
  denominator: bigint;
}

export interface NormalizedTravelDuration {
  minimumSeconds: ExactRational;
  maximumSeconds: ExactRational;
  writtenUnit: string;
}

export type TravelDurationNormalization =
  | { kind: "computable"; duration: NormalizedTravelDuration }
  | {
      kind: "non-computable";
      code:
        | "wrong-value-kind"
        | "unsupported-unit-system"
        | "calendar-variable-unit"
        | "unsupported-unit"
        | "invalid-number"
        | "negative-duration"
        | "reversed-duration";
      reason: string;
    };

export interface TravelArrivalWindow {
  range: TimelineRange;
  minimumDayOffset: bigint;
  maximumDayOffset: bigint;
  widenedByDayPrecision: boolean;
}

export type TravelArrivalCalculation =
  | { kind: "computable"; arrival: TravelArrivalWindow }
  | {
      kind: "non-computable";
      code: "unanchored-calendar";
      reason: string;
    };

export function normalizeTravelDuration(
  value: ContinuityValue,
): TravelDurationNormalization {
  if (value.kind !== "quantity" && value.kind !== "range") {
    return {
      kind: "non-computable",
      code: "wrong-value-kind",
      reason: "Travel duration must be a quantity or inclusive range.",
    };
  }
  if (value.unitSystem !== "ucum") {
    return {
      kind: "non-computable",
      code: "unsupported-unit-system",
      reason: `Unit system ${JSON.stringify(value.unitSystem)} has no approved elapsed-time conversion.`,
    };
  }
  if (value.unit === "mo" || value.unit === "a") {
    return {
      kind: "non-computable",
      code: "calendar-variable-unit",
      reason: `${value.unit} is calendar-variable and is not converted to elapsed seconds.`,
    };
  }
  const unitSeconds = UCUM_SECONDS.get(value.unit);
  if (!unitSeconds) {
    return {
      kind: "non-computable",
      code: "unsupported-unit",
      reason: `UCUM unit ${JSON.stringify(value.unit)} is visible but not in the supported elapsed-time subset.`,
    };
  }
  const minimum = parseDecimal(
    value.kind === "quantity" ? value.amount : value.minimum,
  );
  const maximum = parseDecimal(
    value.kind === "quantity" ? value.amount : value.maximum,
  );
  if (!minimum || !maximum) {
    return {
      kind: "non-computable",
      code: "invalid-number",
      reason: "Travel duration must use canonical decimal strings.",
    };
  }
  if (minimum.numerator < 0n || maximum.numerator < 0n) {
    return {
      kind: "non-computable",
      code: "negative-duration",
      reason: "Travel duration cannot be negative.",
    };
  }
  if (compareRationals(minimum, maximum) > 0) {
    return {
      kind: "non-computable",
      code: "reversed-duration",
      reason: "The minimum travel duration is greater than the maximum.",
    };
  }
  return {
    kind: "computable",
    duration: {
      minimumSeconds: multiplyRational(minimum, unitSeconds),
      maximumSeconds: multiplyRational(maximum, unitSeconds),
      writtenUnit: value.unit,
    },
  };
}

export function calculateTravelArrival(
  departure: TimelineRange,
  duration: NormalizedTravelDuration,
): TravelArrivalCalculation {
  if (departure.axis !== "gregorian" || !departure.anchored) {
    return {
      kind: "non-computable",
      code: "unanchored-calendar",
      reason:
        "Elapsed-time addition requires Gregorian or an explicitly anchored project calendar.",
    };
  }
  const minimumDayOffset = floorRational(
    divideRational(duration.minimumSeconds, SECONDS_PER_DAY),
  );
  const maximumDayOffset = ceilRational(
    divideRational(duration.maximumSeconds, SECONDS_PER_DAY),
  );
  const earliest = departure.earliest + minimumDayOffset;
  const latest = departure.latest + maximumDayOffset;
  return {
    kind: "computable",
    arrival: {
      range: {
        calendarId: departure.calendarId,
        expression: "derived-arrival",
        axis: departure.axis,
        earliest,
        latest,
        startPrecision: "day",
        endPrecision: "day",
        interval: earliest !== latest,
        anchored: true,
      },
      minimumDayOffset,
      maximumDayOffset,
      widenedByDayPrecision:
        !isWholeDays(duration.minimumSeconds) ||
        !isWholeDays(duration.maximumSeconds),
    },
  };
}

function parseDecimal(value: string): ExactRational | null {
  if (!DECIMAL_PATTERN.test(value)) return null;
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n);
  return reduceRational({ numerator, denominator });
}

function multiplyRational(
  value: ExactRational,
  multiplier: bigint,
): ExactRational {
  return reduceRational({
    numerator: value.numerator * multiplier,
    denominator: value.denominator,
  });
}

function divideRational(
  value: ExactRational,
  divisor: bigint,
): ExactRational {
  return reduceRational({
    numerator: value.numerator,
    denominator: value.denominator * divisor,
  });
}

function compareRationals(
  first: ExactRational,
  second: ExactRational,
): -1 | 0 | 1 {
  const difference =
    first.numerator * second.denominator -
    second.numerator * first.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function floorRational(value: ExactRational): bigint {
  if (value.numerator < 0n) {
    throw new RangeError("Travel duration arithmetic requires non-negative values.");
  }
  return value.numerator / value.denominator;
}

function ceilRational(value: ExactRational): bigint {
  if (value.numerator < 0n) {
    throw new RangeError("Travel duration arithmetic requires non-negative values.");
  }
  return (value.numerator + value.denominator - 1n) / value.denominator;
}

function isWholeDays(value: ExactRational): boolean {
  return (value.numerator % (value.denominator * SECONDS_PER_DAY)) === 0n;
}

function reduceRational(value: ExactRational): ExactRational {
  if (value.denominator <= 0n) {
    throw new RangeError("An exact rational denominator must be positive.");
  }
  const divisor = greatestCommonDivisor(
    value.numerator < 0n ? -value.numerator : value.numerator,
    value.denominator,
  );
  return {
    numerator: value.numerator / divisor,
    denominator: value.denominator / divisor,
  };
}

function greatestCommonDivisor(first: bigint, second: bigint): bigint {
  let left = first;
  let right = second;
  while (right !== 0n) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left === 0n ? 1n : left;
}
