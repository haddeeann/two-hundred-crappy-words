import { describe, expect, it } from "vitest";
import { buildGuidedLoreSections, GUIDED_LORE_FORMS, GUIDED_LORE_TYPES } from "./guided-lore";

describe("guided lore forms", () => {
  it("covers every beginner-facing lore kind with optional prompts", () => {
    expect(GUIDED_LORE_TYPES).toHaveLength(8);
    for (const type of GUIDED_LORE_TYPES) {
      expect(GUIDED_LORE_FORMS[type].choice).not.toBe("");
      expect(GUIDED_LORE_FORMS[type].fields.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("groups character answers into existing portable template sections", () => {
    expect(buildGuidedLoreSections("character", {
      role: "A surveyor.",
      desire: "To understand the signal.",
      difficulty: "It knows her name.",
      consistency: "She is left-handed.",
      connections: "Quiet Station",
    })).toEqual({
      Summary: "A surveyor.",
      "Desire and conflict": "### Desire\n\nTo understand the signal.\n\n### Difficulty\n\nIt knows her name.",
      Notes: "### Keep consistent\n\nShe is left-handed.\n\n### Connections\n\nQuiet Station",
    });
  });

  it("omits unanswered prompts instead of inventing world facts", () => {
    expect(buildGuidedLoreSections("location", { feel: "Cold blue light.", power: "" })).toEqual({
      Environment: "Cold blue light.",
    });
  });

  it("bounds each guided answer", () => {
    expect(() => buildGuidedLoreSections("event", { happened: "x".repeat(2_001) })).toThrow(RangeError);
  });
});
