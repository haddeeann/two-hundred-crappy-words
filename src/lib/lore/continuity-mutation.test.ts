import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "./frontmatter";
import {
  planAddContinuityFact,
  planEditContinuityFact,
  planRemoveContinuityFact,
  planSetContinuityCanon,
  type ContinuityFactDraft,
} from "./continuity-mutation";

const NOTE_ID = "2cd59970-6ab4-46f9-b54b-a0e35af5b9e1";
const FACT_ONE = "2e3120e7-0e74-4e3c-99a1-f2f76469559d";
const FACT_TWO = "e826d938-162d-4d72-9a88-588d669599f7";

describe("guarded continuity mutation plans", () => {
  it("records exact canon, facts-block, and closing ranges", () => {
    const text = `---
id: "${NOTE_ID}"
canon: "draft"
facts:
  - id: "${FACT_ONE}"
    property: "species"
    value:
      kind: "text"
      text: "Human"
---
Body`;
    const parsed = parseFrontmatter(text);

    expect(text.slice(parsed.canonRange!.start, parsed.canonRange!.end)).toBe(
      'canon: "draft"',
    );
    expect(text.slice(parsed.factsRange!.start, parsed.factsRange!.end)).toBe(
      text.slice(text.indexOf("facts:"), text.indexOf("\n---")),
    );
    expect(text.slice(parsed.closingRange!.start, parsed.closingRange!.end)).toBe(
      "---\n",
    );
  });

  it("inserts, changes, and removes note canon without normalizing other bytes", () => {
    const original = `---\r
id: "${NOTE_ID}"\r
unknownTop: "Keep me exactly"\r
facts:\r
  - id: "${FACT_ONE}"\r
    property: "species"\r
    value:\r
      kind: "text"\r
      text: "Human"\r
---\r
# Body\r
Writer prose.\r
`;
    const added = planSetContinuityCanon(original, NOTE_ID, "canon");
    expect(added.kind).toBe("ready");
    if (added.kind !== "ready") return;
    expect(added.updatedText).toBe(
      original.replace("facts:\r\n", 'canon: "canon"\r\nfacts:\r\n'),
    );
    expect(added.originalFingerprint).not.toBe(added.updatedFingerprint);

    const changed = planSetContinuityCanon(added.updatedText, NOTE_ID, "retired");
    expect(changed.kind).toBe("ready");
    if (changed.kind !== "ready") return;
    expect(changed.updatedText).toBe(
      added.updatedText.replace('canon: "canon"', 'canon: "retired"'),
    );

    const removed = planSetContinuityCanon(changed.updatedText, NOTE_ID, null);
    expect(removed.kind).toBe("ready");
    if (removed.kind !== "ready") return;
    expect(removed.updatedText).toBe(original);
  });

  it("adds a valid fact while preserving unknown metadata, existing facts, and prose", () => {
    const original = `---
id: "${NOTE_ID}"
customRoot: "untouched"
facts:
  - id: "${FACT_ONE}"
    property: "gravity-mood"
    value:
      kind: "text"
      text: "Quiet"
      customValue: "untouched"
    customFact: "untouched"
---

# Body

Exact writer prose.
`;
    const draft: ContinuityFactDraft = {
      id: FACT_TWO,
      property: "born",
      value: { kind: "time", calendar: "gregorian", expression: "2134-04-06" },
      canon: "canon",
      certainty: "exact",
      note: 'A "quoted" explanation.',
    };
    const plan = planAddContinuityFact(original, NOTE_ID, draft);

    expect(plan.kind).toBe("ready");
    if (plan.kind !== "ready") return;
    expect(plan.operation).toBe("add-fact");
    expect(plan.updatedText.startsWith(original.slice(0, original.indexOf("---\n\n# Body")))).toBe(
      true,
    );
    expect(plan.updatedText).toContain('customValue: "untouched"');
    expect(plan.updatedText).toContain('customFact: "untouched"');
    expect(plan.updatedText).toContain('note: "A \\"quoted\\" explanation."');
    expect(plan.updatedText.slice(plan.updatedText.indexOf("---\n\n# Body"))).toBe(
      original.slice(original.indexOf("---\n\n# Body")),
    );
    expect(parseFrontmatter(plan.updatedText).facts.map(({ id }) => id)).toEqual([
      FACT_ONE,
      FACT_TWO,
    ]);
  });

  it("creates the facts block when absent and removes only one exact fact", () => {
    const original = `---
id: "${NOTE_ID}"
title: "Mara"
---
Body`;
    const first = planAddContinuityFact(original, NOTE_ID, {
      id: FACT_ONE,
      property: "birth-location",
      value: { kind: "unknown", reason: "Not decided" },
    });
    expect(first.kind).toBe("ready");
    if (first.kind !== "ready") return;
    expect(first.updatedText).toContain(`facts:\n  - id: "${FACT_ONE}"`);
    expect(first.updatedText.endsWith("---\nBody")).toBe(true);

    const second = planAddContinuityFact(first.updatedText, NOTE_ID, {
      id: FACT_TWO,
      property: "species",
      value: { kind: "text", text: "Human" },
    });
    expect(second.kind).toBe("ready");
    if (second.kind !== "ready") return;
    const removed = planRemoveContinuityFact(second.updatedText, NOTE_ID, FACT_ONE);
    expect(removed.kind).toBe("ready");
    if (removed.kind !== "ready") return;
    expect(parseFrontmatter(removed.updatedText).facts.map(({ id }) => id)).toEqual([
      FACT_TWO,
    ]);
    expect(removed.updatedText.endsWith("---\nBody")).toBe(true);
  });

  it("edits known fields while preserving unknown fact and value extensions exactly", () => {
    const original = `---\r
id: "${NOTE_ID}"\r
customRoot: "root bytes"\r
facts:\r
  - id: "${FACT_ONE}"\r
    property: "located-at"\r
    value:\r
      kind: "note"\r
      id: "f8c20f24-4368-4c21-a1f7-a2ba31bd73a4"\r
      customValue: "value bytes"\r
    canon: "draft"\r
    customFact: "fact bytes"\r
    note: "Old note"\r
---\r
# Body\r
Exact writer prose.\r
`;
    const plan = planEditContinuityFact(original, NOTE_ID, FACT_ONE, {
      id: FACT_ONE,
      property: "born",
      value: { kind: "time", calendar: "gregorian", expression: "2134-04" },
      canon: "canon",
      certainty: "approximate",
      validFrom: { kind: "time", calendar: "gregorian", expression: "2160" },
      note: null,
    });

    expect(plan.kind).toBe("ready");
    if (plan.kind !== "ready") return;
    expect(plan.operation).toBe("edit-fact");
    expect(plan.updatedText).toContain('      customValue: "value bytes"\r\n');
    expect(plan.updatedText).toContain('    customFact: "fact bytes"\r\n');
    expect(plan.updatedText).toContain('customRoot: "root bytes"\r\n');
    expect(plan.updatedText).not.toContain('      id: "f8c20f24');
    expect(plan.updatedText).not.toContain('    note: "Old note"');
    expect(plan.updatedText.slice(plan.updatedText.indexOf("---\r\n# Body"))).toBe(
      original.slice(original.indexOf("---\r\n# Body")),
    );
    const parsed = parseFrontmatter(plan.updatedText).facts[0]!;
    expect(parsed).toMatchObject({
      id: FACT_ONE,
      property: "born",
      canon: "canon",
      certainty: "approximate",
      value: { kind: "time", calendar: "gregorian", expression: "2134-04" },
      validFrom: { kind: "time", calendar: "gregorian", expression: "2160" },
      validTo: null,
      note: null,
      unknownKeys: ["customFact"],
    });
    expect(parsed.value.unknownKeys).toEqual(["customValue"]);
  });

  it("refuses fact identity changes, missing facts, invalid edits, and no-op edits", () => {
    const valid = `---\nid: "${NOTE_ID}"\nfacts:\n  - id: "${FACT_ONE}"\n    property: "species"\n    value:\n      kind: "text"\n      text: "Human"\n---\n`;
    const draft: ContinuityFactDraft = {
      id: FACT_ONE,
      property: "species",
      value: { kind: "text", text: "Human" },
    };
    expect(planEditContinuityFact(valid, NOTE_ID, FACT_ONE, draft)).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("already has"),
    });
    expect(planEditContinuityFact(valid, NOTE_ID, FACT_TWO, { ...draft, id: FACT_TWO })).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("uniquely available"),
    });
    expect(planEditContinuityFact(valid, NOTE_ID, FACT_ONE, { ...draft, id: FACT_TWO })).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("identity"),
    });
    expect(planEditContinuityFact(valid, NOTE_ID, FACT_ONE, {
      ...draft,
      value: { kind: "time", calendar: "gregorian", expression: "2100-02-29" },
    })).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("Gregorian"),
    });
  });

  it("refuses identity mismatches, malformed metadata, duplicate fact IDs, and invalid drafts", () => {
    const valid = `---\nid: "${NOTE_ID}"\nfacts:\n  - id: "${FACT_ONE}"\n    property: "species"\n    value:\n      kind: "text"\n      text: "Human"\n---\n`;
    expect(
      planSetContinuityCanon(
        valid,
        "f8c20f24-4368-4c21-a1f7-a2ba31bd73a4",
        "canon",
      ),
    ).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("stable note ID") });
    expect(planAddContinuityFact(valid, NOTE_ID, {
      id: FACT_ONE,
      property: "species",
      value: { kind: "text", text: "Human" },
    })).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("already exists") });
    expect(planAddContinuityFact(valid, NOTE_ID, {
      id: FACT_TWO,
      property: "born",
      value: { kind: "time", calendar: "gregorian", expression: "2100-02-29" },
    })).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("Gregorian") });
    expect(
      planRemoveContinuityFact(
        valid.replace('text: "Human"', "text: !!js/function unsafe"),
        NOTE_ID,
        FACT_ONE,
      ),
    ).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("corrected") });
  });
});
