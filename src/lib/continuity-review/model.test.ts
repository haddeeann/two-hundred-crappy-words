import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import type { ManuscriptStructure } from "$lib/manuscript/structure";
import { deriveRelationshipModel } from "$lib/relationships/model";
import { deriveRelationshipReviewFindings } from "$lib/relationships/review";
import { deriveTimelineModel } from "$lib/timeline/model";
import { deriveJourneyAnalyses } from "$lib/travel/journey";
import { deriveTravelModel } from "$lib/travel/model";
import { deriveTravelPresenceFindings } from "$lib/travel/presence";
import { deriveContinuityReview } from "./model";

function id(value: number): string {
  return `80000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function note(
  noteId: string,
  type: string,
  title: string,
  facts: readonly string[] = [],
  canon = "canon",
): string {
  return [
    "---",
    `id: "${noteId}"`,
    `type: "${type}"`,
    `title: "${title}"`,
    `canon: "${canon}"`,
    ...(facts.length ? ["facts:", ...facts] : []),
    "---",
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

function noteFact(factId: string, property: string, targetId: string): string {
  return [
    `  - id: "${factId}"`,
    `    property: "${property}"`,
    "    value:",
    '      kind: "note"',
    `      id: "${targetId}"`,
    '    certainty: "exact"',
  ].join("\n");
}

function manuscript(sceneId: string): ManuscriptStructure {
  return {
    formatVersion: 1,
    manuscripts: [{
      id: id(900),
      title: "Selected story",
      items: [{
        id: id(901),
        kind: "chapter",
        title: "Signals",
        includeInCompile: true,
        storyDate: "This remains freeform and non-semantic",
        children: [{
          id: id(902),
          kind: "scene",
          title: "Arrival",
          source: { path: "Manuscript/arrival.md", noteId: sceneId },
          includeInCompile: true,
          location: "Not interpreted as a location fact",
        }],
      }],
    }],
  };
}

describe("unified continuity review model", () => {
  it("normalizes findings, applies manuscript membership, and keeps all evidence", () => {
    const sceneId = id(1);
    const characterId = id(2);
    const unrelatedId = id(3);
    const index = buildLoreProjectIndex([
      {
        path: "Manuscript/arrival.md",
        text: note(sceneId, "scene", "Arrival", [
          timeFact(id(101), "occurs-at", "2140-01-01"),
          noteFact(id(102), "participant", characterId),
          timeFact(id(103), "located-at", "2140-01-01"),
        ]),
      },
      {
        path: "Characters/mara.md",
        text: note(characterId, "character", "Mara", [
          timeFact(id(104), "born", "2150-01-01"),
        ]),
      },
      {
        path: "Characters/unrelated.md",
        text: note(unrelatedId, "character", "Unrelated", [
          timeFact(id(105), "born", "2200"),
          timeFact(id(106), "died", "2100"),
        ]),
      },
    ]);
    const structure = manuscript(sceneId);
    const timeline = deriveTimelineModel(index, null, structure);
    const travel = deriveTravelModel(index);
    const analyses = deriveJourneyAnalyses(travel, []);
    const relationshipFindings = deriveRelationshipReviewFindings(
      deriveRelationshipModel(index),
      [],
    );
    const travelPresenceFindings = deriveTravelPresenceFindings(
      index,
      travel,
      analyses,
      [],
    );
    const base = {
      index,
      calendars: [],
      relationshipFindings,
      travelPresenceFindings,
      timeline,
      travelAnalyses: analyses,
      manuscript: structure,
    } as const;

    const world = deriveContinuityReview(base);
    expect(world.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: "timeline.appearance.before-birth",
        severity: "contradiction",
        subjectNoteIds: [sceneId, characterId].sort(),
        evidence: expect.arrayContaining([
          expect.objectContaining({ stableId: `fact:${id(101)}` }),
          expect.objectContaining({ stableId: `fact:${id(102)}` }),
          expect.objectContaining({ stableId: `fact:${id(104)}` }),
        ]),
      }),
      expect.objectContaining({
        ruleId: "timeline.lifespan.order",
        subjectNoteIds: [unrelatedId],
      }),
    ]));
    expect(world.sourceProblems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: "reference",
        summary: expect.stringContaining("unusable located at"),
      }),
    ]));

    const selected = deriveContinuityReview({
      ...base,
      scope: { kind: "manuscript", manuscriptId: id(900) },
    });
    expect(selected.findings.map(({ ruleId }) => ruleId)).toContain(
      "timeline.appearance.before-birth",
    );
    expect(selected.findings.map(({ ruleId }) => ruleId)).not.toContain(
      "timeline.lifespan.order",
    );
    expect(selected.sourceProblems).toHaveLength(1);
    expect(selected.sourceProblems[0]!.evidence[0]!.path).toBe(
      "Manuscript/arrival.md",
    );
  });

  it("excludes retired evidence from normalized ordinary findings", () => {
    const shipId = id(20);
    const firstPort = id(21);
    const secondPort = id(22);
    const index = buildLoreProjectIndex([
      {
        path: "Ships/retired.md",
        text: note(shipId, "spacecraft", "Retired ship", [
          noteFact(id(120), "home-port", firstPort),
          noteFact(id(121), "home-port", secondPort),
        ], "retired"),
      },
      { path: "Locations/first.md", text: note(firstPort, "location", "First") },
      { path: "Locations/second.md", text: note(secondPort, "location", "Second") },
    ]);
    const relationships = deriveRelationshipReviewFindings(
      deriveRelationshipModel(index),
      [],
    );
    expect(relationships.findings).toHaveLength(1);
    const timeline = deriveTimelineModel(index, null, null);
    const travel = deriveTravelModel(index);
    const analyses = deriveJourneyAnalyses(travel, []);
    const result = deriveContinuityReview({
      index,
      calendars: [],
      relationshipFindings: relationships,
      travelPresenceFindings: deriveTravelPresenceFindings(index, travel, analyses, []),
      timeline,
      travelAnalyses: analyses,
      manuscript: null,
    });

    expect(result.findings).toEqual([]);
  });
});
