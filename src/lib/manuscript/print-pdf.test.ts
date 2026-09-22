import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildManuscriptPrintPdf,
  PRINT_BODY_FONT_SIZE,
  PRINT_FIRST_LINE_INDENT,
  PRINT_PAGE_HEIGHT,
  PRINT_PAGE_WIDTH,
  KDP_MINIMUM_PAPERBACK_PAGES,
  manuscriptPrintPdfPageCount,
  requiredInsideMarginPoints,
  validateManuscriptPrintPdfMetadata,
  type ManuscriptPrintPdfFonts,
} from "./print-pdf";

const MODIFIED = "2026-09-21T12:00:00Z";
const FONT_ROOT = new URL("../../../static/fonts/source-serif-4/", import.meta.url);
const fonts: ManuscriptPrintPdfFonts = {
  regular: readFileSync(fileURLToPath(new URL("SourceSerif4-Regular.ttf", FONT_ROOT))),
  italic: readFileSync(fileURLToPath(new URL("SourceSerif4-It.ttf", FONT_ROOT))),
  semibold: readFileSync(fileURLToPath(new URL("SourceSerif4-Semibold.ttf", FONT_ROOT))),
  semiboldItalic: readFileSync(fileURLToPath(new URL("SourceSerif4-SemiboldIt.ttf", FONT_ROOT))),
};

describe("print-interior PDF generation", () => {
  it("validates print metadata and applies page-count-dependent retailer minimums", () => {
    expect(validateManuscriptPrintPdfMetadata({ author: "", modifiedAt: MODIFIED })).toMatchObject({ kind: "invalid" });
    expect(validateManuscriptPrintPdfMetadata({ author: "  Pat Example  ", modifiedAt: MODIFIED })).toEqual({
      kind: "valid",
      metadata: { author: "Pat Example", modifiedAt: MODIFIED },
    });
    expect(requiredInsideMarginPoints(24)).toBe(54);
    expect(requiredInsideMarginPoints(700)).toBe(54);
    expect(requiredInsideMarginPoints(701)).toBe(63);
    expect(PRINT_BODY_FONT_SIZE).toBe(11);
    expect(PRINT_FIRST_LINE_INDENT).toBeCloseTo(14.4);
    expect(KDP_MINIMUM_PAPERBACK_PAGES).toBe(24);
  });

  it("builds deterministic 6 x 9 pages with embedded Source Serif fonts and exact metadata", async () => {
    const input = {
      title: "The Patient Comet",
      metadata: { author: "Pat Example", modifiedAt: MODIFIED },
      fonts,
      tokens: [
        { kind: "chapter" as const, title: "Signals in the Dust" },
        { kind: "scene" as const, body: "Mara hears *the signal*.\n\nA second paragraph.", chapterTitle: "Signals in the Dust" },
        { kind: "scene" as const, body: "The **answer** crosses the dark.", chapterTitle: "Signals in the Dust" },
        { kind: "chapter" as const, title: "A Patient Reply" },
        { kind: "scene" as const, body: "A new chapter begins.", chapterTitle: "A Patient Reply" },
      ],
    };
    const first = await buildManuscriptPrintPdf(input);
    const second = await buildManuscriptPrintPdf(input);
    expect(first).toEqual(second);
    expect(Array.from(first.slice(0, 5))).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]);

    const document = await PDFDocument.load(first, { updateMetadata: false });
    expect(await manuscriptPrintPdfPageCount(first)).toBe(3);
    expect(document.getTitle()).toBe("The Patient Comet");
    expect(document.getAuthor()).toBe("Pat Example");
    expect(document.getCreator()).toBe("200 Crappy Words");
    expect(document.getProducer()).toBe("200 Crappy Words");
    expect(document.getCreationDate()?.toISOString()).toBe(new Date(MODIFIED).toISOString());
    expect(document.getModificationDate()?.toISOString()).toBe(new Date(MODIFIED).toISOString());
    expect(document.getPageCount()).toBe(3);
    for (const page of document.getPages()) {
      expect(page.getSize()).toEqual({ width: PRINT_PAGE_WIDTH, height: PRINT_PAGE_HEIGHT });
      expect(page.getTrimBox()).toEqual({ x: 0, y: 0, width: PRINT_PAGE_WIDTH, height: PRINT_PAGE_HEIGHT });
    }
    const binaryText = new TextDecoder("windows-1252").decode(first);
    expect(binaryText).toContain("SourceSerif4-Regular");
    expect(binaryText).toContain("SourceSerif4-Italic");
    expect(binaryText).toContain("SourceSerif4-Semibold");
  });

  it("refuses illustrations instead of silently producing an incomplete print interior", async () => {
    await expect(buildManuscriptPrintPdf({
      title: "Illustrated Draft",
      metadata: { author: "Pat Example", modifiedAt: MODIFIED },
      fonts,
      tokens: [{ kind: "scene", body: "A map follows.\n\n![Map](map.png)", chapterTitle: null }],
    })).rejects.toThrow("does not support images yet");
  });
});
