import { describe, expect, it } from "vitest";

import { fingerprintContent } from "$lib/editor/recovery";
import { buildLoreProjectIndex } from "$lib/lore/index";
import { deriveJourneyAnalyses } from "./journey";
import { deriveTravelModel } from "./model";
import { presentTravelInspector } from "./presentation";

const ORIGIN = "20000000-0000-4000-8000-000000000001";
const DESTINATION = "20000000-0000-4000-8000-000000000002";
const ROUTE = "20000000-0000-4000-8000-000000000003";
const JOURNEY = "20000000-0000-4000-8000-000000000004";

function note(id: string, type: string, title: string, facts: string[] = []): string {
  return [
    "---",
    `id: "${id}"`,
    `type: "${type}"`,
    `title: "${title}"`,
    ...(facts.length ? ["facts:", ...facts] : []),
    "---",
  ].join("\n");
}

function referenceFact(id: string, property: string, target: string): string {
  return [
    `  - id: "${id}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "note"',
    `      id: "${target}"`,
    '    certainty: "exact"',
  ].join("\n");
}

function timeFact(id: string, property: string, expression: string): string {
  return [
    `  - id: "${id}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "time"',
    '      calendar: "gregorian"',
    `      expression: "${expression}"`,
    '    certainty: "exact"',
  ].join("\n");
}

function fixture() {
  const routeText = note(ROUTE, "route", "Outbound", [
    referenceFact("20000000-0000-4000-8000-000000000101", "route-origin", ORIGIN),
    referenceFact("20000000-0000-4000-8000-000000000102", "route-destination", DESTINATION),
    [
      '  - id: "20000000-0000-4000-8000-000000000103"',
      '    property: "travel-duration"',
      "    value:",
      '      kind: "quantity"',
      '      amount: "5"',
      '      unitSystem: "ucum"',
      '      unit: "h"',
      '    certainty: "exact"',
    ].join("\n"),
  ]);
  const journeyText = note(JOURNEY, "event", "Departure", [
    referenceFact("20000000-0000-4000-8000-000000000104", "uses-route", ROUTE),
    timeFact("20000000-0000-4000-8000-000000000105", "occurs-at", "2161-04-06"),
    timeFact("20000000-0000-4000-8000-000000000106", "ends-at", "2161-04-07"),
  ]);
  const index = buildLoreProjectIndex([
    { path: "Locations/origin.md", text: note(ORIGIN, "location", "Origin") },
    {
      path: "Locations/destination.md",
      text: note(DESTINATION, "location", "Destination", [
        referenceFact(
          "20000000-0000-4000-8000-000000000107",
          "contained-by",
          ORIGIN,
        ),
      ]),
    },
    { path: "Routes/outbound.md", text: routeText },
    { path: "Timeline/departure.md", text: journeyText },
    { path: "Lore/other.md", text: note("20000000-0000-4000-8000-000000000005", "character", "Other") },
  ]);
  const model = deriveTravelModel(index);
  const analyses = deriveJourneyAnalyses(model, []);
  return { index, model, analyses, routeText, journeyText };
}

describe("travel inspector presentation", () => {
  it("presents route direction, duration, references, and exact source actions", () => {
    const { index, model, analyses, routeText } = fixture();
    expect(presentTravelInspector(
      index,
      model,
      analyses,
      "Routes/outbound.md",
      fingerprintContent(routeText),
      [],
    )).toMatchObject({
      kind: "ready",
      summary: "Travel · route",
      sections: [
        {
          title: "Direction",
          items: [
            {
              label: "Origin",
              value: "Origin",
              reference: { path: "Locations/origin.md" },
              sources: [{ path: "Routes/outbound.md", range: { line: 6 } }],
            },
            {
              label: "Destination",
              value: "Destination",
              reference: { path: "Locations/destination.md" },
            },
          ],
        },
        {
          title: "Travel evidence",
          items: expect.arrayContaining([
            expect.objectContaining({ label: "Duration", value: "5 h · ucum" }),
          ]),
        },
      ],
      issues: [],
    });
  });

  it("presents a readable derived arrival and authored comparison", () => {
    const { index, model, analyses, journeyText } = fixture();
    const presented = presentTravelInspector(
      index,
      model,
      analyses,
      "Timeline/departure.md",
      fingerprintContent(journeyText),
      [],
    );

    expect(presented).toMatchObject({
      kind: "ready",
      summary: "Travel · journey",
      sections: [{
        title: "Journey",
        items: expect.arrayContaining([
          expect.objectContaining({
            label: "Derived arrival",
            value: "2161-04-06/2161-04-07",
            detail: expect.stringContaining("time of day"),
          }),
          expect.objectContaining({
            label: "Comparison",
            value: "Compatible",
          }),
        ]),
      }],
    });
  });

  it("shows explicit containment and suppresses stale or unrelated views", () => {
    const { index, model, analyses } = fixture();
    expect(presentTravelInspector(
      index,
      model,
      analyses,
      "Locations/destination.md",
      null,
      [],
    )).toMatchObject({
      kind: "ready",
      summary: "Travel · location · 1 container",
      sections: [{
        title: "Containment",
        items: expect.arrayContaining([
          expect.objectContaining({ value: "Destination → Origin" }),
        ]),
      }],
    });
    expect(presentTravelInspector(
      index,
      model,
      analyses,
      "Locations/destination.md",
      "stale",
      [],
    )).toEqual({ kind: "updating", summary: "Travel · updating…" });
    expect(presentTravelInspector(
      index,
      model,
      analyses,
      "Lore/other.md",
      null,
      [],
    )).toEqual({ kind: "no-active-note", summary: "Travel" });
  });
});
