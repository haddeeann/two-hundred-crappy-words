import { describe, expect, it } from "vitest";
import {
  GUIDED_TIMELINE_ANCHORS,
  guidedTimelineDateRequest,
} from "./guided-timeline";

describe("guided timeline", () => {
  it("starts with the three approved optional anchors", () => {
    expect(GUIDED_TIMELINE_ANCHORS.map(({ key }) => key)).toEqual([
      "story-start",
      "prior-event",
      "deadline",
    ]);
  });

  it("creates an exact Gregorian occurs-at request", () => {
    expect(guidedTimelineDateRequest("note-id", "fact-id", {
      kind: "exact",
      calendar: "ignored",
      expression: "2041-04-08",
    })).toEqual({
      operation: "add-fact",
      noteId: "note-id",
      draft: {
        id: "fact-id",
        property: "occurs-at",
        value: {
          kind: "time",
          calendar: "gregorian",
          expression: "2041-04-08",
        },
        certainty: "exact",
        note: null,
      },
    });
  });

  it("preserves approximate certainty and fictional calendar identity", () => {
    expect(guidedTimelineDateRequest("note-id", "fact-id", {
      kind: "approximate",
      calendar: "other",
      expression: " 2041 ",
    })).toMatchObject({ draft: { certainty: "approximate", value: { calendar: "gregorian", expression: "2041" } } });
    expect(guidedTimelineDateRequest("note-id", "fact-id", {
      kind: "fictional",
      calendar: " imperial ",
      expression: " 12 Frostwane 88 ",
    })).toMatchObject({ draft: { certainty: "exact", value: { calendar: "imperial", expression: "12 Frostwane 88" } } });
  });

  it("refuses an empty expression or unnamed fictional calendar", () => {
    expect(() => guidedTimelineDateRequest("note-id", "fact-id", {
      kind: "exact",
      calendar: "gregorian",
      expression: " ",
    })).toThrow("Write a date");
    expect(() => guidedTimelineDateRequest("note-id", "fact-id", {
      kind: "fictional",
      calendar: " ",
      expression: "1.1",
    })).toThrow("Name the fictional calendar");
    expect(() => guidedTimelineDateRequest("note-id", "fact-id", {
      kind: "fictional",
      calendar: "Imperial Calendar",
      expression: "1-2-3",
    })).toThrow("lowercase kebab-case");
  });
});
