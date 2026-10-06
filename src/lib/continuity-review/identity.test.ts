import { describe, expect, it } from "vitest";

import { createContinuityExceptionUuid } from "./identity";

describe("continuity exception identity", () => {
  it("creates a canonical UUID v4 from secure random bytes", () => {
    expect(createContinuityExceptionUuid((bytes) => {
      bytes.fill(0xab);
      return bytes;
    })).toBe("abababab-abab-4bab-abab-abababababab");
  });

  it("refuses a broken randomness boundary", () => {
    expect(() => createContinuityExceptionUuid(() => new Uint8Array(15))).toThrow(
      "Secure randomness did not return 16 bytes.",
    );
  });
});
