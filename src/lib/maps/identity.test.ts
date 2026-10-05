import { describe, expect, it } from "vitest";

import { createMapUuid } from "./identity";

describe("map UUID generation", () => {
  it("uses secure random bytes while forcing canonical UUID v4 bits", () => {
    const result = createMapUuid((bytes) => {
      bytes.set([0, 1, 2, 3, 4, 5, 0xff, 7, 0xff, 9, 10, 11, 12, 13, 14, 15]);
      return bytes;
    });
    expect(result).toBe("00010203-0405-4f07-bf09-0a0b0c0d0e0f");
  });

  it("refuses a malformed randomness provider", () => {
    expect(() => createMapUuid(() => new Uint8Array(15))).toThrow(/16 bytes/u);
  });
});
