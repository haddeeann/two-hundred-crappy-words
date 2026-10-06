import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import type { TimelineCalendar } from "$lib/timeline/format";
import { normalizeTimelineExpression } from "$lib/timeline/normalize";
import { deriveJourneyAnalyses } from "./journey";
import { deriveTravelModel } from "./model";

function id(value: number): string {
  return `10000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

const ORIGIN_ID = id(1);
const DESTINATION_ID = id(2);
const ROUTE_ID = id(3);
const JOURNEY_ID = id(4);

function note(
  noteId: string,
  type: string,
  title: string,
  facts: readonly string[] = [],
  canon: string | null = "canon",
): string {
  return [
    "---",
    `id: "${noteId}"`,
    `type: "${type}"`,
    `title: "${title}"`,
    ...(canon ? [`canon: "${canon}"`] : []),
    ...(facts.length > 0 ? ["facts:", ...facts] : []),
    "---",
  ].join("\n");
}

function noteFact(
  factId: string,
  property: string,
  targetId: string,
  certainty = "exact",
): string {
  return [
    `  - id: "${factId}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "note"',
    `      id: "${targetId}"`,
    `    certainty: "${certainty}"`,
  ].join("\n");
}

function durationFact(
  factId: string,
  amount: string,
  unit: string,
  options: {
    certainty?: string;
    validFrom?: string;
    validTo?: string;
    calendar?: string;
  } = {},
): string {
  const calendar = options.calendar ?? "gregorian";
  return [
    `  - id: "${factId}"`,
    '    property: "travel-duration"',
    "    value:",
    '      kind: "quantity"',
    `      amount: "${amount}"`,
    '      unitSystem: "ucum"',
    `      unit: "${unit}"`,
    `    certainty: "${options.certainty ?? "exact"}"`,
    ...(options.validFrom
      ? [
          "    validFrom:",
          '      kind: "time"',
          `      calendar: "${calendar}"`,
          `      expression: "${options.validFrom}"`,
        ]
      : []),
    ...(options.validTo
      ? [
          "    validTo:",
          '      kind: "time"',
          `      calendar: "${calendar}"`,
          `      expression: "${options.validTo}"`,
        ]
      : []),
  ].join("\n");
}

function timeFact(
  factId: string,
  property: "occurs-at" | "ends-at",
  expression: string,
  calendar = "gregorian",
  certainty = "exact",
): string {
  return [
    `  - id: "${factId}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "time"',
    `      calendar: "${calendar}"`,
    `      expression: "${expression}"`,
    `    certainty: "${certainty}"`,
  ].join("\n");
}

function analyze({
  durations = [durationFact(id(103), "24", "h")],
  departure = timeFact(id(105), "occurs-at", "2161-04-06"),
  arrivals = [timeFact(id(106), "ends-at", "2161-04-07")],
  originTarget = ORIGIN_ID,
  destinationTarget = DESTINATION_ID,
  originCertainty = "exact",
  journeyRouteFacts = [noteFact(id(104), "uses-route", ROUTE_ID)],
  calendars = [],
  noteCanon = "canon",
}: {
  durations?: readonly string[];
  departure?: string;
  arrivals?: readonly string[];
  originTarget?: string;
  destinationTarget?: string;
  originCertainty?: string;
  journeyRouteFacts?: readonly string[];
  calendars?: readonly TimelineCalendar[];
  noteCanon?: string | null;
} = {}) {
  const index = buildLoreProjectIndex([
    {
      path: "Locations/origin.md",
      text: note(ORIGIN_ID, "location", "Origin", [], noteCanon),
    },
    {
      path: "Locations/destination.md",
      text: note(DESTINATION_ID, "location", "Destination", [], noteCanon),
    },
    {
      path: "Routes/route.md",
      text: note(ROUTE_ID, "route", "Outbound", [
        noteFact(id(101), "route-origin", originTarget, originCertainty),
        noteFact(id(102), "route-destination", destinationTarget),
        ...durations,
      ], noteCanon),
    },
    {
      path: "Timeline/journey.md",
      text: note(JOURNEY_ID, "event", "Journey", [
        ...journeyRouteFacts,
        departure,
        ...arrivals,
      ], noteCanon),
    },
  ]);
  return deriveJourneyAnalyses(deriveTravelModel(index), calendars)[0]!;
}

describe("journey arrival evidence", () => {
  it("derives an arrival and reports compatible independent authored evidence", () => {
    const result = analyze();
    const departure = normalizeTimelineExpression("gregorian", "2161-04-06", []);
    if (departure.kind !== "computable") throw new Error(departure.reason);

    expect(result).toMatchObject({
      kind: "computed",
      route: { noteId: ROUTE_ID },
      duration: {
        kind: "resolved",
        candidate: { claim: { evidence: { factId: id(103) } } },
      },
      arrival: {
        range: {
          earliest: departure.range.earliest + 1n,
          latest: departure.range.latest + 1n,
        },
      },
      comparison: {
        kind: "compatible",
        hardContradiction: false,
      },
    });
    expect(result.evidence.map(({ factId }) => factId)).toEqual([
      id(104),
      id(101),
      id(102),
      id(105),
      id(103),
      id(106),
    ]);
  });

  it("marks disjoint unique exact evidence as a hard contradiction", () => {
    expect(analyze({
      arrivals: [timeFact(id(106), "ends-at", "2161-04-09")],
    })).toMatchObject({
      kind: "computed",
      comparison: {
        kind: "review",
        hardContradiction: true,
        reason: expect.stringContaining("Unique canon, exact"),
      },
    });
  });

  it("keeps a disjoint estimate as review rather than a hard contradiction", () => {
    expect(analyze({
      durations: [
        durationFact(id(103), "24", "h", { certainty: "approximate" }),
      ],
      arrivals: [timeFact(id(106), "ends-at", "2161-04-09")],
    })).toMatchObject({
      kind: "computed",
      comparison: {
        kind: "review",
        hardContradiction: false,
        reason: expect.stringContaining("canon or certainty"),
      },
    });
  });

  it("keeps exact but non-canon disjoint evidence at review", () => {
    expect(analyze({
      arrivals: [timeFact(id(106), "ends-at", "2161-04-09")],
      noteCanon: null,
    })).toMatchObject({
      kind: "computed",
      comparison: {
        kind: "review",
        hardContradiction: false,
      },
    });
  });

  it("calculates without authored arrival evidence", () => {
    expect(analyze({ arrivals: [] })).toMatchObject({
      kind: "computed",
      comparison: { kind: "not-authored", authoredRange: null },
    });
  });

  it("selects one definitely applicable duration and ignores a definitely outside claim", () => {
    const result = analyze({
      durations: [
        durationFact(id(110), "5", "h", { validTo: "2160" }),
        durationFact(id(111), "2", "d", {
          validFrom: "2161-01-01",
          validTo: "2161-12-31",
        }),
      ],
      arrivals: [],
    });

    expect(result).toMatchObject({
      kind: "computed",
      duration: {
        candidate: { claim: { evidence: { factId: id(111) } } },
        candidates: [
          { applicability: "outside" },
          { applicability: "applicable" },
        ],
      },
    });
  });

  it("refuses potential applicability and several definitely applicable durations", () => {
    expect(analyze({
      durations: [
        durationFact(id(120), "5", "h"),
        durationFact(id(121), "6", "h", { validFrom: "2161-04" }),
      ],
      departure: timeFact(id(105), "occurs-at", "2161-04"),
      arrivals: [],
    })).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("could apply"),
    });

    expect(analyze({
      durations: [
        durationFact(id(122), "5", "h"),
        durationFact(id(123), "6", "h"),
      ],
      arrivals: [],
    })).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("More than one duration"),
    });
  });

  it("refuses an applicable unsupported duration without consulting distance or prose", () => {
    expect(analyze({
      durations: [durationFact(id(130), "1", "mo")],
      arrivals: [],
    })).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("calendar-variable"),
    });
  });

  it("keeps ambiguous or interval authored arrival evidence indeterminate", () => {
    expect(analyze({
      arrivals: [
        timeFact(id(140), "ends-at", "2161-04-07"),
        timeFact(id(141), "ends-at", "2161-04-08"),
      ],
    })).toMatchObject({
      kind: "computed",
      comparison: {
        kind: "indeterminate",
        reason: expect.stringContaining("More than one ends-at"),
      },
    });

    expect(analyze({
      arrivals: [
        timeFact(id(142), "ends-at", "2161-04-07/2161-04-08"),
      ],
    })).toMatchObject({
      kind: "computed",
      comparison: {
        kind: "indeterminate",
        reason: expect.stringContaining("one date"),
      },
    });
  });

  it("refuses an interval departure combined with authored ends-at evidence", () => {
    expect(analyze({
      departure: timeFact(
        id(105),
        "occurs-at",
        "2161-04-06/2161-04-07",
      ),
    })).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("complete interval"),
    });
  });

  it("refuses unresolved route structure and unanchored fictional calendars", () => {
    expect(analyze({ destinationTarget: ORIGIN_ID })).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("same note"),
    });

    const missionCalendar: TimelineCalendar = {
      id: "mission",
      title: "Mission calendar",
      kind: "fixed",
      months: [
        {
          id: "cycle",
          name: "Cycle",
          shortName: "Cyc",
          commonDays: 30,
          leapDays: 30,
        },
      ],
      weekdays: [],
      eras: [],
    };
    expect(analyze({
      departure: timeFact(id(105), "occurs-at", "1-1-1", "mission"),
      arrivals: [],
      calendars: [missionCalendar],
    })).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("explicitly anchored"),
    });
  });
});
