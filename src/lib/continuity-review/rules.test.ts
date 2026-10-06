import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import {
  CONTINUITY_SINGLE_APPLICABILITY_RULE_ID,
  TIMELINE_LIFESPAN_ORDER_RULE_ID,
  deriveNewContinuityReviewFindings,
} from "./rules";

function id(value: number): string {
  return `70000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

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
    ...(facts.length ? ["facts:", ...facts] : []),
    "---",
  ].join("\n");
}

function noteFact(
  factId: string,
  property: string,
  targetId: string,
  options: {
    certainty?: string;
    canon?: string;
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
    `    certainty: "${options.certainty ?? "exact"}"`,
    ...(options.canon ? [`    canon: "${options.canon}"`] : []),
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

function timeFact(
  factId: string,
  property: "born" | "died",
  expression: string,
  options: { certainty?: string; canon?: string } = {},
): string {
  return [
    `  - id: "${factId}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "time"',
    '      calendar: "gregorian"',
    `      expression: "${expression}"`,
    `    certainty: "${options.certainty ?? "exact"}"`,
    ...(options.canon ? [`    canon: "${options.canon}"`] : []),
  ].join("\n");
}

describe("new continuity review rules", () => {
  it("reviews overlapping one-to-review facts and stays quiet when bounds separate them", () => {
    const character = id(1);
    const firstPlace = id(2);
    const secondPlace = id(3);
    const index = buildLoreProjectIndex([
      {
        path: "Characters/mara.md",
        text: note(character, "character", "Mara", [
          noteFact(id(101), "located-at", firstPlace, { validTo: "2160" }),
          noteFact(id(102), "located-at", secondPlace, { validFrom: "2159" }),
          noteFact(id(103), "species", id(4), { validTo: "2100" }),
          noteFact(id(104), "species", id(5), { validFrom: "2101" }),
        ]),
      },
      { path: "Locations/one.md", text: note(firstPlace, "location", "One") },
      { path: "Locations/two.md", text: note(secondPlace, "location", "Two") },
      { path: "Species/one.md", text: note(id(4), "species", "First species") },
      { path: "Species/two.md", text: note(id(5), "species", "Second species") },
    ]);

    const findings = deriveNewContinuityReviewFindings(index, []);
    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: CONTINUITY_SINGLE_APPLICABILITY_RULE_ID,
        ruleVersion: 1,
        severity: "review",
        subjectNoteIds: [character],
        evidence: [
          expect.objectContaining({ stableId: `fact:${id(101)}` }),
          expect.objectContaining({ stableId: `fact:${id(102)}` }),
        ],
      }),
    ]);
  });

  it("reserves lifespan contradiction for canon exact evidence", () => {
    const canonCharacter = id(10);
    const draftCharacter = id(11);
    const index = buildLoreProjectIndex([
      {
        path: "Characters/canon.md",
        text: note(canonCharacter, "character", "Canon traveler", [
          timeFact(id(110), "born", "2200"),
          timeFact(id(111), "died", "2100"),
        ]),
      },
      {
        path: "Characters/draft.md",
        text: note(draftCharacter, "character", "Draft traveler", [
          timeFact(id(112), "born", "2200"),
          timeFact(id(113), "died", "2100"),
        ], "draft"),
      },
    ]);

    const lifespan = deriveNewContinuityReviewFindings(index, [])
      .filter(({ ruleId }) => ruleId === TIMELINE_LIFESPAN_ORDER_RULE_ID);
    expect(lifespan).toEqual([
      expect.objectContaining({
        severity: "contradiction",
        subjectNoteIds: [canonCharacter],
      }),
      expect.objectContaining({
        severity: "review",
        subjectNoteIds: [draftCharacter],
      }),
    ]);
    expect(lifespan[0]!.id).toBe(
      `${TIMELINE_LIFESPAN_ORDER_RULE_ID}:v1:fact:${id(110)}:fact:${id(111)}`,
    );
  });

  it("does not derive ordinary findings from retired or unusable facts", () => {
    const character = id(20);
    const index = buildLoreProjectIndex([
      {
        path: "Characters/retired.md",
        text: note(character, "character", "Retired record", [
          timeFact(id(120), "born", "2200"),
          timeFact(id(121), "died", "2100"),
        ], "retired"),
      },
      {
        path: "Characters/wrong-shape.md",
        text: note(id(21), "character", "Wrong shape", [
          noteFact(id(122), "born", id(22)),
          timeFact(id(123), "died", "2100"),
        ]),
      },
    ]);

    expect(deriveNewContinuityReviewFindings(index, [])).toEqual([]);
  });

  it("leaves relationship-covered one-to-review properties to their existing rule", () => {
    const ship = id(30);
    const first = id(31);
    const second = id(32);
    const index = buildLoreProjectIndex([
      {
        path: "Ships/ship.md",
        text: note(ship, "spacecraft", "Ship", [
          noteFact(id(130), "home-port", first),
          noteFact(id(131), "home-port", second),
        ]),
      },
      { path: "Locations/first.md", text: note(first, "location", "First") },
      { path: "Locations/second.md", text: note(second, "location", "Second") },
    ]);

    expect(deriveNewContinuityReviewFindings(index, [])).toEqual([]);
  });
});
