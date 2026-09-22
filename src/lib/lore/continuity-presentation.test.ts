import { describe, expect, it } from "vitest";

import { fingerprintContent } from "$lib/editor/recovery";
import { buildLoreProjectIndex } from "./index";
import {
  CONTINUITY_PROPERTY_DEFINITIONS,
  continuityPropertyDefinition,
} from "./continuity-registry";
import { presentContinuityInspector } from "./continuity-presentation";

const MARA_ID = "2cd59970-6ab4-46f9-b54b-a0e35af5b9e1";
const FLEET_ID = "f8c20f24-4368-4c21-a1f7-a2ba31bd73a4";
const MEMBER_FACT_ID = "2e3120e7-0e74-4e3c-99a1-f2f76469559d";

describe("continuity property registry", () => {
  it("publishes explicit semantics for every approved built-in property", () => {
    expect(CONTINUITY_PROPERTY_DEFINITIONS).toHaveLength(13);
    expect(new Set(CONTINUITY_PROPERTY_DEFINITIONS.map(({ key }) => key)).size).toBe(13);
    for (const definition of CONTINUITY_PROPERTY_DEFINITIONS) {
      expect(definition.subjectTypes.length).toBeGreaterThan(0);
      expect(definition.valueKinds.length).toBeGreaterThan(0);
      expect(definition.description).not.toBe("");
    }
    expect(continuityPropertyDefinition("partner-of")).toMatchObject({
      direction: "symmetric",
      inverseProperty: "partner-of",
      valueKinds: ["note"],
    });
    expect(continuityPropertyDefinition("writer-invented")).toBeNull();
  });
});

describe("read-only continuity presentation", () => {
  it("resolves stable note references and explains inherited canon and evidence", () => {
    const mara = `---
id: "${MARA_ID}"
type: "character"
title: "Mara Venn"
canon: "canon"
facts:
  - id: "${MEMBER_FACT_ID}"
    property: "member-of"
    value:
      kind: "note"
      id: "${FLEET_ID}"
    validFrom:
      kind: "time"
      calendar: "gregorian"
      expression: "2161"
    certainty: "approximate"
---
# Mara`;
    const index = buildLoreProjectIndex([
      { path: "Lore/mara.md", text: mara },
      {
        path: "Lore/fleet.md",
        text: `---\nid: "${FLEET_ID}"\ntype: "faction"\ntitle: "The Fleet"\n---`,
      },
    ]);

    expect(
      presentContinuityInspector(index, "Lore/mara.md", fingerprintContent(mara)),
    ).toMatchObject({
      kind: "ready",
      summary: "Continuity · 1 fact",
      title: "Mara Venn",
      canon: "canon",
      facts: [
        {
          propertyLabel: "Member of",
          valueText: "The Fleet",
          reference: {
            kind: "resolved",
            path: "Lore/fleet.md",
            title: "The Fleet",
          },
          canon: "canon",
          canonSource: "note",
          certainty: "approximate",
          validity: "From 2161 · gregorian",
          diagnostics: [],
          sourceLabel: "Lore/mara.md:7:1",
        },
      ],
    });
  });

  it("keeps custom, missing, type-mismatched, and duplicated facts explainable", () => {
    const first = `---
id: "${MARA_ID}"
type: "location"
facts:
  - id: "${MEMBER_FACT_ID}"
    property: "partner-of"
    value:
      kind: "note"
      id: "${FLEET_ID}"
  - id: "6543bf32-14ba-48d7-91ab-b36892990360"
    property: "gravity-mood"
    value:
      kind: "unknown"
      reason: "Deliberately undecided"
      displayHint: "later"
---`;
    const duplicate = `---
facts:
  - id: "${MEMBER_FACT_ID}"
    property: "species"
    value:
      kind: "text"
      text: "Copy"
---`;
    const index = buildLoreProjectIndex([
      { path: "one.md", text: first },
      { path: "two.md", text: duplicate },
    ]);
    const presented = presentContinuityInspector(index, "one.md");

    expect(presented).toMatchObject({
      kind: "ready",
      facts: [
        {
          propertyLabel: "Partner of",
          valueText: "Missing note reference",
          diagnostics: [
            expect.stringContaining("documented for character"),
            expect.stringContaining("unavailable"),
            expect.stringContaining("duplicated"),
          ],
        },
        {
          propertyLabel: "Gravity mood",
          customProperty: true,
          valueText: "Intentionally unknown · Deliberately undecided",
          diagnostics: [
            expect.stringContaining("Custom property"),
            expect.stringContaining("Unrecognized fields"),
          ],
        },
      ],
    });
  });

  it("does not expose stale source ranges while the active overlay is catching up", () => {
    const text = "# Mara";
    const index = buildLoreProjectIndex([{ path: "mara.md", text }]);

    expect(presentContinuityInspector(index, "mara.md", "different")).toEqual({
      kind: "updating",
      summary: "Continuity · updating…",
      path: "mara.md",
    });
    expect(presentContinuityInspector(index, null)).toEqual({
      kind: "no-active-note",
      summary: "Continuity",
    });
  });
});
