import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import {
  MAX_RELATIONSHIP_ASSERTIONS_PER_PROFILE,
  MAX_RELATIONSHIP_ISSUES_PER_PROFILE,
  deriveRelationshipModel,
  selectActiveRelationshipProfile,
} from "./model";

function id(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function note({
  noteId,
  type,
  title,
  canon,
  facts = [],
}: {
  noteId?: string;
  type: string;
  title: string;
  canon?: "idea" | "draft" | "canon" | "retired";
  facts?: readonly string[];
}): string {
  return [
    "---",
    ...(noteId ? [`id: "${noteId}"`] : []),
    `type: "${type}"`,
    `title: "${title}"`,
    ...(canon ? [`canon: "${canon}"`] : []),
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
    canon?: "idea" | "draft" | "canon" | "retired";
    certainty?: "exact" | "approximate" | "uncertain";
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
    ...(options.certainty
      ? [`    certainty: "${options.certainty}"`]
      : []),
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

function textFact(factId: string, property: string, text: string): string {
  return [
    `  - id: "${factId}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "text"',
    `      text: "${text}"`,
  ].join("\n");
}

function profile(
  model: ReturnType<typeof deriveRelationshipModel>,
  path: string,
) {
  return model.profiles.find((candidate) => candidate.path === path)!;
}

describe("relationship evidence model", () => {
  it("derives built-in outgoing, incoming, and symmetric readings from one source fact", () => {
    const mara = id(1);
    const ren = id(2);
    const sol = id(3);
    const fleet = id(4);
    const courier = id(5);
    const drive = id(6);
    const port = id(7);
    const model = deriveRelationshipModel(
      buildLoreProjectIndex([
        {
          path: "Characters/mara.md",
          text: note({
            noteId: mara,
            type: "character",
            title: "Mara Venn",
            canon: "canon",
            facts: [
              noteFact(id(101), "member-of", fleet, {
                certainty: "exact",
                validFrom: "2161",
                validTo: "2168",
                note: "Command assignment",
              }),
              noteFact(id(102), "parent-of", ren, { certainty: "exact" }),
              noteFact(id(103), "partner-of", sol, {
                canon: "draft",
                certainty: "uncertain",
              }),
            ],
          }),
        },
        {
          path: "Characters/ren.md",
          text: note({ noteId: ren, type: "character", title: "Ren Venn" }),
        },
        {
          path: "Characters/sol.md",
          text: note({ noteId: sol, type: "character", title: "Sol Aster" }),
        },
        {
          path: "Factions/fleet.md",
          text: note({ noteId: fleet, type: "faction", title: "Outer Fleet" }),
        },
        {
          path: "Ships/courier.md",
          text: note({
            noteId: courier,
            type: "spacecraft",
            title: "Quiet Courier",
            facts: [
              noteFact(id(104), "operated-by", mara),
              noteFact(id(105), "home-port", port),
            ],
          }),
        },
        {
          path: "Technology/drive.md",
          text: note({
            noteId: drive,
            type: "technology",
            title: "Fold Drive",
            facts: [noteFact(id(106), "operated-by", fleet)],
          }),
        },
        {
          path: "Locations/port.md",
          text: note({ noteId: port, type: "location", title: "Nacre Port" }),
        },
      ]),
    );

    expect(model.excludedSources).toEqual([]);
    expect(profile(model, "Characters/mara.md").assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factId: id(101),
          displayLabel: "Member of",
          perspective: "outgoing",
          other: expect.objectContaining({ noteId: fleet, noteType: "faction" }),
          effectiveCanon: "canon",
          certainty: "exact",
          validFrom: expect.objectContaining({ expression: "2161" }),
          validTo: expect.objectContaining({ expression: "2168" }),
          note: "Command assignment",
          evidence: expect.objectContaining({
            sourcePath: "Characters/mara.md",
            sourceFingerprint: expect.any(String),
            sourceRange: expect.objectContaining({ line: expect.any(Number) }),
          }),
        }),
        expect.objectContaining({
          factId: id(103),
          displayLabel: "Partner of",
          perspective: "symmetric",
          effectiveCanon: "draft",
          certainty: "uncertain",
        }),
        expect.objectContaining({
          factId: id(104),
          displayLabel: "Operates",
          perspective: "incoming",
          other: expect.objectContaining({ noteId: courier }),
        }),
      ]),
    );
    expect(profile(model, "Characters/ren.md").assertions).toEqual([
      expect.objectContaining({
        factId: id(102),
        displayLabel: "Child of",
        perspective: "incoming",
        other: expect.objectContaining({ noteId: mara }),
      }),
    ]);
    expect(profile(model, "Characters/sol.md").assertions).toEqual([
      expect.objectContaining({
        factId: id(103),
        displayLabel: "Partner of",
        perspective: "symmetric",
        source: expect.objectContaining({ noteId: mara }),
      }),
    ]);
    expect(profile(model, "Factions/fleet.md").assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factId: id(101), displayLabel: "Has member" }),
        expect.objectContaining({ factId: id(106), displayLabel: "Operates" }),
      ]),
    );
    expect(profile(model, "Locations/port.md").assertions).toEqual([
      expect.objectContaining({
        factId: id(105),
        displayLabel: "Home to",
        perspective: "incoming",
      }),
    ]);
    expect(profile(model, "Technology/drive.md").assertions).toEqual([
      expect.objectContaining({
        factId: id(106),
        displayLabel: "Operated by",
        perspective: "outgoing",
      }),
    ]);
  });

  it("keeps custom entity links literal and directional without absorbing specialized facts", () => {
    const character = id(20);
    const faction = id(21);
    const location = id(22);
    const species = id(23);
    const missing = id(29);
    const customFactId = id(201);
    const model = deriveRelationshipModel(
      buildLoreProjectIndex([
        {
          path: "Characters/mara.md",
          text: note({
            noteId: character,
            type: "character",
            title: "Mara",
            facts: [
              noteFact(customFactId, "sworn-to", faction),
              noteFact(id(202), "located-at", location),
              noteFact(id(203), "species", species),
              noteFact(id(204), "unanswered-by", missing),
            ],
          }),
        },
        {
          path: "Factions/fleet.md",
          text: note({ noteId: faction, type: "faction", title: "Fleet" }),
        },
        {
          path: "Locations/port.md",
          text: note({ noteId: location, type: "location", title: "Port" }),
        },
        {
          path: "Species/human.md",
          text: note({ noteId: species, type: "species", title: "Human" }),
        },
      ]),
    );

    expect(profile(model, "Characters/mara.md").assertions).toEqual([
      expect.objectContaining({
        factId: customFactId,
        property: "sworn-to",
        propertyLabel: "Sworn to",
        displayLabel: "Sworn to",
        customProperty: true,
        perspective: "outgoing",
      }),
    ]);
    expect(profile(model, "Factions/fleet.md").assertions).toEqual([
      expect.objectContaining({
        factId: customFactId,
        displayLabel: "Sworn to",
        customProperty: true,
        perspective: "incoming",
        source: expect.objectContaining({ noteId: character }),
      }),
    ]);
    expect(profile(model, "Locations/port.md").assertions).toEqual([]);
    expect(profile(model, "Characters/mara.md").issues).toEqual([]);
  });

  it("keeps independent reciprocal facts separate and does not duplicate a self-edge", () => {
    const first = id(25);
    const second = id(26);
    const firstFact = id(251);
    const secondFact = id(252);
    const selfFact = id(253);
    const model = deriveRelationshipModel(
      buildLoreProjectIndex([
        {
          path: "Characters/first.md",
          text: note({
            noteId: first,
            type: "character",
            title: "First",
            facts: [
              noteFact(firstFact, "partner-of", second),
              noteFact(selfFact, "parent-of", first),
            ],
          }),
        },
        {
          path: "Characters/second.md",
          text: note({
            noteId: second,
            type: "character",
            title: "Second",
            facts: [noteFact(secondFact, "partner-of", first)],
          }),
        },
      ]),
    );
    const firstProfile = profile(model, "Characters/first.md");

    expect(
      firstProfile.assertions.filter(
        ({ property }) => property === "partner-of",
      ),
    ).toEqual([
      expect.objectContaining({
        factId: firstFact,
        source: expect.objectContaining({ noteId: first }),
      }),
      expect.objectContaining({
        factId: secondFact,
        source: expect.objectContaining({ noteId: second }),
      }),
    ]);
    expect(
      firstProfile.assertions.filter(({ factId }) => factId === selfFact),
    ).toEqual([
      expect.objectContaining({
        perspective: "outgoing",
        source: expect.objectContaining({ noteId: first }),
        target: expect.objectContaining({ noteId: first }),
      }),
    ]);
  });

  it("keeps every built-in resolution refusal explicit without drawing a guessed edge", () => {
    const character = id(30);
    const child = id(31);
    const faction = id(32);
    const duplicatedTarget = id(33);
    const missingTarget = id(39);
    const duplicatedFact = id(301);
    const model = deriveRelationshipModel(
      buildLoreProjectIndex([
        {
          path: "Characters/source.md",
          text: note({
            noteId: character,
            type: "character",
            title: "Source",
            facts: [
              noteFact(duplicatedFact, "parent-of", child),
              noteFact(id(302), "parent-of", missingTarget),
              noteFact(id(303), "parent-of", duplicatedTarget),
              noteFact(id(304), "parent-of", faction),
              textFact(id(305), "parent-of", "not a note"),
            ],
          }),
        },
        {
          path: "Characters/child.md",
          text: note({ noteId: child, type: "character", title: "Child" }),
        },
        {
          path: "Factions/faction.md",
          text: note({ noteId: faction, type: "faction", title: "Faction" }),
        },
        {
          path: "Characters/copy-a.md",
          text: note({
            noteId: duplicatedTarget,
            type: "character",
            title: "Copy A",
          }),
        },
        {
          path: "Characters/copy-b.md",
          text: note({
            noteId: duplicatedTarget,
            type: "character",
            title: "Copy B",
          }),
        },
        {
          path: "Locations/wrong-subject.md",
          text: note({
            noteId: id(34),
            type: "location",
            title: "Wrong subject",
            facts: [noteFact(id(306), "parent-of", child)],
          }),
        },
        {
          path: "Characters/copied-fact.md",
          text: note({
            noteId: id(35),
            type: "character",
            title: "Copied fact",
            facts: [noteFact(duplicatedFact, "partner-of", child)],
          }),
        },
      ]),
    );

    expect(profile(model, "Characters/source.md").assertions).toEqual([]);
    expect(profile(model, "Characters/source.md").issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "duplicate-fact-id",
          factId: duplicatedFact,
        }),
        expect.objectContaining({ kind: "missing-target", factId: id(302) }),
        expect.objectContaining({ kind: "ambiguous-target", factId: id(303) }),
        expect.objectContaining({ kind: "wrong-target-type", factId: id(304) }),
        expect.objectContaining({ kind: "invalid-value", factId: id(305) }),
      ]),
    );
    expect(profile(model, "Locations/wrong-subject.md").issues).toEqual([
      expect.objectContaining({ kind: "wrong-subject-type", factId: id(306) }),
    ]);
    expect(profile(model, "Characters/child.md").assertions).toEqual([]);
  });

  it("excludes unusable source identities and retains malformed metadata diagnostics", () => {
    const copiedId = id(40);
    const target = id(41);
    const validSource = id(42);
    const model = deriveRelationshipModel(
      buildLoreProjectIndex([
        {
          path: "Characters/no-id.md",
          text: note({ type: "character", title: "No identity" }),
        },
        {
          path: "Characters/copy-a.md",
          text: note({ noteId: copiedId, type: "character", title: "Copy A" }),
        },
        {
          path: "Characters/copy-b.md",
          text: note({ noteId: copiedId, type: "character", title: "Copy B" }),
        },
        {
          path: "Characters/target.md",
          text: note({ noteId: target, type: "character", title: "Target" }),
        },
        {
          path: "Characters/malformed-neighbor.md",
          text: [
            "---",
            `id: "${validSource}"`,
            'type: "character"',
            'title: "Malformed neighbor"',
            "facts:",
            '  - property: "partner-of"',
            "    value:",
            '      kind: "note"',
            `      id: "${target}"`,
            noteFact(id(401), "partner-of", target),
            "---",
          ].join("\n"),
        },
      ]),
    );

    expect(model.excludedSources).toEqual([
      expect.objectContaining({ path: "Characters/copy-a.md", noteId: copiedId }),
      expect.objectContaining({ path: "Characters/copy-b.md", noteId: copiedId }),
      expect.objectContaining({ path: "Characters/no-id.md", noteId: null }),
    ]);
    expect(
      profile(model, "Characters/malformed-neighbor.md").sourceDiagnostics,
    ).not.toEqual([]);
    expect(profile(model, "Characters/malformed-neighbor.md").assertions).toEqual([
      expect.objectContaining({ factId: id(401), perspective: "symmetric" }),
    ]);
  });

  it("sorts deterministically, caps one neighborhood, and reports the omitted count", () => {
    const source = id(50);
    const issueSource = id(51);
    const targets = Array.from(
      { length: MAX_RELATIONSHIP_ASSERTIONS_PER_PROFILE + 5 },
      (_, index) => ({
        noteId: id(1000 + index),
        title: `Target ${index.toString().padStart(3, "0")}`,
      }),
    );
    const model = deriveRelationshipModel(
      buildLoreProjectIndex([
        {
          path: "Characters/source.md",
          text: note({
            noteId: source,
            type: "character",
            title: "Source",
            facts: [...targets]
              .reverse()
              .map((target, index) =>
                noteFact(id(2000 + index), "parent-of", target.noteId),
              ),
          }),
        },
        {
          path: "Characters/issues.md",
          text: note({
            noteId: issueSource,
            type: "character",
            title: "Issues",
            facts: Array.from(
              { length: MAX_RELATIONSHIP_ISSUES_PER_PROFILE + 1 },
              (_, index) =>
                textFact(id(3000 + index), "parent-of", `Text ${index}`),
            ),
          }),
        },
        ...targets.map((target) => ({
          path: `Characters/${target.title}.md`,
          text: note({
            noteId: target.noteId,
            type: "character",
            title: target.title,
          }),
        })),
      ]),
    );
    const sourceProfile = profile(model, "Characters/source.md");

    expect(sourceProfile.assertions).toHaveLength(
      MAX_RELATIONSHIP_ASSERTIONS_PER_PROFILE,
    );
    expect(sourceProfile.omittedAssertionCount).toBe(5);
    expect(sourceProfile.assertions.map(({ other }) => other.title)).toEqual(
      targets
        .slice(0, MAX_RELATIONSHIP_ASSERTIONS_PER_PROFILE)
        .map(({ title }) => title),
    );
    expect(profile(model, "Characters/issues.md").issues).toHaveLength(
      MAX_RELATIONSHIP_ISSUES_PER_PROFILE,
    );
    expect(profile(model, "Characters/issues.md").omittedIssueCount).toBe(1);
  });

  it("suppresses stale active evidence until its indexed fingerprint catches up", () => {
    const activePath = "Characters/mara.md";
    const model = deriveRelationshipModel(
      buildLoreProjectIndex([
        {
          path: activePath,
          text: note({ noteId: id(60), type: "character", title: "Mara" }),
        },
        {
          path: "Events/launch.md",
          text: note({ noteId: id(61), type: "event", title: "Launch" }),
        },
      ]),
    );
    const active = profile(model, activePath);

    expect(selectActiveRelationshipProfile(model, activePath, "stale")).toEqual({
      kind: "updating",
      path: activePath,
    });
    expect(
      selectActiveRelationshipProfile(model, activePath, active.fingerprint),
    ).toMatchObject({ kind: "ready", profile: { path: activePath } });
    expect(
      selectActiveRelationshipProfile(model, "Events/launch.md"),
    ).toMatchObject({ kind: "unavailable" });
    expect(selectActiveRelationshipProfile(model, null)).toEqual({
      kind: "no-active-note",
    });
  });
});
