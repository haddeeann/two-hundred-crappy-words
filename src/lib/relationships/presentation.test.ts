import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import { deriveRelationshipModel } from "./model";
import { presentRelationshipInspector } from "./presentation";
import { deriveRelationshipReviewFindings } from "./review";

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
    ...(facts.length ? ["facts:", ...facts] : []),
    "---",
  ].join("\n");
}

function fact(
  factId: string,
  property: string,
  targetId: string,
  extra: readonly string[] = [],
): string {
  return [
    `  - id: "${factId}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "note"',
    `      id: "${targetId}"`,
    ...extra,
  ].join("\n");
}

describe("relationship inspector presentation", () => {
  it("groups built-in and custom assertions while retaining exact source actions", () => {
    const mara = id(1);
    const fleet = id(2);
    const rival = id(3);
    const memberFact = id(101);
    const customFact = id(102);
    const index = buildLoreProjectIndex([
      {
        path: "Characters/mara.md",
        text: note({
          noteId: mara,
          type: "character",
          title: "Mara",
          facts: [
            fact(memberFact, "member-of", fleet, [
              '    certainty: "exact"',
              "    validFrom:",
              '      kind: "time"',
              '      calendar: "gregorian"',
              '      expression: "2161"',
              '    note: "Command assignment"',
            ]),
            fact(customFact, "rival-of", rival),
          ],
        }),
      },
      {
        path: "Factions/fleet.md",
        text: note({ noteId: fleet, type: "faction", title: "Fleet" }),
      },
      {
        path: "Characters/rival.md",
        text: note({ noteId: rival, type: "character", title: "Rival" }),
      },
    ]);
    const model = deriveRelationshipModel(index);
    const fingerprint = index.documents.get("Characters/mara.md")!.fingerprint;

    expect(
      presentRelationshipInspector(
        model,
        "Characters/mara.md",
        fingerprint,
      ),
    ).toMatchObject({
      kind: "ready",
      summary: "Relationships · 2",
      builtInSections: [
        {
          title: "Member of",
          items: [
            {
              factId: memberFact,
              otherTitle: "Fleet",
              direction: "Outgoing · source is this note",
              certainty: "exact",
              validity: "From 2161 · gregorian",
              note: "Command assignment",
              referencePath: "Factions/fleet.md",
              source: {
                path: "Characters/mara.md",
                fingerprint,
                range: expect.objectContaining({ start: expect.any(Number) }),
              },
            },
          ],
        },
      ],
      customSections: [
        {
          title: "Rival of",
          items: [
            {
              factId: customFact,
              otherTitle: "Rival",
              direction: "Outgoing · source is this note",
            },
          ],
        },
      ],
    });
  });

  it("explains an incoming assertion while keeping the original source", () => {
    const mara = id(10);
    const child = id(11);
    const parentFact = id(110);
    const index = buildLoreProjectIndex([
      {
        path: "Characters/mara.md",
        text: note({
          noteId: mara,
          type: "character",
          title: "Mara",
          facts: [fact(parentFact, "parent-of", child)],
        }),
      },
      {
        path: "Characters/child.md",
        text: note({ noteId: child, type: "character", title: "Child" }),
      },
    ]);
    const presented = presentRelationshipInspector(
      deriveRelationshipModel(index),
      "Characters/child.md",
      index.documents.get("Characters/child.md")!.fingerprint,
    );

    expect(presented).toMatchObject({
      kind: "ready",
      builtInSections: [
        {
          title: "Child of",
          items: [
            {
              factId: parentFact,
              otherTitle: "Mara",
              direction: "Incoming · source is Mara",
              source: { path: "Characters/mara.md" },
            },
          ],
        },
      ],
    });
  });

  it("presents relationship refusals with exact sources instead of guessed links", () => {
    const source = id(20);
    const missing = id(29);
    const missingFact = id(201);
    const index = buildLoreProjectIndex([
      {
        path: "Characters/source.md",
        text: note({
          noteId: source,
          type: "character",
          title: "Source",
          facts: [fact(missingFact, "parent-of", missing)],
        }),
      },
    ]);
    const presented = presentRelationshipInspector(
      deriveRelationshipModel(index),
      "Characters/source.md",
      index.documents.get("Characters/source.md")!.fingerprint,
    );

    expect(presented).toMatchObject({
      kind: "ready",
      summary: "Relationships · 0 · 1 source problem",
      builtInSections: [],
      issues: [
        {
          factId: missingFact,
          message: expect.stringContaining("not present"),
          source: {
            path: "Characters/source.md",
            range: expect.objectContaining({ start: expect.any(Number) }),
          },
        },
      ],
    });
  });

  it("keeps source problems separate from source-linked relationship reviews", () => {
    const first = id(25);
    const second = id(26);
    const firstFact = id(251);
    const secondFact = id(252);
    const index = buildLoreProjectIndex([
      {
        path: "Characters/first.md",
        text: note({
          noteId: first,
          type: "character",
          title: "First",
          facts: [fact(firstFact, "parent-of", second)],
        }),
      },
      {
        path: "Characters/second.md",
        text: note({
          noteId: second,
          type: "character",
          title: "Second",
          facts: [fact(secondFact, "parent-of", first)],
        }),
      },
    ]);
    const model = deriveRelationshipModel(index);
    const reviews = deriveRelationshipReviewFindings(model);
    const presented = presentRelationshipInspector(
      model,
      "Characters/first.md",
      index.documents.get("Characters/first.md")!.fingerprint,
      reviews.findings,
      reviews.omittedCount,
    );

    expect(presented).toMatchObject({
      kind: "ready",
      summary: "Relationships · 2 · 1 relationship review",
      issues: [],
      sourceDiagnostics: [],
      reviews: [
        {
          title: expect.stringContaining("parent cycle"),
          explanation: expect.stringContaining("review bound"),
          rule: "relationship.parent.cycle · v1",
          evidence: expect.arrayContaining([
            expect.objectContaining({
              factId: firstFact,
              relationship: "First —parent of→ Second",
              source: expect.objectContaining({ path: "Characters/first.md" }),
            }),
            expect.objectContaining({
              factId: secondFact,
              relationship: "Second —parent of→ First",
              source: expect.objectContaining({ path: "Characters/second.md" }),
            }),
          ]),
        },
      ],
      omittedReviewCount: 0,
    });
  });

  it("withholds stale evidence and stays quiet for unrelated notes", () => {
    const index = buildLoreProjectIndex([
      {
        path: "Characters/mara.md",
        text: note({ noteId: id(30), type: "character", title: "Mara" }),
      },
      {
        path: "Events/launch.md",
        text: note({ noteId: id(31), type: "event", title: "Launch" }),
      },
      {
        path: "Characters/no-id.md",
        text: note({ type: "character", title: "No identity" }),
      },
    ]);
    const model = deriveRelationshipModel(index);

    expect(
      presentRelationshipInspector(model, "Characters/mara.md", "stale"),
    ).toEqual({ kind: "updating", summary: "Relationships · updating…" });
    expect(presentRelationshipInspector(model, "Events/launch.md")).toEqual({
      kind: "no-active-note",
      summary: "Relationships",
    });
    expect(
      presentRelationshipInspector(model, "Characters/no-id.md"),
    ).toMatchObject({ kind: "unavailable" });
    expect(presentRelationshipInspector(null, null)).toEqual({
      kind: "no-active-note",
      summary: "Relationships",
    });
  });
});
