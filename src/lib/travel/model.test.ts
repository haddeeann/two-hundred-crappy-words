import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import { deriveTravelModel } from "./model";

function id(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function note({
  noteId,
  type,
  title,
  facts = [],
}: {
  noteId?: string;
  type: string;
  title: string;
  facts?: readonly string[];
}): string {
  return [
    "---",
    ...(noteId ? [`id: "${noteId}"`] : []),
    `type: "${type}"`,
    `title: "${title}"`,
    ...(facts.length > 0 ? ["facts:", ...facts] : []),
    "---",
    `# ${title}`,
  ].join("\n");
}

function noteFact(
  factId: string,
  property: string,
  targetId: string,
  options: {
    certainty?: "exact" | "approximate" | "uncertain";
    validFrom?: string;
    validTo?: string;
  } = {},
): string {
  return [
    `  - id: "${factId}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "note"',
    `      id: "${targetId}"`,
    ...(options.certainty ? [`    certainty: "${options.certainty}"`] : []),
    ...(options.validFrom
      ? [
          "    validFrom:",
          '      kind: "time"',
          '      calendar: "gregorian"',
          `      expression: "${options.validFrom}"`,
        ]
      : []),
    ...(options.validTo
      ? [
          "    validTo:",
          '      kind: "time"',
          '      calendar: "gregorian"',
          `      expression: "${options.validTo}"`,
        ]
      : []),
  ].join("\n");
}

function quantityFact(
  factId: string,
  property: string,
  amount: string,
  unit: string,
  options: { certainty?: string; validFrom?: string } = {},
): string {
  return [
    `  - id: "${factId}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "quantity"',
    `      amount: "${amount}"`,
    '      unitSystem: "ucum"',
    `      unit: "${unit}"`,
    ...(options.certainty ? [`    certainty: "${options.certainty}"`] : []),
    ...(options.validFrom
      ? [
          "    validFrom:",
          '      kind: "time"',
          '      calendar: "gregorian"',
          `      expression: "${options.validFrom}"`,
        ]
      : []),
  ].join("\n");
}

function rangeFact(
  factId: string,
  property: string,
  minimum: string,
  maximum: string,
  unit: string,
): string {
  return [
    `  - id: "${factId}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "range"',
    `      minimum: "${minimum}"`,
    `      maximum: "${maximum}"`,
    '      unitSystem: "ucum"',
    `      unit: "${unit}"`,
    '    certainty: "approximate"',
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

describe("travel evidence model", () => {
  it("resolves one directional route and one specific journey without inventing physics", () => {
    const origin = id(1);
    const destination = id(2);
    const technology = id(3);
    const routeId = id(4);
    const journeyId = id(5);
    const model = deriveTravelModel(buildLoreProjectIndex([
      { path: "Locations/aster.md", text: note({ noteId: origin, type: "location", title: "Aster Vale" }) },
      { path: "Locations/nacre.md", text: note({ noteId: destination, type: "spacecraft", title: "Nacre Station" }) },
      { path: "Technology/courier.md", text: note({ noteId: technology, type: "technology", title: "Courier drive" }) },
      {
        path: "Routes/outbound.md",
        text: note({
          noteId: routeId,
          type: "route",
          title: "Aster to Nacre",
          facts: [
            noteFact(id(101), "route-origin", origin, { certainty: "exact" }),
            noteFact(id(102), "route-destination", destination, { certainty: "exact" }),
            noteFact(id(103), "travel-model", technology, { certainty: "exact" }),
            rangeFact(id(104), "travel-duration", "31", "38", "h"),
            quantityFact(id(105), "travel-distance", "4.2", "AU"),
          ],
        }),
      },
      {
        path: "Timeline/departure.md",
        text: note({
          noteId: journeyId,
          type: "event",
          title: "The departure",
          facts: [
            noteFact(id(106), "uses-route", routeId, { certainty: "exact" }),
            timeFact(id(107), "occurs-at", "2161-04-06"),
            timeFact(id(108), "ends-at", "2161-04-08"),
          ],
        }),
      },
    ]));

    expect(model.excludedSources).toEqual([]);
    expect(model.routes).toHaveLength(1);
    expect(model.routes[0]).toMatchObject({
      noteId: routeId,
      origin: {
        kind: "resolved",
        claim: { resolution: { target: { noteId: origin, noteType: "location" } } },
      },
      destination: {
        kind: "resolved",
        claim: { resolution: { target: { noteId: destination, noteType: "spacecraft" } } },
      },
      model: {
        kind: "resolved",
        claim: { resolution: { target: { noteId: technology, noteType: "technology" } } },
      },
      durations: [{ usableShape: true, value: { kind: "range", minimum: "31", maximum: "38" } }],
      distance: { kind: "resolved", claim: { value: { kind: "quantity", amount: "4.2" } } },
      issues: [],
    });
    expect(model.journeys[0]).toMatchObject({
      noteId: journeyId,
      noteType: "event",
      route: { kind: "resolved", claim: { targetId: routeId } },
      departure: { kind: "resolved", claim: { value: { kind: "time", expression: "2161-04-06" } } },
      arrival: { kind: "resolved", claim: { value: { kind: "time", expression: "2161-04-08" } } },
      issues: [],
    });
  });

  it("keeps competing, missing, wrong-type, and malformed references explicit", () => {
    const place = id(10);
    const faction = id(11);
    const routeId = id(12);
    const missing = id(99);
    const model = deriveTravelModel(buildLoreProjectIndex([
      { path: "Locations/place.md", text: note({ noteId: place, type: "location", title: "Place" }) },
      { path: "Lore/faction.md", text: note({ noteId: faction, type: "faction", title: "Faction" }) },
      {
        path: "Routes/broken.md",
        text: note({
          noteId: routeId,
          type: "route",
          title: "Broken route",
          facts: [
            noteFact(id(201), "route-origin", place),
            noteFact(id(202), "route-origin", faction),
            noteFact(id(203), "route-destination", missing),
            noteFact(id(204), "travel-model", faction),
            timeFact(id(205), "travel-duration", "2161"),
            quantityFact(id(206), "travel-distance", "2", "km", { validFrom: "2160" }),
          ],
        }),
      },
    ]));

    const route = model.routes[0]!;
    expect(route.origin).toMatchObject({ kind: "competing", claims: [{}, {}] });
    expect(route.destination).toMatchObject({
      kind: "unavailable",
      claims: [{ resolution: { kind: "missing" } }],
    });
    expect(route.model).toMatchObject({
      kind: "unavailable",
      claims: [{ resolution: { kind: "wrong-type" } }],
    });
    expect(route.durations[0]).toMatchObject({ usableShape: false });
    expect(route.distance).toMatchObject({ kind: "unavailable" });
    expect(route.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("More than one route-origin"),
      expect.stringContaining("not present"),
      expect.stringContaining("travel-duration expects"),
      expect.stringContaining("travel-distance does not use validity bounds"),
    ]));
  });

  it("excludes missing or copied subject identities and refuses copied fact IDs", () => {
    const copiedNoteId = id(20);
    const place = id(21);
    const copiedFactId = id(220);
    const routeId = id(22);
    const model = deriveTravelModel(buildLoreProjectIndex([
      { path: "Locations/one.md", text: note({ noteId: copiedNoteId, type: "location", title: "One" }) },
      { path: "Locations/two.md", text: note({ noteId: copiedNoteId, type: "location", title: "Two" }) },
      { path: "Locations/no-id.md", text: note({ type: "location", title: "No identity" }) },
      { path: "Locations/place.md", text: note({ noteId: place, type: "location", title: "Place" }) },
      {
        path: "Routes/copied-fact.md",
        text: note({
          noteId: routeId,
          type: "route",
          title: "Copied fact route",
          facts: [
            noteFact(copiedFactId, "route-origin", place),
            noteFact(id(222), "route-destination", copiedNoteId),
          ],
        }),
      },
      {
        path: "Timeline/copy.md",
        text: note({
          noteId: id(23),
          type: "scene",
          title: "Copy",
          facts: [noteFact(copiedFactId, "uses-route", routeId)],
        }),
      },
    ]));

    expect(model.excludedSources).toHaveLength(3);
    expect(model.routes[0]).toMatchObject({
      origin: { kind: "unavailable", claims: [{ resolution: { kind: "invalid" } }] },
      destination: { kind: "unavailable", claims: [{ resolution: { kind: "ambiguous" } }] },
    });
    expect(model.journeys[0]).toMatchObject({
      route: { kind: "unavailable", claims: [{ resolution: { kind: "invalid" } }] },
    });
  });

  it("preserves multiple duration claims for later applicability selection", () => {
    const routeId = id(30);
    const model = deriveTravelModel(buildLoreProjectIndex([
      {
        path: "Routes/seasonal.md",
        text: note({
          noteId: routeId,
          type: "route",
          title: "Seasonal route",
          facts: [
            quantityFact(id(301), "travel-duration", "2", "d", { validFrom: "2160" }),
            quantityFact(id(302), "travel-duration", "3", "d", { validFrom: "2170" }),
          ],
        }),
      },
    ]));

    expect(model.routes[0]!.durations).toHaveLength(2);
    expect(model.routes[0]!.durations.every(({ usableShape }) => usableShape)).toBe(true);
  });

  it("does not classify an ordinary event or scene as a journey without uses-route", () => {
    const model = deriveTravelModel(buildLoreProjectIndex([
      {
        path: "Timeline/ordinary-event.md",
        text: note({
          noteId: id(35),
          type: "event",
          title: "Ordinary event",
          facts: [timeFact(id(351), "occurs-at", "2161")],
        }),
      },
      {
        path: "Manuscript/scene.md",
        text: note({ noteId: id(36), type: "scene", title: "Ordinary scene" }),
      },
    ]));

    expect(model.journeys).toEqual([]);
    expect(model.excludedSources).toEqual([]);
  });
});

describe("explicit location containment", () => {
  it("derives a definite ancestor chain only from exact unbounded facts", () => {
    const dock = id(40);
    const city = id(41);
    const planet = id(42);
    const model = deriveTravelModel(buildLoreProjectIndex([
      {
        path: "Locations/dock.md",
        text: note({
          noteId: dock,
          type: "location",
          title: "Dock",
          facts: [noteFact(id(401), "contained-by", city, { certainty: "exact" })],
        }),
      },
      {
        path: "Locations/city.md",
        text: note({
          noteId: city,
          type: "location",
          title: "City",
          facts: [noteFact(id(402), "contained-by", planet, { certainty: "exact" })],
        }),
      },
      { path: "Locations/planet.md", text: note({ noteId: planet, type: "location", title: "Planet" }) },
    ]));

    expect(model.locations.find(({ noteId }) => noteId === dock)?.containmentPaths).toEqual([
      expect.objectContaining({
        kind: "definite",
        noteIds: [dock, city, planet],
        titles: ["Dock", "City", "Planet"],
        evidence: [expect.objectContaining({ factId: id(401) }), expect.objectContaining({ factId: id(402) })],
      }),
    ]);
  });

  it("marks bounded or non-exact links potential and reports cycles", () => {
    const first = id(50);
    const second = id(51);
    const model = deriveTravelModel(buildLoreProjectIndex([
      {
        path: "Locations/first.md",
        text: note({
          noteId: first,
          type: "location",
          title: "First",
          facts: [
            noteFact(id(501), "contained-by", second, {
              certainty: "approximate",
              validFrom: "2160",
            }),
          ],
        }),
      },
      {
        path: "Locations/second.md",
        text: note({
          noteId: second,
          type: "location",
          title: "Second",
          facts: [noteFact(id(502), "contained-by", first, { certainty: "exact" })],
        }),
      },
    ]));

    expect(model.locations.find(({ noteId }) => noteId === first)?.containmentPaths).toEqual([
      expect.objectContaining({
        kind: "cycle",
        noteIds: [first, second, first],
        reason: expect.stringContaining("cycle"),
      }),
    ]);
  });

  it("keeps unresolved direct containers visible with their exact source evidence", () => {
    const place = id(60);
    const missing = id(61);
    const model = deriveTravelModel(buildLoreProjectIndex([
      {
        path: "Locations/place.md",
        text: note({
          noteId: place,
          type: "location",
          title: "Place",
          facts: [noteFact(id(601), "contained-by", missing, { certainty: "exact" })],
        }),
      },
    ]));

    expect(model.locations[0]).toMatchObject({
      directContainers: [{ resolution: { kind: "missing" } }],
      containmentPaths: [
        {
          kind: "unresolved",
          noteIds: [place],
          evidence: [{ factId: id(601), path: "Locations/place.md" }],
        },
      ],
    });
  });

  it("keeps several direct containers as separate paths and bounds traversal", () => {
    const branching = id(70);
    const firstParent = id(71);
    const secondParent = id(72);
    const chainSources = Array.from({ length: 66 }, (_, index) => ({
      path: `Locations/chain-${index.toString().padStart(2, "0")}.md`,
      text: note({
        noteId: id(1000 + index),
        type: "location",
        title: `Chain ${index}`,
        facts: index < 65
          ? [
              noteFact(
                id(2000 + index),
                "contained-by",
                id(1000 + index + 1),
                { certainty: "exact" },
              ),
            ]
          : [],
      }),
    }));
    const model = deriveTravelModel(buildLoreProjectIndex([
      {
        path: "Locations/branching.md",
        text: note({
          noteId: branching,
          type: "location",
          title: "Branching",
          facts: [
            noteFact(id(701), "contained-by", firstParent, { certainty: "exact" }),
            noteFact(id(702), "contained-by", secondParent, { certainty: "exact" }),
          ],
        }),
      },
      { path: "Locations/parent-a.md", text: note({ noteId: firstParent, type: "location", title: "Parent A" }) },
      { path: "Locations/parent-b.md", text: note({ noteId: secondParent, type: "spacecraft", title: "Parent B" }) },
      ...chainSources,
    ]));

    expect(model.locations.find(({ noteId }) => noteId === branching)?.containmentPaths).toEqual([
      expect.objectContaining({ kind: "definite", noteIds: [branching, firstParent] }),
      expect.objectContaining({ kind: "definite", noteIds: [branching, secondParent] }),
    ]);
    expect(model.locations.find(({ noteId }) => noteId === id(1000))?.containmentPaths).toEqual([
      expect.objectContaining({
        kind: "limit",
        noteIds: expect.arrayContaining([id(1000), id(1064)]),
        reason: expect.stringContaining("64 links"),
      }),
    ]);
  });
});
