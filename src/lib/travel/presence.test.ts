import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import { deriveJourneyAnalyses } from "./journey";
import { deriveTravelModel } from "./model";
import { deriveTravelPresenceFindings } from "./presence";

function id(value: number): string {
  return `40000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function note(
  noteId: string,
  type: string,
  title: string,
  facts: readonly string[] = [],
): string {
  return [
    "---",
    `id: "${noteId}"`,
    `type: "${type}"`,
    `title: "${title}"`,
    ...(facts.length ? ["facts:", ...facts] : []),
    "---",
  ].join("\n");
}

function noteFact(
  factId: string,
  property: string,
  targetId: string,
  options: { certainty?: string; validFrom?: string; validTo?: string } = {},
): string {
  return [
    `  - id: "${factId}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "note"',
    `      id: "${targetId}"`,
    `    certainty: "${options.certainty ?? "exact"}"`,
    ...(options.validFrom ? [
      "    validFrom:",
      '      kind: "time"',
      '      calendar: "gregorian"',
      `      expression: "${options.validFrom}"`,
    ] : []),
    ...(options.validTo ? [
      "    validTo:",
      '      kind: "time"',
      '      calendar: "gregorian"',
      `      expression: "${options.validTo}"`,
    ] : []),
  ].join("\n");
}

function timeFact(factId: string, property: string, expression: string): string {
  return [
    `  - id: "${factId}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "time"',
    '      calendar: "gregorian"',
    `      expression: "${expression}"`,
    '    certainty: "exact"',
  ].join("\n");
}

function durationFact(factId: string, hours = "24"): string {
  return [
    `  - id: "${factId}"`,
    '    property: "travel-duration"',
    "    value:",
    '      kind: "quantity"',
    `      amount: "${hours}"`,
    '      unitSystem: "ucum"',
    '      unit: "h"',
    '    certainty: "exact"',
  ].join("\n");
}

function fixture(options: {
  presenceFacts?: readonly string[];
  extraLocations?: readonly { path: string; text: string }[];
  destinationFacts?: readonly string[];
  participantOptions?: { validFrom?: string; validTo?: string };
} = {}) {
  const origin = id(1);
  const destination = id(2);
  const traveler = id(3);
  const route = id(4);
  const journey = id(5);
  const index = buildLoreProjectIndex([
    { path: "Locations/origin.md", text: note(origin, "location", "Origin") },
    {
      path: "Locations/destination.md",
      text: note(destination, "location", "Destination", options.destinationFacts),
    },
    ...(options.extraLocations ?? []),
    {
      path: "Characters/traveler.md",
      text: note(traveler, "character", "Traveler", options.presenceFacts ?? [
        noteFact(id(201), "located-at", origin, { validTo: "2161-04-06" }),
        noteFact(id(202), "located-at", destination, { validFrom: "2161-04-07" }),
      ]),
    },
    {
      path: "Routes/route.md",
      text: note(route, "route", "Outbound", [
        noteFact(id(101), "route-origin", origin),
        noteFact(id(102), "route-destination", destination),
        durationFact(id(103)),
      ]),
    },
    {
      path: "Timeline/journey.md",
      text: note(journey, "event", "Journey", [
        noteFact(id(104), "uses-route", route),
        noteFact(id(105), "participant", traveler, options.participantOptions),
        timeFact(id(106), "occurs-at", "2161-04-06"),
        timeFact(id(107), "ends-at", "2161-04-07"),
      ]),
    },
  ]);
  const model = deriveTravelModel(index);
  const analyses = deriveJourneyAnalyses(model, []);
  return { index, model, analyses, origin, destination, traveler, journey };
}

describe("travel presence findings", () => {
  it("confirms exact origin and destination presence at their applicable phases", () => {
    const value = fixture();
    const result = deriveTravelPresenceFindings(value.index, value.model, value.analyses, []);

    expect(result.omittedCount).toBe(0);
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map(({ phase, kind, endpointTitle, presenceTitle }) => ({
      phase,
      kind,
      endpointTitle,
      presenceTitle,
    }))).toEqual([
      { phase: "departure", kind: "compatible", endpointTitle: "Origin", presenceTitle: "Origin" },
      { phase: "arrival", kind: "compatible", endpointTitle: "Destination", presenceTitle: "Destination" },
    ]);
    expect(result.findings[1]!.evidence.map(({ role }) => role)).toEqual(
      expect.arrayContaining(["participant", "presence", "route", "endpoint", "departure", "duration"]),
    );
  });

  it("accepts a definitely contained place and treats a broader place as indeterminate", () => {
    const origin = id(1);
    const destination = id(2);
    const room = id(8);
    const district = id(9);
    const value = fixture({
      extraLocations: [
        {
          path: "Locations/room.md",
          text: note(room, "location", "Room", [noteFact(id(301), "contained-by", origin)]),
        },
        { path: "Locations/district.md", text: note(district, "location", "District") },
      ],
      destinationFacts: [noteFact(id(302), "contained-by", district)],
      presenceFacts: [
        noteFact(id(201), "located-at", room, { validTo: "2161-04-06" }),
        noteFact(id(202), "located-at", district, { validFrom: "2161-04-07" }),
      ],
    });
    const result = deriveTravelPresenceFindings(value.index, value.model, value.analyses, []);

    expect(result.findings[0]).toMatchObject({
      phase: "departure",
      kind: "compatible",
      presenceTitle: "Room",
    });
    expect(result.findings[1]).toMatchObject({
      phase: "arrival",
      kind: "indeterminate",
      presenceTitle: "District",
      explanation: expect.stringContaining("broader presence"),
    });
  });

  it("reports unrelated locations for review without inventing disjointness", () => {
    const elsewhere = id(10);
    const value = fixture({
      extraLocations: [
        { path: "Locations/elsewhere.md", text: note(elsewhere, "location", "Elsewhere") },
      ],
      presenceFacts: [noteFact(id(201), "located-at", elsewhere)],
    });
    const result = deriveTravelPresenceFindings(value.index, value.model, value.analyses, []);

    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toMatchObject({
      kind: "review",
      severity: "review",
      explanation: expect.stringContaining("not a contradiction"),
    });
  });

  it("selects the most specific member of a definite applicable containment chain", () => {
    const room = id(11);
    const origin = id(1);
    const value = fixture({
      extraLocations: [
        {
          path: "Locations/room.md",
          text: note(room, "location", "Room", [noteFact(id(301), "contained-by", origin)]),
        },
      ],
      presenceFacts: [
        noteFact(id(201), "located-at", origin, { validTo: "2161-04-06" }),
        noteFact(id(202), "located-at", room, { validTo: "2161-04-06" }),
      ],
    });
    const result = deriveTravelPresenceFindings(value.index, value.model, value.analyses, []);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      phase: "departure",
      kind: "compatible",
      presenceTitle: "Room",
    });
  });

  it("keeps competing locations and partly applicable evidence explicit", () => {
    const elsewhere = id(12);
    const value = fixture({
      extraLocations: [
        { path: "Locations/elsewhere.md", text: note(elsewhere, "location", "Elsewhere") },
      ],
      presenceFacts: [
        noteFact(id(201), "located-at", valueId(1), { validTo: "2161-04-06" }),
        noteFact(id(202), "located-at", elsewhere, { validTo: "2161-04-06" }),
        noteFact(id(203), "located-at", valueId(2), { validFrom: "2161-04-07" }),
      ],
    });
    const result = deriveTravelPresenceFindings(value.index, value.model, value.analyses, []);

    expect(result.findings[0]).toMatchObject({ kind: "review", phase: "departure" });
    expect(result.findings[1]).toMatchObject({ kind: "compatible", phase: "arrival" });
  });

  it("keeps partly applicable presence evidence indeterminate", () => {
    const value = fixture({
      presenceFacts: [
        noteFact(id(201), "located-at", valueId(1), { validFrom: "2161-04" }),
      ],
    });
    const result = deriveTravelPresenceFindings(value.index, value.model, value.analyses, []);

    expect(result.findings[0]).toMatchObject({
      kind: "indeterminate",
      phase: "departure",
      explanation: expect.stringContaining("partly or possibly"),
    });
  });

  it("does not emit absence findings when no presence fact covers a phase", () => {
    const value = fixture({
      presenceFacts: [
        noteFact(id(201), "located-at", id(1), { validTo: "2160" }),
      ],
    });
    expect(deriveTravelPresenceFindings(value.index, value.model, value.analyses, []).findings).toEqual([]);
  });
});

function valueId(value: number): string {
  return id(value);
}
