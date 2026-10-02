import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import { deriveRelationshipModel } from "./model";
import {
  MAX_RELATIONSHIP_REVIEW_FINDINGS,
  deriveRelationshipReviewFindings,
} from "./review";

function id(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
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

function fact(
  factId: string,
  property: string,
  targetId: string,
  options: {
    canon?: string;
    certainty?: string;
    validFrom?: string;
    validTo?: string;
    note?: string;
  } = {},
): string {
  return [
    `  - id: "${factId}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "note"',
    `      id: "${targetId}"`,
    ...(options.canon ? [`    canon: "${options.canon}"`] : []),
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
    ...(options.note ? [`    note: "${options.note}"`] : []),
  ].join("\n");
}

function review(sources: readonly { path: string; text: string }[]) {
  const model = deriveRelationshipModel(buildLoreProjectIndex(sources));
  return deriveRelationshipReviewFindings(model);
}

describe("relationship review findings", () => {
  it("reports bounded self, reciprocal, and longer parent cycles with exact evidence", () => {
    const first = id(1);
    const second = id(2);
    const third = id(3);
    const self = id(101);
    const firstSecond = id(102);
    const secondFirst = id(103);
    const secondThird = id(104);
    const thirdFirst = id(105);
    const result = review([
      {
        path: "Characters/first.md",
        text: note(first, "character", "First", [
          fact(self, "parent-of", first),
          fact(firstSecond, "parent-of", second),
        ]),
      },
      {
        path: "Characters/second.md",
        text: note(second, "character", "Second", [
          fact(secondFirst, "parent-of", first),
          fact(secondThird, "parent-of", third),
        ]),
      },
      {
        path: "Characters/third.md",
        text: note(third, "character", "Third", [
          fact(thirdFirst, "parent-of", first),
        ]),
      },
    ]);

    const cycles = result.findings.filter(
      ({ ruleId }) => ruleId === "relationship.parent.cycle",
    );
    expect(cycles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "review",
          evidence: [expect.objectContaining({ factId: self })],
        }),
        expect.objectContaining({
          evidence: expect.arrayContaining([
            expect.objectContaining({ factId: firstSecond }),
            expect.objectContaining({ factId: secondFirst }),
          ]),
        }),
        expect.objectContaining({
          explanation: expect.stringContaining("64-link"),
          evidence: expect.arrayContaining([
            expect.objectContaining({ factId: firstSecond }),
            expect.objectContaining({ factId: secondThird }),
            expect.objectContaining({ factId: thirdFirst }),
          ]),
        }),
      ]),
    );
    expect(cycles.every(({ id: value }) => value.includes(":v1:"))).toBe(true);
  });

  it("stays quiet for acyclic parent evidence and refuses unresolved edges", () => {
    const first = id(10);
    const second = id(11);
    const missing = id(12);
    const result = review([
      {
        path: "Characters/first.md",
        text: note(first, "character", "First", [
          fact(id(110), "parent-of", second),
          fact(id(111), "parent-of", missing),
        ]),
      },
      {
        path: "Characters/second.md",
        text: note(second, "character", "Second"),
      },
    ]);

    expect(result.findings).toEqual([]);
  });

  it("groups only semantically exact duplicate assertions", () => {
    const ship = id(20);
    const port = id(21);
    const shared = {
      certainty: "exact",
      validFrom: "2160",
      validTo: "2161",
      note: "Primary base",
    };
    const result = review([
      {
        path: "Ships/courier.md",
        text: note(ship, "spacecraft", "Courier", [
          fact(id(201), "home-port", port, shared),
          fact(id(202), "home-port", port, shared),
          fact(id(203), "home-port", port, {
            ...shared,
            note: "Emergency base",
          }),
        ]),
      },
      {
        path: "Locations/port.md",
        text: note(port, "location", "Port"),
      },
    ]);

    const duplicates = result.findings.filter(
      ({ ruleId }) => ruleId === "relationship.assertion.duplicate",
    );
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({
      severity: "review",
      profileNoteIds: [port, ship].sort(),
      evidence: [
        expect.objectContaining({ factId: id(201), sourcePath: "Ships/courier.md" }),
        expect.objectContaining({ factId: id(202), sourcePath: "Ships/courier.md" }),
      ],
    });
  });

  it("reviews one-to-review claims unless validity bounds definitely separate them", () => {
    const ship = id(30);
    const first = id(31);
    const second = id(32);
    const third = id(33);
    const result = review([
      {
        path: "Ships/courier.md",
        text: note(ship, "spacecraft", "Courier", [
          fact(id(301), "operated-by", first, { validTo: "2160" }),
          fact(id(302), "operated-by", second, { validFrom: "2161" }),
          fact(id(303), "operated-by", third, { validFrom: "2160-06" }),
        ]),
      },
      {
        path: "Characters/first.md",
        text: note(first, "character", "First"),
      },
      {
        path: "Characters/second.md",
        text: note(second, "character", "Second"),
      },
      {
        path: "Characters/third.md",
        text: note(third, "character", "Third"),
      },
    ]);

    const applicability = result.findings.filter(
      ({ ruleId }) => ruleId === "relationship.single.applicability",
    );
    expect(applicability).toHaveLength(1);
    expect(applicability[0]!.evidence.map(({ factId }) => factId)).toEqual([
      id(301),
      id(302),
      id(303),
    ]);
    expect(applicability[0]!.explanation).toContain("do not prove simultaneity");
  });

  it("does not require reciprocal or missing relationships", () => {
    const first = id(40);
    const second = id(41);
    const result = review([
      {
        path: "Characters/first.md",
        text: note(first, "character", "First", [
          fact(id(401), "partner-of", second),
        ]),
      },
      {
        path: "Characters/second.md",
        text: note(second, "character", "Second"),
      },
      {
        path: "Characters/unconnected.md",
        text: note(id(42), "character", "Unconnected"),
      },
    ]);

    expect(result.findings).toEqual([]);
  });

  it("orders deterministically and caps the project result", () => {
    const sources = Array.from(
      { length: MAX_RELATIONSHIP_REVIEW_FINDINGS + 2 },
      (_, index) => {
        const noteId = id(1000 + index);
        return {
          path: `Characters/${index.toString().padStart(3, "0")}.md`,
          text: note(noteId, "character", `Character ${index}`, [
            fact(id(2000 + index), "parent-of", noteId),
          ]),
        };
      },
    );
    const result = review([...sources].reverse());

    expect(result.findings).toHaveLength(MAX_RELATIONSHIP_REVIEW_FINDINGS);
    expect(result.omittedCount).toBe(2);
    expect(result.findings[0]!.evidence[0]!.sourcePath).toBe(
      "Characters/000.md",
    );
  });
});
