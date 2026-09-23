import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MAX_TIMELINE_CALENDARS,
  MAX_TIMELINE_ERAS,
  MAX_TIMELINE_MONTHS,
  MAX_TIMELINE_TRACKS,
  MAX_TIMELINE_WEEKDAYS,
  TIMELINE_FORMAT,
  TIMELINE_FORMAT_VERSION,
} from "./format";

describe("portable timeline schema", () => {
  it("publishes a parseable versioned JSON Schema matching the parser boundary", () => {
    const schema = JSON.parse(
      readFileSync(
        new URL("../../../docs/schemas/timeline-v1.schema.json", import.meta.url),
        "utf8",
      ),
    ) as Record<string, any>;

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toContain(`:${TIMELINE_FORMAT_VERSION}`);
    expect(schema.properties.format.const).toBe(TIMELINE_FORMAT);
    expect(schema.properties.calendars.maxItems).toBe(MAX_TIMELINE_CALENDARS);
    expect(schema.properties.tracks.maxItems).toBe(MAX_TIMELINE_TRACKS);
    expect(schema.$defs.fixedCalendar.properties.months.maxItems).toBe(MAX_TIMELINE_MONTHS);
    expect(schema.$defs.fixedCalendar.properties.weekdays.maxItems).toBe(MAX_TIMELINE_WEEKDAYS);
    expect(schema.$defs.fixedCalendar.properties.eras.maxItems).toBe(MAX_TIMELINE_ERAS);
    expect(schema.$defs.calendar.oneOf).toHaveLength(2);
    expect(schema.additionalProperties).toBe(true);
    expect(schema.$defs.fixedCalendar.additionalProperties).toBe(true);
    expect(schema.$defs.track.additionalProperties).toBe(true);
  });
});
