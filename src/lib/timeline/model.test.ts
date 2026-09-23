import { describe, expect, it } from "vitest";

import { buildLoreProjectIndex } from "$lib/lore/index";
import type { ManuscriptStructure } from "$lib/manuscript/structure";
import {
  TIMELINE_FORMAT,
  TIMELINE_FORMAT_VERSION,
  type TimelineProject,
} from "./format";
import { deriveTimelineModel } from "./model";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const SCENE_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";
const MISSING_ID = "55555555-5555-4555-8555-555555555555";
const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const TRACK_ONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TRACK_TWO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let factSequence = 0;

function factId(): string {
  factSequence += 1;
  return `00000000-0000-4000-8000-${String(factSequence).padStart(12, "0")}`;
}

function timeFact(
  property: "occurs-at" | "ends-at",
  expression: string,
  options: {
    id?: string;
    calendar?: string;
    certainty?: "exact" | "approximate" | "uncertain";
    validFrom?: string;
  } = {},
): string {
  return [
    `  - id: ${JSON.stringify(options.id ?? factId())}`,
    `    property: ${JSON.stringify(property)}`,
    "    value:",
    '      kind: "time"',
    `      calendar: ${JSON.stringify(options.calendar ?? "gregorian")}`,
    `      expression: ${JSON.stringify(expression)}`,
    ...(options.certainty ? [`    certainty: ${JSON.stringify(options.certainty)}`] : []),
    ...(options.validFrom
      ? [
          "    validFrom:",
          '      kind: "time"',
          '      calendar: "gregorian"',
          `      expression: ${JSON.stringify(options.validFrom)}`,
        ]
      : []),
  ].join("\n");
}

function textTimeProperty(property: "occurs-at" | "ends-at", text: string): string {
  return [
    `  - id: ${JSON.stringify(factId())}`,
    `    property: ${JSON.stringify(property)}`,
    "    value:",
    '      kind: "text"',
    `      text: ${JSON.stringify(text)}`,
  ].join("\n");
}

function characterTimeFact(
  property: "born" | "died",
  expression: string,
  options: {
    id?: string;
    calendar?: string;
    certainty?: "exact" | "approximate" | "uncertain";
  } = {},
): string {
  return [
    `  - id: ${JSON.stringify(options.id ?? factId())}`,
    `    property: ${JSON.stringify(property)}`,
    "    value:",
    '      kind: "time"',
    `      calendar: ${JSON.stringify(options.calendar ?? "gregorian")}`,
    `      expression: ${JSON.stringify(expression)}`,
    ...(options.certainty ? [`    certainty: ${JSON.stringify(options.certainty)}`] : []),
  ].join("\n");
}

function participantFact(
  targetId: string,
  options: {
    id?: string;
    certainty?: "exact" | "approximate" | "uncertain";
    validFrom?: string;
    validTo?: string;
  } = {},
): string {
  return [
    `  - id: ${JSON.stringify(options.id ?? factId())}`,
    '    property: "participant"',
    "    value:",
    '      kind: "note"',
    `      id: ${JSON.stringify(targetId)}`,
    ...(options.certainty ? [`    certainty: ${JSON.stringify(options.certainty)}`] : []),
    ...(options.validFrom
      ? [
          "    validFrom:",
          '      kind: "time"',
          '      calendar: "gregorian"',
          `      expression: ${JSON.stringify(options.validFrom)}`,
        ]
      : []),
    ...(options.validTo
      ? [
          "    validTo:",
          '      kind: "time"',
          '      calendar: "gregorian"',
          `      expression: ${JSON.stringify(options.validTo)}`,
        ]
      : []),
  ].join("\n");
}

function note({
  id,
  type,
  title,
  facts = [],
  canon,
}: {
  id?: string;
  type: string;
  title: string;
  facts?: string[];
  canon?: "idea" | "draft" | "canon" | "retired";
}): string {
  return [
    "---",
    ...(id ? [`id: ${JSON.stringify(id)}`] : []),
    `type: ${JSON.stringify(type)}`,
    `title: ${JSON.stringify(title)}`,
    ...(canon ? [`canon: ${JSON.stringify(canon)}`] : []),
    ...(facts.length > 0 ? ["facts:", ...facts] : []),
    "---",
    "",
    `# ${title}`,
  ].join("\n");
}

function timeline(overrides: Partial<TimelineProject> = {}): TimelineProject {
  return {
    format: TIMELINE_FORMAT,
    formatVersion: TIMELINE_FORMAT_VERSION,
    projectId: PROJECT_ID,
    calendars: [],
    tracks: [],
    ...overrides,
  };
}

function manuscript(): ManuscriptStructure {
  return {
    formatVersion: 1,
    manuscripts: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        title: "The Patient Comet",
        items: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            kind: "chapter",
            title: "Signals",
            overview: { path: "Manuscript/Signals/chapter.md", noteId: CHAPTER_ID },
            includeInCompile: true,
            storyDate: "Orbit 41, ash season",
            children: [
              {
                id: "88888888-8888-4888-8888-888888888888",
                kind: "scene",
                title: "The buried antenna",
                source: { path: "Manuscript/Signals/antenna.md", noteId: SCENE_ID },
                includeInCompile: true,
                storyDate: "Three nights after the storm",
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("source-linked timeline derivation", () => {
  it("derives one computable subject per unique stable event, scene, or chapter", () => {
    factSequence = 0;
    const occurrenceId = factId();
    const index = buildLoreProjectIndex([
      {
        path: "Timeline/landing.md",
        text: note({
          id: EVENT_ID,
          type: "event",
          title: "Landing",
          canon: "canon",
          facts: [timeFact("occurs-at", "2160-02", { id: occurrenceId, certainty: "exact" })],
        }),
      },
      {
        path: "Timeline/later.md",
        text: note({
          id: SCENE_ID,
          type: "scene",
          title: "Later",
          facts: [timeFact("occurs-at", "2160-03-01")],
        }),
      },
      {
        path: "Lore/mara.md",
        text: note({ id: OTHER_ID, type: "character", title: "Mara" }),
      },
    ]);

    const model = deriveTimelineModel(index, null, null);

    expect(model.subjects).toHaveLength(2);
    expect(model.subjects[0]).toMatchObject({
      noteId: EVENT_ID,
      status: "computable",
      noteCanon: "canon",
      evidence: [{ id: occurrenceId, effectiveCanon: "canon", certainty: "exact" }],
      issues: [],
    });
    expect(model.calendarGroups).toEqual([
      { axis: "gregorian", subjectIds: [EVENT_ID, SCENE_ID] },
    ]);
    expect(model.needsTimeSubjectIds).toEqual([]);
    expect(model.unassignedSubjectIds).toEqual([EVENT_ID, SCENE_ID]);
  });

  it("combines one occurrence and one end while retaining both exact source ranges", () => {
    factSequence = 10;
    const startId = factId();
    const endId = factId();
    const index = buildLoreProjectIndex([
      {
        path: "Timeline/storm.md",
        text: note({
          id: EVENT_ID,
          type: "event",
          title: "Storm",
          facts: [
            timeFact("occurs-at", "2160-02", { id: startId }),
            timeFact("ends-at", "2160-03-02", { id: endId }),
          ],
        }),
      },
    ]);
    const model = deriveTimelineModel(index, null, null);
    const subject = model.subjects[0]!;

    expect(subject).toMatchObject({
      status: "computable",
      range: {
        expression: "2160-02/2160-03-02",
        startPrecision: "month",
        endPrecision: "day",
        interval: true,
      },
      evidence: [{ id: startId }, { id: endId }],
    });
    expect(subject.evidence.every(({ range }) => range.end > range.start)).toBe(true);
  });

  it("keeps ambiguous and invalid source shapes in Needs time with fact-linked reasons", () => {
    factSequence = 20;
    const intervalId = factId();
    const endId = factId();
    const invalidId = factId();
    const index = buildLoreProjectIndex([
      {
        path: "Timeline/interval.md",
        text: note({
          id: EVENT_ID,
          type: "event",
          title: "Interval",
          facts: [
            timeFact("occurs-at", "2160/2161", { id: intervalId }),
            timeFact("ends-at", "2162", { id: endId }),
          ],
        }),
      },
      {
        path: "Timeline/invalid.md",
        text: note({
          id: SCENE_ID,
          type: "scene",
          title: "Invalid",
          facts: [textTimeProperty("occurs-at", "sometime" ).replace(/00000000-0000-4000-8000-[0-9]{12}/u, invalidId)],
        }),
      },
      {
        path: "Timeline/undated.md",
        text: note({ id: CHAPTER_ID, type: "chapter", title: "Undated" }),
      },
    ]);
    const model = deriveTimelineModel(index, null, null);

    expect(model.needsTimeSubjectIds).toEqual([EVENT_ID, SCENE_ID, CHAPTER_ID]);
    expect(model.subjects.find(({ noteId }) => noteId === EVENT_ID)?.issues).toEqual([
      expect.objectContaining({
        code: "interval-with-end",
        factIds: [intervalId, endId],
        ranges: [expect.any(Object), expect.any(Object)],
      }),
    ]);
    expect(model.subjects.find(({ noteId }) => noteId === SCENE_ID)?.issues).toEqual([
      expect.objectContaining({ code: "invalid-fact-shape", factIds: [invalidId] }),
    ]);
    expect(model.subjects.find(({ noteId }) => noteId === CHAPTER_ID)?.issues).toEqual([
      expect.objectContaining({ code: "missing-occurrence", factIds: [] }),
    ]);
  });

  it("refuses multiple claims, validity bounds, end-only dates, and reversed spans", () => {
    factSequence = 30;
    const index = buildLoreProjectIndex([
      {
        path: "Timeline/multiple.md",
        text: note({
          id: EVENT_ID,
          type: "event",
          title: "Multiple",
          facts: [timeFact("occurs-at", "2160"), timeFact("occurs-at", "2161")],
        }),
      },
      {
        path: "Timeline/bounded.md",
        text: note({
          id: SCENE_ID,
          type: "scene",
          title: "Bounded",
          facts: [timeFact("occurs-at", "2160", { validFrom: "2159" })],
        }),
      },
      {
        path: "Timeline/end-only.md",
        text: note({
          id: CHAPTER_ID,
          type: "chapter",
          title: "End only",
          facts: [timeFact("ends-at", "2160")],
        }),
      },
      {
        path: "Timeline/reversed.md",
        text: note({
          id: OTHER_ID,
          type: "event",
          title: "Reversed",
          facts: [timeFact("occurs-at", "2161"), timeFact("ends-at", "2160")],
        }),
      },
    ]);
    const model = deriveTimelineModel(index, null, null);
    const issueCodes = new Map(
      model.subjects.map(({ noteId, issues }) => [noteId, issues.map(({ code }) => code)]),
    );

    expect(issueCodes.get(EVENT_ID)).toEqual(["multiple-occurrences"]);
    expect(issueCodes.get(SCENE_ID)).toEqual(["invalid-fact-shape"]);
    expect(issueCodes.get(CHAPTER_ID)).toEqual(["end-without-occurrence"]);
    expect(issueCodes.get(OTHER_ID)).toEqual(["reversed-span"]);
  });

  it("excludes missing and duplicated stable note identities without choosing a source", () => {
    factSequence = 40;
    const duplicateId = EVENT_ID;
    const index = buildLoreProjectIndex([
      {
        path: "Timeline/no-id.md",
        text: note({ type: "event", title: "No identity", facts: [timeFact("occurs-at", "2160")] }),
      },
      {
        path: "Timeline/one.md",
        text: note({ id: duplicateId, type: "event", title: "One", facts: [timeFact("occurs-at", "2160")] }),
      },
      {
        path: "Timeline/two.md",
        text: note({ id: duplicateId, type: "event", title: "Two", facts: [timeFact("occurs-at", "2161")] }),
      },
    ]);
    const model = deriveTimelineModel(index, null, null);

    expect(model.subjects).toEqual([]);
    expect(model.excludedSources).toEqual([
      expect.objectContaining({ path: "Timeline/no-id.md", noteId: null, reason: expect.stringContaining("no stable") }),
      expect.objectContaining({ path: "Timeline/one.md", noteId: duplicateId, reason: expect.stringContaining("more than one") }),
      expect.objectContaining({ path: "Timeline/two.md", noteId: duplicateId, reason: expect.stringContaining("more than one") }),
    ]);
  });

  it("blocks copied fact IDs and preserves both source references", () => {
    const copiedFact = "99999999-9999-4999-8999-999999999999";
    const index = buildLoreProjectIndex([
      {
        path: "Timeline/one.md",
        text: note({ id: EVENT_ID, type: "event", title: "One", facts: [timeFact("occurs-at", "2160", { id: copiedFact })] }),
      },
      {
        path: "Timeline/two.md",
        text: note({ id: SCENE_ID, type: "scene", title: "Two", facts: [timeFact("occurs-at", "2161", { id: copiedFact })] }),
      },
    ]);
    const model = deriveTimelineModel(index, null, null);

    expect(model.subjects.every(({ status }) => status === "needs-time")).toBe(true);
    expect(model.subjects.map(({ issues }) => issues[0])).toEqual([
      expect.objectContaining({ code: "duplicate-fact-id", factIds: [copiedFact] }),
      expect.objectContaining({ code: "duplicate-fact-id", factIds: [copiedFact] }),
    ]);
  });

  it("retains local malformed or duplicated fact diagnostics without calculating from them", () => {
    const duplicateFact = "12121212-1212-4212-8212-121212121212";
    const index = buildLoreProjectIndex([
      {
        path: "Timeline/local-duplicate.md",
        text: note({
          id: EVENT_ID,
          type: "event",
          title: "Local duplicate",
          facts: [
            timeFact("occurs-at", "2160", { id: duplicateFact }),
            timeFact("occurs-at", "2161", { id: duplicateFact }),
          ],
        }),
      },
    ]);
    const subject = deriveTimelineModel(index, null, null).subjects[0]!;

    expect(subject).toMatchObject({
      status: "needs-time",
      evidence: [],
      issues: [expect.objectContaining({ code: "missing-occurrence" })],
      sourceDiagnostics: [
        { message: expect.stringContaining("Duplicate continuity fact ID"), range: expect.any(Object) },
        { message: expect.stringContaining("Duplicate continuity fact ID"), range: expect.any(Object) },
      ],
    });
  });

  it("resolves ordered multi-track membership and reports missing, duplicate, and ineligible notes", () => {
    factSequence = 50;
    const duplicateId = CHAPTER_ID;
    const index = buildLoreProjectIndex([
      { path: "Timeline/event.md", text: note({ id: EVENT_ID, type: "event", title: "Event", facts: [timeFact("occurs-at", "2160")] }) },
      { path: "Timeline/scene.md", text: note({ id: SCENE_ID, type: "scene", title: "Scene", facts: [timeFact("occurs-at", "2161")] }) },
      { path: "Lore/character.md", text: note({ id: OTHER_ID, type: "character", title: "Mara" }) },
      { path: "Timeline/duplicate-one.md", text: note({ id: duplicateId, type: "event", title: "Duplicate one" }) },
      { path: "Timeline/duplicate-two.md", text: note({ id: duplicateId, type: "event", title: "Duplicate two" }) },
    ]);
    const project = timeline({
      tracks: [
        { id: TRACK_ONE, title: "Mara", color: "#8a5cf5", noteIds: [SCENE_ID, EVENT_ID, MISSING_ID, duplicateId, OTHER_ID] },
        { id: TRACK_TWO, title: "Mystery", noteIds: [EVENT_ID] },
      ],
    });
    const model = deriveTimelineModel(index, project, null);

    expect(model.tracks).toEqual([
      {
        id: TRACK_ONE,
        title: "Mara",
        color: "#8a5cf5",
        subjectIds: [SCENE_ID, EVENT_ID],
        issues: [
          { noteId: MISSING_ID, message: expect.stringContaining("not present") },
          { noteId: duplicateId, message: expect.stringContaining("more than one") },
          { noteId: OTHER_ID, message: expect.stringContaining("not an eligible") },
        ],
      },
      {
        id: TRACK_TWO,
        title: "Mystery",
        color: null,
        subjectIds: [EVENT_ID],
        issues: [],
      },
    ]);
    expect(model.subjects.find(({ noteId }) => noteId === EVENT_ID)?.trackIds).toEqual([TRACK_ONE, TRACK_TWO]);
    expect(model.subjects.find(({ noteId }) => noteId === SCENE_ID)?.trackIds).toEqual([TRACK_ONE]);
    expect(model.unassignedSubjectIds).toEqual([]);
  });

  it("attaches manuscript order and storyDate only as unchanged narrative context", () => {
    factSequence = 60;
    const index = buildLoreProjectIndex([
      { path: "Manuscript/Signals/chapter.md", text: note({ id: CHAPTER_ID, type: "chapter", title: "Signals", facts: [timeFact("occurs-at", "2160")] }) },
      { path: "Manuscript/Signals/antenna.md", text: note({ id: SCENE_ID, type: "scene", title: "The buried antenna", facts: [timeFact("occurs-at", "2159")] }) },
    ]);
    const model = deriveTimelineModel(index, null, manuscript());
    const chapter = model.subjects.find(({ noteId }) => noteId === CHAPTER_ID)!;
    const scene = model.subjects.find(({ noteId }) => noteId === SCENE_ID)!;

    expect(chapter.narrative).toEqual([
      expect.objectContaining({
        binding: "overview",
        order: [0, 0],
        storyDate: "Orbit 41, ash season",
      }),
    ]);
    expect(scene.narrative).toEqual([
      expect.objectContaining({
        binding: "source",
        order: [0, 0, 0],
        storyDate: "Three nights after the storm",
      }),
    ]);
    expect(model.calendarGroups[0]?.subjectIds).toEqual([SCENE_ID, CHAPTER_ID]);
  });

  it("groups anchored calendars together and unanchored calendars separately", () => {
    factSequence = 70;
    const project = timeline({
      calendars: [
        {
          id: "mission-day",
          title: "Mission Day",
          kind: "ordinal",
          unitSingular: "Day",
          unitPlural: "Days",
          anchor: { expression: "0", gregorian: "2160-01-01" },
        },
        {
          id: "private-count",
          title: "Private Count",
          kind: "ordinal",
          unitSingular: "Day",
          unitPlural: "Days",
        },
      ],
    });
    const index = buildLoreProjectIndex([
      { path: "Timeline/gregorian.md", text: note({ id: EVENT_ID, type: "event", title: "Gregorian", facts: [timeFact("occurs-at", "2160-01-02")] }) },
      { path: "Timeline/mission.md", text: note({ id: SCENE_ID, type: "scene", title: "Mission", facts: [timeFact("occurs-at", "1", { calendar: "mission-day" })] }) },
      { path: "Timeline/private.md", text: note({ id: CHAPTER_ID, type: "chapter", title: "Private", facts: [timeFact("occurs-at", "1", { calendar: "private-count" })] }) },
    ]);
    const model = deriveTimelineModel(index, project, null);

    expect(model.calendarGroups).toEqual([
      { axis: "gregorian", subjectIds: [EVENT_ID, SCENE_ID] },
      { axis: "calendar:private-count", subjectIds: [CHAPTER_ID] },
    ]);
  });

  it("derives an exact source-linked age with the clamped leap-day anniversary", () => {
    factSequence = 80;
    const participantId = factId();
    const birthId = factId();
    const occurrenceId = factId();
    const index = buildLoreProjectIndex([
      {
        path: "Timeline/reunion.md",
        text: note({
          id: EVENT_ID,
          type: "event",
          title: "Reunion",
          facts: [
            timeFact("occurs-at", "2101-02-28", { id: occurrenceId, certainty: "exact" }),
            participantFact(OTHER_ID, { id: participantId, certainty: "exact" }),
          ],
        }),
      },
      {
        path: "Characters/mara.md",
        text: note({
          id: OTHER_ID,
          type: "character",
          title: "Mara",
          facts: [characterTimeFact("born", "2096-02-29", { id: birthId, certainty: "exact" })],
        }),
      },
    ]);

    const appearance = deriveTimelineModel(index, null, null).subjects[0]!.appearances[0]!;

    expect(appearance).toMatchObject({
      participantFactId: participantId,
      targetNoteId: OTHER_ID,
      characterPath: "Characters/mara.md",
      characterTitle: "Mara",
      participation: "confirmed",
      age: {
        kind: "exact",
        minimumYears: "5",
        maximumYears: "5",
        qualified: false,
      },
      presence: { kind: "possible", hardContradiction: false },
    });
    expect(appearance.evidence.map(({ role, factId }) => [role, factId])).toEqual([
      ["participant", participantId],
      ["occurrence", occurrenceId],
      ["birth", birthId],
    ]);
    expect(appearance.evidence.every(({ range }) => range.end > range.start)).toBe(true);
  });

  it("preserves reduced precision as an inclusive age range", () => {
    factSequence = 90;
    const index = buildLoreProjectIndex([
      {
        path: "Timeline/year.md",
        text: note({
          id: EVENT_ID,
          type: "event",
          title: "A long year",
          facts: [
            timeFact("occurs-at", "2160", { certainty: "exact" }),
            participantFact(OTHER_ID, { certainty: "exact" }),
          ],
        }),
      },
      {
        path: "Characters/mara.md",
        text: note({
          id: OTHER_ID,
          type: "character",
          title: "Mara",
          facts: [characterTimeFact("born", "2130-06", { certainty: "exact" })],
        }),
      },
    ]);

    expect(deriveTimelineModel(index, null, null).subjects[0]!.appearances[0]!.age)
      .toMatchObject({
        kind: "range",
        minimumYears: "29",
        maximumYears: "30",
        qualified: false,
      });
  });

  it("shows an outside validity window as potential and never as a hard contradiction", () => {
    factSequence = 100;
    const participantId = factId();
    const index = buildLoreProjectIndex([
      {
        path: "Timeline/early.md",
        text: note({
          id: EVENT_ID,
          type: "event",
          title: "Early plan",
          facts: [
            timeFact("occurs-at", "2150-01-01", { certainty: "exact" }),
            participantFact(OTHER_ID, {
              id: participantId,
              certainty: "exact",
              validFrom: "2160-01-01",
            }),
          ],
        }),
      },
      {
        path: "Characters/mara.md",
        text: note({
          id: OTHER_ID,
          type: "character",
          title: "Mara",
          facts: [characterTimeFact("born", "2155-01-01", { certainty: "exact" })],
        }),
      },
    ]);

    const appearance = deriveTimelineModel(index, null, null).subjects[0]!.appearances[0]!;
    expect(appearance).toMatchObject({
      participation: "potential",
      participationReason: expect.stringContaining("potential planning"),
      presence: {
        kind: "uncertain",
        hardContradiction: false,
        reason: expect.stringContaining("cannot create"),
      },
    });
    expect(appearance.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "valid-from", factId: participantId }),
    ]));
  });

  it("flags only exact confirmed pre-birth and post-death appearances as hard contradictions", () => {
    factSequence = 110;
    const exactCharacter = OTHER_ID;
    const approximateCharacter = MISSING_ID;
    const index = buildLoreProjectIndex([
      {
        path: "Timeline/before.md",
        text: note({
          id: EVENT_ID,
          type: "event",
          title: "Before",
          facts: [
            timeFact("occurs-at", "2140-01-01", { certainty: "exact" }),
            participantFact(exactCharacter, { certainty: "exact" }),
          ],
        }),
      },
      {
        path: "Timeline/after.md",
        text: note({
          id: SCENE_ID,
          type: "scene",
          title: "After",
          facts: [
            timeFact("occurs-at", "2170-01-01", { certainty: "exact" }),
            participantFact(approximateCharacter, { certainty: "approximate" }),
          ],
        }),
      },
      {
        path: "Characters/exact.md",
        text: note({
          id: exactCharacter,
          type: "character",
          title: "Exact",
          facts: [characterTimeFact("born", "2150-01-01", { certainty: "exact" })],
        }),
      },
      {
        path: "Characters/approximate.md",
        text: note({
          id: approximateCharacter,
          type: "character",
          title: "Approximate",
          facts: [
            characterTimeFact("born", "2100-01-01", { certainty: "exact" }),
            characterTimeFact("died", "2160-01-01", { certainty: "exact" }),
          ],
        }),
      },
    ]);
    const model = deriveTimelineModel(index, null, null);
    const before = model.subjects.find(({ noteId }) => noteId === EVENT_ID)!.appearances[0]!;
    const after = model.subjects.find(({ noteId }) => noteId === SCENE_ID)!.appearances[0]!;

    expect(before.presence).toMatchObject({
      kind: "impossible-before-birth",
      hardContradiction: true,
    });
    expect(after).toMatchObject({
      age: { kind: "exact", minimumYears: "70", qualified: true },
      presence: { kind: "impossible-after-death", hardContradiction: false },
    });
  });

  it("keeps missing, duplicated, and competing lifespan evidence indeterminate", () => {
    factSequence = 120;
    const duplicateParticipantId = "99999999-9999-4999-8999-999999999998";
    const index = buildLoreProjectIndex([
      {
        path: "Timeline/one.md",
        text: note({
          id: EVENT_ID,
          type: "event",
          title: "One",
          facts: [
            timeFact("occurs-at", "2160"),
            participantFact(OTHER_ID),
            participantFact("aaaaaaaa-1111-4111-8111-111111111111", { id: duplicateParticipantId }),
          ],
        }),
      },
      {
        path: "Timeline/two.md",
        text: note({
          id: SCENE_ID,
          type: "scene",
          title: "Two",
          facts: [
            timeFact("occurs-at", "2161"),
            participantFact("bbbbbbbb-1111-4111-8111-111111111111", { id: duplicateParticipantId }),
          ],
        }),
      },
      {
        path: "Characters/mara.md",
        text: note({
          id: OTHER_ID,
          type: "character",
          title: "Mara",
          facts: [
            characterTimeFact("born", "2130"),
            characterTimeFact("born", "2131"),
          ],
        }),
      },
    ]);
    const model = deriveTimelineModel(index, null, null);
    const first = model.subjects.find(({ noteId }) => noteId === EVENT_ID)!.appearances;

    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({
        characterTitle: "Mara",
        age: expect.objectContaining({
          kind: "indeterminate",
          reason: expect.stringContaining("more than one"),
        }),
      }),
      expect.objectContaining({
        participantFactId: duplicateParticipantId,
        participation: "indeterminate",
        age: expect.objectContaining({
          kind: "indeterminate",
          reason: expect.stringContaining("fact ID"),
        }),
      }),
    ]));
  });
});
