import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MAPS_FORMAT,
  MAPS_FORMAT_VERSION,
  MAX_MAPS,
  MAX_MAP_ANCHORS,
  MAX_MAP_IMAGE_AXIS,
  MAX_MAP_POLYGON_VERTICES,
} from "./format";

describe("portable maps schema", () => {
  it("publishes a parseable versioned JSON Schema matching the parser boundary", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../../../docs/schemas/maps-v1.schema.json", import.meta.url), "utf8"),
    ) as Record<string, any>;

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toContain(`:${MAPS_FORMAT_VERSION}`);
    expect(schema.properties.format.const).toBe(MAPS_FORMAT);
    expect(schema.properties.maps.maxItems).toBe(MAX_MAPS);
    expect(schema.$defs.positiveDimension.maximum).toBe(MAX_MAP_IMAGE_AXIS);
    expect(schema.$defs.map.properties.anchors.maxItems).toBe(MAX_MAP_ANCHORS);
    expect(schema.$defs.polygon.properties.points.maxItems).toBe(MAX_MAP_POLYGON_VERTICES);
    expect(schema.$defs.anchor.properties.geometry.oneOf).toHaveLength(2);
    expect(schema.additionalProperties).toBe(true);
    expect(schema.$defs.map.additionalProperties).toBe(true);
    expect(schema.$defs.anchor.additionalProperties).toBe(true);
  });
});
