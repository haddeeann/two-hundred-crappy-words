import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "./frontmatter";

const NOTE_ID = "2cd59970-6ab4-46f9-b54b-a0e35af5b9e1";
const FACT_ONE = "2e3120e7-0e74-4e3c-99a1-f2f76469559d";
const FACT_TWO = "e826d938-162d-4d72-9a88-588d669599f7";
const FACT_THREE = "6543bf32-14ba-48d7-91ab-b36892990360";
const TARGET_ID = "f8c20f24-4368-4c21-a1f7-a2ba31bd73a4";

describe("safe connected-lore frontmatter", () => {
  it("reads approved scalar metadata and aliases", () => {
    const parsed = parseFrontmatter(`---\nid: "${NOTE_ID}"\ntype: "character"\ntitle: "Mara Venn"\naliases:\n  - "Mara"\n  - "Commander Venn"\n---\n# Mara\n`);

    expect(parsed).toMatchObject({
      id: NOTE_ID,
      type: "character",
      title: "Mara Venn",
      aliases: ["Mara", "Commander Venn"],
      bodyStart: 129,
    });
    expect(parsed.range).toMatchObject({ start: 0, end: 129, line: 1, column: 1 });
    expect(parsed.issues).toEqual([]);
  });

  it("ignores unsupported fields without evaluating them", () => {
    const parsed = parseFrontmatter(`---\ntitle: "Safe"\ncustom: !!js/function "danger"\nnested: &anchor\n  child: value\n---\nBody`);

    expect(parsed.title).toBe("Safe");
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]?.message).toMatch(/Unsupported frontmatter syntax/);
  });

  it("rejects duplicate or invalid metadata non-destructively", () => {
    const parsed = parseFrontmatter(`---\nid: "bad"\ntype: "Character Name"\ntitle: "First"\ntitle: "Second"\naliases: ["Inline"]\n---\n`);

    expect(parsed).toMatchObject({ id: null, type: null, title: null, aliases: [] });
    expect(parsed.issues.map(({ kind }) => kind)).toEqual([
      "frontmatter-field",
      "frontmatter-field",
      "duplicate-metadata",
      "frontmatter-field",
    ]);
  });

  it("deduplicates aliases by normalized case and enforces bounds", () => {
    const tooLong = "x".repeat(121);
    const parsed = parseFrontmatter(`---\naliases:\n  - "Mara"\n  - "mara"\n  - "  "\n  - "${tooLong}"\n---\n`);

    expect(parsed.aliases).toEqual(["Mara"]);
    expect(parsed.issues.map(({ kind }) => kind)).toEqual([
      "duplicate-alias",
      "frontmatter-field",
      "frontmatter-field",
    ]);
  });

  it("reports an unclosed opening block and searches after its delimiter", () => {
    const parsed = parseFrontmatter("---\ntitle: \"Lost\"\n[[Still prose]]");

    expect(parsed.range).toBeNull();
    expect(parsed.bodyStart).toBe(4);
    expect(parsed.issues[0]).toMatchObject({
      kind: "frontmatter-malformed",
      range: { start: 0, end: 3, line: 1, column: 1 },
    });
  });

  it("does not merge duplicate aliases blocks", () => {
    const parsed = parseFrontmatter(`---\naliases:\n  - "First"\naliases:\n  - "Second"\n---\n`);

    expect(parsed.aliases).toEqual([]);
    expect(parsed.issues).toMatchObject([
      { kind: "duplicate-metadata", range: { line: 4 } },
    ]);
  });

  it("reads optional canon and every approved typed value with source evidence", () => {
    const parsed = parseFrontmatter(`---
id: "${NOTE_ID}"
canon: "canon"
facts:
  - id: "${FACT_ONE}"
    property: "born"
    value:
      kind: "time"
      calendar: "gregorian"
      expression: "2134-04-06"
    certainty: "exact"
    customLabel: "Writer-owned extension"
  - id: "${FACT_TWO}"
    property: "member-of"
    value:
      kind: "note"
      id: "${TARGET_ID}"
      displayHint: "The Fleet"
    validFrom:
      kind: "time"
      calendar: "mars-sol"
      expression: "Era 3, Sol 19"
  - id: "${FACT_THREE}"
    property: "height"
    value:
      kind: "quantity"
      amount: "1.75"
      unitSystem: "ucum"
      unit: "m"
    note: "Measured before launch."
  - id: "f1df6090-cf4a-4381-b17c-2c1a7ad654bd"
    property: "service-window"
    value:
      kind: "range"
      minimum: "3.2"
      maximum: "4.1"
      unitSystem: "ucum"
      unit: "h"
  - id: "d18f4293-18a3-4d08-af7a-f2077c310bba"
    property: "blood-type"
    value:
      kind: "text"
      text: "O-negative"
  - id: "23ac5ecf-14a5-4515-8bc3-42d3d6feb138"
    property: "birth-location"
    value:
      kind: "unknown"
      reason: "The reveal is intentionally undecided."
    canon: "draft"
    certainty: "uncertain"
---
# Mara
`);

    expect(parsed.canon).toBe("canon");
    expect(parsed.facts).toHaveLength(6);
    expect(parsed.facts[0]).toMatchObject({
      id: FACT_ONE,
      property: "born",
      certainty: "exact",
      unknownKeys: ["customLabel"],
      range: { line: 5 },
      fieldRanges: {
        id: { line: 5 },
        value: { line: 7 },
      },
      value: {
        kind: "time",
        calendar: "gregorian",
        expression: "2134-04-06",
        range: { line: 7 },
      },
    });
    expect(parsed.facts[1]).toMatchObject({
      value: { kind: "note", id: TARGET_ID, unknownKeys: ["displayHint"] },
      validFrom: {
        kind: "time",
        calendar: "mars-sol",
        expression: "Era 3, Sol 19",
      },
    });
    expect(parsed.facts.map(({ value }) => value.kind)).toEqual([
      "time",
      "note",
      "quantity",
      "range",
      "text",
      "unknown",
    ]);
    expect(parsed.issues).toEqual([]);
  });

  it("keeps valid neighboring facts and the body when one fact is unsafe", () => {
    const parsed = parseFrontmatter(`---
facts:
  - id: "${FACT_ONE}"
    property: "species"
    value:
      kind: "text"
      text: "Human"
  - id: "${FACT_TWO}"
    property: "birth-location"
    value:
      kind: "unknown"
      reason: !!js/function "unsafe"
  - id: "${FACT_THREE}"
    property: "located-at"
    value:
      kind: "note"
      id: "${TARGET_ID}"
---
The body remains available.
`);

    expect(parsed.facts.map(({ id }) => id)).toEqual([FACT_ONE, FACT_THREE]);
    expect(parsed.issues).toMatchObject([
      {
        kind: "frontmatter-field",
        message: expect.stringContaining("double-quoted strings"),
        range: { line: 12 },
      },
    ]);
    expect(parsed.bodyStart).toBeGreaterThan(0);
  });

  it("refuses anchors, aliases, merge keys, implicit dates, tabs, and missing fields", () => {
    const parsed = parseFrontmatter(`---
facts:
  - id: "${FACT_ONE}"
    property: "born"
    value: &shared
  - id: "${FACT_TWO}"
    property: "born"
    value:
      kind: "time"
      calendar: "gregorian"
      expression: 2134-04-06
  - id: "${FACT_THREE}"
    property: "species"
    value:
      <<: *shared
      kind: "text"
      text: "Human"
  - id: "f1df6090-cf4a-4381-b17c-2c1a7ad654bd"
    property: "species"
	value:
      kind: "text"
      text: "Human"
  - id: "d18f4293-18a3-4d08-af7a-f2077c310bba"
    property: "species"
---
`);

    expect(parsed.facts).toEqual([]);
    const messages = parsed.issues.map(({ message }) => message).join("\n");
    expect(messages).toMatch(/double-quoted strings/);
    expect(messages).toMatch(/plain key/);
    expect(messages).toMatch(/spaces, not tabs/);
    expect(messages).toMatch(/requires value/);
    expect(parsed.issues.every(({ range }) => range.start > 0)).toBe(true);
  });

  it("refuses duplicate identities, duplicate keys, impossible Gregorian dates, and reversed ranges", () => {
    const parsed = parseFrontmatter(`---
facts:
  - id: "${FACT_ONE}"
    property: "born"
    value:
      kind: "time"
      calendar: "gregorian"
      expression: "2100-02-29"
  - id: "${FACT_TWO}"
    property: "service-window"
    value:
      kind: "range"
      minimum: "4.1"
      maximum: "3.2"
      unitSystem: "ucum"
      unit: "h"
  - id: "${FACT_THREE}"
    property: "species"
    property: "instance-of"
    value:
      kind: "text"
      text: "Human"
  - id: "f1df6090-cf4a-4381-b17c-2c1a7ad654bd"
    property: "born"
    value:
      kind: "time"
      calendar: "gregorian"
      expression: "2400-02-29"
  - id: "f1df6090-cf4a-4381-b17c-2c1a7ad654bd"
    property: "died"
    value:
      kind: "time"
      calendar: "gregorian"
      expression: "2480"
---
`);

    expect(parsed.facts).toEqual([]);
    expect(parsed.issues.map(({ message }) => message).join("\n")).toMatch(
      /Gregorian expression[\s\S]*maximum[\s\S]*Duplicate continuity field[\s\S]*Duplicate continuity fact ID/,
    );
    expect(parsed.issues.every(({ range }) => range.start > 0)).toBe(true);
  });

  it("keeps legacy metadata but ignores oversized continuity metadata", () => {
    const padding = "x".repeat(256 * 1024);
    const parsed = parseFrontmatter(`---
title: "Safe legacy title"
custom: "${padding}"
canon: "canon"
facts:
  - id: "${FACT_ONE}"
    property: "species"
    value:
      kind: "text"
      text: "Human"
---
`);

    expect(parsed.title).toBe("Safe legacy title");
    expect(parsed.canon).toBeNull();
    expect(parsed.facts).toEqual([]);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]?.message).toMatch(/exceeds 262144 bytes/);
  });
});
