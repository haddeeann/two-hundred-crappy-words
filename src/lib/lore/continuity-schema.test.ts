import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BUILT_IN_CONTINUITY_PROPERTIES,
  CONTINUITY_FACT_FORMAT_VERSION,
  MAX_CONTINUITY_FACTS,
} from "./continuity";

describe("portable continuity contract", () => {
  it("publishes a parseable versioned JSON Schema matching the parser boundary", () => {
    const schema = JSON.parse(
      readFileSync(
        new URL("../../../docs/schemas/continuity-frontmatter-v1.schema.json", import.meta.url),
        "utf8",
      ),
    ) as Record<string, any>;

    expect(CONTINUITY_FACT_FORMAT_VERSION).toBe(1);
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toContain(`:${CONTINUITY_FACT_FORMAT_VERSION}`);
    expect(schema.properties.facts.maxItems).toBe(MAX_CONTINUITY_FACTS);
    expect(schema.$defs.value.oneOf).toHaveLength(6);
    expect(schema.additionalProperties).toBe(true);
    expect(schema.$defs.fact.additionalProperties).toBe(true);
  });

  it("keeps the approved seed vocabulary small, unique, and extensible", () => {
    expect(new Set(BUILT_IN_CONTINUITY_PROPERTIES).size).toBe(
      BUILT_IN_CONTINUITY_PROPERTIES.length,
    );
    expect(BUILT_IN_CONTINUITY_PROPERTIES).toEqual([
      "born",
      "died",
      "occurs-at",
      "ends-at",
      "located-at",
      "participant",
      "instance-of",
      "species",
      "member-of",
      "parent-of",
      "partner-of",
      "operated-by",
      "home-port",
    ]);
  });
});
