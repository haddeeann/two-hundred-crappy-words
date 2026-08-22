import { describe, expect, it } from "vitest";

import {
  isMarkdownPath,
  markdownFileStem,
  normalizeLoreName,
  relativeMarkdownStem,
} from "./normalize";

describe("connected-lore name normalization", () => {
  it("uses stable Unicode normalization and case folding", () => {
    expect(normalizeLoreName("  E\u0301LAN  ")).toBe(normalizeLoreName("élan"));
    expect(normalizeLoreName("Straße")).toBe(normalizeLoreName("STRASSE"));
    expect(normalizeLoreName("ὈΔΥΣΣΕΎΣ")).toBe(normalizeLoreName("ὀδυσσεύς"));
  });

  it("recognizes supported Markdown extensions case-insensitively", () => {
    expect(isMarkdownPath("Lore/Velorum.MARKDOWN")).toBe(true);
    expect(isMarkdownPath("Lore/Velorum.md")).toBe(true);
    expect(isMarkdownPath("Lore/Velorum.md.txt")).toBe(false);
    expect(markdownFileStem("Lore/Velorum.MD")).toBe("Velorum");
    expect(relativeMarkdownStem("Lore/Velorum.markdown")).toBe("Lore/Velorum");
  });
});
