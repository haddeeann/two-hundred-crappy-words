import { describe, expect, it } from "vitest";

import {
  MAX_TIMELINE_BYTES,
  MAX_TIMELINE_ISSUES,
  MAX_TIMELINE_TRACK_MEMBERSHIPS,
  TIMELINE_FILE,
  TIMELINE_FORMAT,
  parseTimelineProject,
  serializeTimelineProject,
  type TimelineProject,
} from "./format";

const PROJECT_ID = "7848b5c8-4b08-4bc2-912e-c74c7ec8b001";
const TRACK_ID = "7b93f84a-59ff-43e8-8a70-2cc4e6c7fc10";
const NOTE_ID = "c6d5ba63-e70e-4618-9da8-6da077839f22";
const OTHER_NOTE_ID = "a88a089f-ac73-4e9a-8c2f-84c83710529a";

function fixedCalendar(overrides: Record<string, unknown> = {}) {
  return {
    id: "red-reckoning",
    title: "Red Reckoning",
    kind: "fixed",
    months: [
      {
        id: "dawn",
        name: "Dawn",
        shortName: "Dwn",
        commonDays: 30,
        leapDays: 31,
      },
      {
        id: "ember",
        name: "Ember",
        shortName: "Emb",
        commonDays: 30,
        leapDays: 30,
      },
    ],
    weekdays: [
      { id: "firstday", name: "Firstday", shortName: "First" },
      { id: "secondday", name: "Secondday", shortName: "Second" },
    ],
    leapCycle: { years: 4, leapYears: [0] },
    eras: [
      {
        id: "af",
        name: "After the Fall",
        abbreviation: "AF",
        yearOne: "0",
        direction: "forward",
      },
      {
        id: "bf",
        name: "Before the Fall",
        abbreviation: "BF",
        yearOne: "-1",
        direction: "backward",
      },
    ],
    anchor: {
      expression: "af:1-01-31",
      gregorian: "2160-01-01",
      weekday: "firstday",
    },
    ...overrides,
  };
}

function ordinalCalendar(overrides: Record<string, unknown> = {}) {
  return {
    id: "mission-day",
    title: "Mission Day",
    kind: "ordinal",
    unitSingular: "Day",
    unitPlural: "Days",
    anchor: { expression: "0", gregorian: "2160-01-01" },
    ...overrides,
  };
}

function validValue(overrides: Record<string, unknown> = {}) {
  return {
    format: TIMELINE_FORMAT,
    formatVersion: 1,
    projectId: PROJECT_ID,
    calendars: [fixedCalendar(), ordinalCalendar()],
    tracks: [
      {
        id: TRACK_ID,
        title: "Mara",
        color: "#8a5cf5",
        noteIds: [NOTE_ID, OTHER_NOTE_ID],
      },
    ],
    ...overrides,
  };
}

function validSource(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(validValue(overrides));
}

describe("portable timeline project", () => {
  it("uses the approved visible project-root filename and discriminator", () => {
    expect(TIMELINE_FILE).toBe("200-crappy-words.timeline.json");
    expect(TIMELINE_FORMAT).toBe("200-crappy-words/timeline");
  });

  it("parses fixed and ordinal calendars plus stable multi-track membership", () => {
    const result = parseTimelineProject(
      validSource({ futureField: { retained: true } }),
    );

    expect(result).toMatchObject({
      kind: "valid",
      timeline: {
        projectId: PROJECT_ID,
        calendars: [
          {
            id: "red-reckoning",
            kind: "fixed",
            months: [
              { id: "dawn", leapDays: 31 },
              { id: "ember", commonDays: 30, leapDays: 30 },
            ],
            eras: [{ id: "af", yearOne: "0" }, { id: "bf", yearOne: "-1" }],
            anchor: { expression: "af:1-01-31" },
          },
          {
            id: "mission-day",
            kind: "ordinal",
            unitSingular: "Day",
            anchor: { expression: "0" },
          },
        ],
        tracks: [{ id: TRACK_ID, noteIds: [NOTE_ID, OTHER_NOTE_ID] }],
      },
      source: { futureField: { retained: true } },
    });
  });

  it("keeps unknown supported-version data in the untouched source clone", () => {
    const original = validValue({
      unknownRoot: { owner: "writer" },
      calendars: [fixedCalendar({ unknownCalendar: [1, 2, 3] })],
    }) as Record<string, unknown>;
    const result = parseTimelineProject(JSON.stringify(original));
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;

    (original.unknownRoot as { owner: string }).owner = "changed outside";
    expect(result.source).toMatchObject({
      unknownRoot: { owner: "writer" },
      calendars: [{ unknownCalendar: [1, 2, 3] }],
    });
  });

  it("separates malformed, invalid, and unsupported future versions", () => {
    expect(parseTimelineProject("{")).toMatchObject({ kind: "malformed" });
    expect(parseTimelineProject("[]")).toEqual({
      kind: "invalid",
      issues: [{ path: "$", message: "The timeline file must be a JSON object." }],
    });
    expect(
      parseTimelineProject(JSON.stringify({ formatVersion: 2 })),
    ).toEqual({ kind: "unsupported-version", version: 2 });
    const wrongFormat = parseTimelineProject(
      validSource({ format: "another-app/timeline" }),
    );
    expect(wrongFormat).toMatchObject({ kind: "invalid" });
    if (wrongFormat.kind !== "invalid") return;
    expect(wrongFormat.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "$.format" })]),
    );
  });

  it("rejects invalid identities, duplicate scoped IDs, and reserved gregorian", () => {
    const result = parseTimelineProject(
      validSource({
        projectId: "not-a-uuid",
        calendars: [
          fixedCalendar({ id: "gregorian" }),
          ordinalCalendar({ id: "same-calendar" }),
          ordinalCalendar({ id: "same-calendar", title: "Duplicate" }),
        ],
        tracks: [
          { id: TRACK_ID, title: "First", noteIds: [NOTE_ID, NOTE_ID] },
          { id: TRACK_ID, title: "Second", noteIds: [NOTE_ID] },
        ],
      }),
    );

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    const messages = result.issues.map(({ message }) => message).join(" ");
    expect(messages).toContain("projectId");
    expect(messages).toContain("reserved");
    expect(messages).toContain("Duplicate calendar id");
    expect(messages).toContain("Duplicate track id");
    expect(messages).toContain("Duplicate note id");
  });

  it("validates fixed calendar structure, leap-cycle remainders, and display fields", () => {
    const result = parseTimelineProject(
      validSource({
        calendars: [
          fixedCalendar({
            id: "Bad Calendar",
            title: "\u0001",
            months: [
              {
                id: "same",
                name: "One",
                shortName: "1",
                commonDays: 0,
              },
              {
                id: "same",
                name: "Two",
                shortName: "2",
                commonDays: 30,
              },
            ],
            weekdays: [{ id: "Bad Day", name: "Day", shortName: "D" }],
            leapCycle: { years: 4, leapYears: [0, 0, 4] },
            eras: [
              {
                id: "era",
                name: "Era",
                abbreviation: "E",
                yearOne: "01",
                direction: "sideways",
              },
            ],
            anchor: undefined,
          }),
        ],
      }),
    );

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.issues.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "$.calendars[0].id",
        "$.calendars[0].title",
        "$.calendars[0].months[0].commonDays",
        "$.calendars[0].months[1].id",
        "$.calendars[0].weekdays[0].id",
        "$.calendars[0].leapCycle.leapYears[1]",
        "$.calendars[0].leapCycle.leapYears[2]",
        "$.calendars[0].eras[0].yearOne",
        "$.calendars[0].eras[0].direction",
      ]),
    );
  });

  it("checks exact fixed anchors against eras, leap years, months, days, and weekdays", () => {
    const leapReady = parseTimelineProject(
      validSource({ calendars: [fixedCalendar()] }),
    );
    expect(leapReady.kind).toBe("valid");

    const invalid = parseTimelineProject(
      validSource({
        calendars: [
          fixedCalendar({
            anchor: {
              expression: "missing:1-03-01",
              gregorian: "2100-02-29",
              weekday: "nonday",
            },
          }),
        ],
      }),
    );
    expect(invalid.kind).toBe("invalid");
    if (invalid.kind !== "invalid") return;
    expect(invalid.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.calendars[0].anchor.expression", message: expect.stringContaining("not defined") }),
        expect.objectContaining({ path: "$.calendars[0].anchor.gregorian", message: expect.stringContaining("real full date") }),
        expect.objectContaining({ path: "$.calendars[0].anchor.weekday", message: expect.stringContaining("not defined") }),
      ]),
    );

    const commonYearOverflow = parseTimelineProject(
      validSource({
        calendars: [fixedCalendar({ anchor: { expression: "af:2-01-31", gregorian: "2161-01-01" } })],
      }),
    );
    expect(commonYearOverflow).toMatchObject({
      kind: "invalid",
      issues: [expect.objectContaining({ message: expect.stringContaining("1 through 30") })],
    });
  });

  it("validates ordinal labels and anchors without treating arbitrary units as days", () => {
    const result = parseTimelineProject(
      validSource({
        calendars: [
          ordinalCalendar({
            unitSingular: "",
            unitPlural: 2,
            anchor: { expression: "01", gregorian: "2160-13-01" },
          }),
        ],
      }),
    );
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.issues.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "$.calendars[0].unitSingular",
        "$.calendars[0].unitPlural",
        "$.calendars[0].anchor.expression",
        "$.calendars[0].anchor.gregorian",
      ]),
    );
  });

  it("bounds bytes, memberships, and reported issues", () => {
    expect(
      parseTimelineProject(
        `{"formatVersion":1,"padding":"${"x".repeat(MAX_TIMELINE_BYTES)}"}`,
      ),
    ).toMatchObject({ kind: "invalid", issues: [{ path: "$" }] });

    const memberships = Array.from(
      { length: MAX_TIMELINE_TRACK_MEMBERSHIPS + 1 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const tooMany = parseTimelineProject(
      validSource({
        calendars: [],
        tracks: [{ id: TRACK_ID, title: "Crowded", noteIds: memberships }],
      }),
    );
    expect(tooMany).toMatchObject({
      kind: "invalid",
      issues: [expect.objectContaining({ message: expect.stringContaining("track memberships") })],
    });

    const noisy = parseTimelineProject(
      validSource({
        calendars: [],
        tracks: Array.from({ length: 128 }, () => ({ id: "bad", title: "", noteIds: "no" })),
      }),
    );
    expect(noisy.kind).toBe("invalid");
    if (noisy.kind !== "invalid") return;
    expect(noisy.issues).toHaveLength(MAX_TIMELINE_ISSUES + 1);
    expect(noisy.issues.at(-1)?.message).toContain("Additional issues were omitted");
  });

  it("serializes a validated new timeline deterministically", () => {
    const parsed = parseTimelineProject(validSource());
    expect(parsed.kind).toBe("valid");
    if (parsed.kind !== "valid") return;
    const serialized = serializeTimelineProject(parsed.timeline);

    expect(serialized.endsWith("\n")).toBe(true);
    expect(serializeTimelineProject(parsed.timeline)).toBe(serialized);
    expect(parseTimelineProject(serialized)).toMatchObject({ kind: "valid" });
    expect(JSON.parse(serialized)).toEqual(validValue());
  });

  it("refuses invalid in-memory values before serialization", () => {
    const invalid: TimelineProject = {
      format: TIMELINE_FORMAT,
      formatVersion: 1,
      projectId: "not-a-uuid",
      calendars: [],
      tracks: [],
    };
    expect(() => serializeTimelineProject(invalid)).toThrow(/projectId/);
    expect(() =>
      serializeTimelineProject({ ...invalid, format: "another/timeline" as typeof TIMELINE_FORMAT }),
    ).toThrow(/format must be/);
    expect(() =>
      serializeTimelineProject({ ...invalid, formatVersion: 2 as 1 }),
    ).toThrow(/formatVersion must be/);
  });
});
