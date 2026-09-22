import fontkit from "@pdf-lib/fontkit";
import {
  beginText,
  endText,
  moveText,
  PDFDocument,
  rgb,
  setFillingColor,
  setFontAndSize,
  showText,
  type PDFFont,
  type PDFName,
  type PDFPage,
} from "pdf-lib";
import { markdownBody, type ManuscriptCompileToken } from "./compile";
import {
  validateManuscriptPrintPdfMetadata,
  type ManuscriptPrintPdfFonts,
  type ManuscriptPrintPdfMetadata,
  type ValidatedManuscriptPrintPdfMetadata,
} from "./print-pdf-metadata";

export {
  KDP_MINIMUM_PAPERBACK_PAGES,
  validateManuscriptPrintPdfMetadata,
  type ManuscriptPrintPdfFonts,
  type ManuscriptPrintPdfMetadata,
  type ValidatedManuscriptPrintPdfMetadata,
} from "./print-pdf-metadata";

export interface ManuscriptPrintPdfInput {
  title: string;
  tokens: readonly ManuscriptCompileToken[];
  metadata: ManuscriptPrintPdfMetadata;
  fonts: ManuscriptPrintPdfFonts;
}

interface PrintSection {
  title: string | null;
  scenes: string[];
}

type FontStyle = "regular" | "italic" | "semibold" | "semiboldItalic";

interface FontSet {
  regular: PDFFont;
  italic: PDFFont;
  semibold: PDFFont;
  semiboldItalic: PDFFont;
}

interface PageFont {
  font: PDFFont;
  key: PDFName;
}

type PageFontSet = Record<FontStyle, PageFont>;

interface StyledRun {
  text: string;
  style: FontStyle;
}

interface StyledWord {
  text: string;
  font: PDFFont;
  spaceBefore: boolean;
}

interface WrappedLine {
  words: StyledWord[];
  width: number;
  indent: number;
}

type PrintBlock =
  | { kind: "paragraph"; runs: StyledRun[]; indent: boolean }
  | { kind: "heading"; runs: StyledRun[] }
  | { kind: "separator" }
  | { kind: "literal"; lines: string[] };

const POINTS_PER_INCH = 72;
export const PRINT_PAGE_WIDTH = 6 * POINTS_PER_INCH;
export const PRINT_PAGE_HEIGHT = 9 * POINTS_PER_INCH;
export const PRINT_BODY_FONT_SIZE = 11;
export const PRINT_FIRST_LINE_INDENT = 0.2 * POINTS_PER_INCH;

const LINE_HEIGHT = 14.25;
const OUTSIDE_MARGIN = 0.625 * POINTS_PER_INCH;
const TOP_MARGIN = 0.75 * POINTS_PER_INCH;
const BOTTOM_MARGIN = 0.75 * POINTS_PER_INCH;
const BASE_INSIDE_MARGIN = 0.75 * POINTS_PER_INCH;
const HEADER_SIZE = 8;
const CHAPTER_TITLE_SIZE = 18;
const SUBHEADING_SIZE = 12;
const TITLE_SIZE = 24;
const AUTHOR_SIZE = 12;
const MAX_JUSTIFIED_SPACE = PRINT_BODY_FONT_SIZE * 0.75;

export function requiredInsideMarginPoints(pageCount: number): number {
  const retailerMinimum = pageCount <= 150
    ? 0.375
    : pageCount <= 300
      ? 0.5
      : pageCount <= 500
        ? 0.625
        : pageCount <= 700
          ? 0.75
          : 0.875;
  return Math.max(BASE_INSIDE_MARGIN, retailerMinimum * POINTS_PER_INCH);
}

export async function buildManuscriptPrintPdf(
  input: ManuscriptPrintPdfInput,
): Promise<Uint8Array> {
  const validated = validateManuscriptPrintPdfMetadata(input.metadata);
  if (validated.kind === "invalid") throw new Error(validated.message);
  assertSupportedPrintContent(input.tokens);
  let insideMargin = requiredInsideMarginPoints(1);
  let result = await renderPrintPdf(input, validated.metadata, insideMargin);
  for (let pass = 0; pass < 3; pass += 1) {
    const required = requiredInsideMarginPoints(result.pageCount);
    if (required === insideMargin) return result.bytes;
    insideMargin = required;
    result = await renderPrintPdf(input, validated.metadata, insideMargin);
  }
  return result.bytes;
}

function assertSupportedPrintContent(tokens: readonly ManuscriptCompileToken[]): void {
  const includesImage = tokens.some((token) => token.kind === "scene" && (
    /!\[[^\]]*\]\([^)]*\)/u.test(token.body ?? "") || /<img\b/iu.test(token.body ?? "")
  ));
  if (includesImage) {
    throw new Error("Print interior PDF does not support images yet. Remove image markup or choose another export format.");
  }
}

export async function manuscriptPrintPdfPageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
}

async function renderPrintPdf(
  input: ManuscriptPrintPdfInput,
  metadata: ValidatedManuscriptPrintPdfMetadata,
  insideMargin: number,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const document = await PDFDocument.create({ updateMetadata: false });
  document.registerFontkit(fontkit);
  document.setTitle(input.title, { showInWindowTitleBar: true });
  document.setAuthor(metadata.author);
  document.setSubject("6 x 9 inch no-bleed print interior");
  document.setCreator("200 Crappy Words");
  document.setProducer("200 Crappy Words");
  document.setKeywords(["print interior", "6 x 9", "no bleed"]);
  const modifiedAt = new Date(metadata.modifiedAt);
  document.setCreationDate(modifiedAt);
  document.setModificationDate(modifiedAt);

  const fonts: FontSet = {
    regular: await document.embedFont(input.fonts.regular, { customName: "SourceSerif4-Regular" }),
    italic: await document.embedFont(input.fonts.italic, { customName: "SourceSerif4-Italic" }),
    semibold: await document.embedFont(input.fonts.semibold, { customName: "SourceSerif4-Semibold" }),
    semiboldItalic: await document.embedFont(input.fonts.semiboldItalic, { customName: "SourceSerif4-SemiboldItalic" }),
  };
  const layout = new PrintLayout(document, fonts, input.title, metadata.author, insideMargin);
  layout.addTitlePage();
  for (const section of compilePrintSections(input.tokens)) {
    layout.addSection(section);
  }
  const bytes = await document.save({ useObjectStreams: false, objectsPerTick: 50 });
  return { bytes, pageCount: document.getPageCount() };
}

class PrintLayout {
  private page: PDFPage | null = null;
  private y = 0;
  private contentX = 0;
  private contentWidth = 0;
  private suppressNextParagraphIndent = true;
  private readonly pageFonts = new WeakMap<PDFPage, PageFontSet>();

  constructor(
    private readonly document: PDFDocument,
    private readonly fonts: FontSet,
    private readonly title: string,
    private readonly author: string,
    private readonly insideMargin: number,
  ) {}

  addTitlePage(): void {
    const page = this.createPage();
    const titleLines = wrapCenteredText(this.title, this.fonts.semibold, TITLE_SIZE, PRINT_PAGE_WIDTH - 2 * BASE_INSIDE_MARGIN);
    let y = PRINT_PAGE_HEIGHT * 0.66;
    for (const line of titleLines) {
      this.drawCentered(page, line, y, "semibold", TITLE_SIZE);
      y -= TITLE_SIZE * 1.25;
    }
    this.drawCentered(page, this.author, PRINT_PAGE_HEIGHT * 0.42, "regular", AUTHOR_SIZE);
  }

  addSection(section: PrintSection): void {
    this.startSectionPage(section.title);
    section.scenes.forEach((scene, index) => {
      if (index > 0) this.drawSceneBreak();
      const blocks = parsePrintBlocks(scene);
      for (const block of blocks) this.drawBlock(block);
    });
  }

  private startSectionPage(title: string | null): void {
    this.page = this.createPage();
    this.setContentGeometry();
    this.suppressNextParagraphIndent = true;
    if (title === null) {
      this.y = PRINT_PAGE_HEIGHT - TOP_MARGIN;
      return;
    }
    const titleWidth = this.contentWidth * 0.9;
    const titleLines = wrapCenteredText(title, this.fonts.semibold, CHAPTER_TITLE_SIZE, titleWidth);
    let y = PRINT_PAGE_HEIGHT - 1.8 * POINTS_PER_INCH;
    for (const line of titleLines) {
      this.drawCenteredInBox(this.page, line, y, "semibold", CHAPTER_TITLE_SIZE, this.contentX, this.contentWidth);
      y -= CHAPTER_TITLE_SIZE * 1.25;
    }
    this.y = Math.min(y - 0.55 * POINTS_PER_INCH, PRINT_PAGE_HEIGHT - 2.7 * POINTS_PER_INCH);
  }

  private startContinuationPage(): void {
    this.page = this.createPage();
    this.setContentGeometry();
    const pageNumber = this.document.getPageCount();
    const header = pageNumber % 2 === 0 ? this.author : this.title;
    this.drawCenteredInBox(
      this.page,
      header,
      PRINT_PAGE_HEIGHT - 0.43 * POINTS_PER_INCH,
      "regular",
      HEADER_SIZE,
      this.contentX,
      this.contentWidth,
    );
    this.drawCentered(this.page, String(pageNumber), 0.36 * POINTS_PER_INCH, "regular", HEADER_SIZE);
    this.y = PRINT_PAGE_HEIGHT - TOP_MARGIN;
  }

  private createPage(): PDFPage {
    const page = this.document.addPage([PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT]);
    page.setCropBox(0, 0, PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT);
    page.setTrimBox(0, 0, PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT);
    this.pageFonts.set(page, {
      regular: { font: this.fonts.regular, key: page.node.newFontDictionary(this.fonts.regular.name, this.fonts.regular.ref) },
      italic: { font: this.fonts.italic, key: page.node.newFontDictionary(this.fonts.italic.name, this.fonts.italic.ref) },
      semibold: { font: this.fonts.semibold, key: page.node.newFontDictionary(this.fonts.semibold.name, this.fonts.semibold.ref) },
      semiboldItalic: { font: this.fonts.semiboldItalic, key: page.node.newFontDictionary(this.fonts.semiboldItalic.name, this.fonts.semiboldItalic.ref) },
    });
    return page;
  }

  private setContentGeometry(): void {
    const pageNumber = this.document.getPageCount();
    const odd = pageNumber % 2 === 1;
    const left = odd ? this.insideMargin : OUTSIDE_MARGIN;
    const right = odd ? OUTSIDE_MARGIN : this.insideMargin;
    this.contentX = left;
    this.contentWidth = PRINT_PAGE_WIDTH - left - right;
  }

  private drawBlock(block: PrintBlock): void {
    if (block.kind === "separator") {
      this.drawSceneBreak();
      return;
    }
    if (block.kind === "literal") {
      for (const line of block.lines) this.drawParagraph([{ text: line || " ", style: "regular" }], false);
      return;
    }
    if (block.kind === "heading") {
      this.ensureVerticalSpace(SUBHEADING_SIZE * 2.4);
      const text = block.runs.map((run) => run.text).join("");
      const lines = wrapCenteredText(text, this.fonts.semibold, SUBHEADING_SIZE, this.contentWidth);
      this.y -= SUBHEADING_SIZE * 0.5;
      for (const line of lines) {
        this.drawCenteredInBox(this.page!, line, this.y, "semibold", SUBHEADING_SIZE, this.contentX, this.contentWidth);
        this.y -= SUBHEADING_SIZE * 1.25;
      }
      this.y -= SUBHEADING_SIZE * 0.4;
      this.suppressNextParagraphIndent = true;
      return;
    }
    this.drawParagraph(block.runs, block.indent && !this.suppressNextParagraphIndent);
    this.suppressNextParagraphIndent = false;
  }

  private drawParagraph(runs: StyledRun[], indent: boolean): void {
    const lines = wrapStyledRuns(
      runs,
      this.fonts,
      this.contentWidth,
      indent ? PRINT_FIRST_LINE_INDENT : 0,
    );
    if (lines.length === 0) return;
    const availableLines = Math.max(0, Math.floor((this.y - BOTTOM_MARGIN) / LINE_HEIGHT) + 1);
    if (lines.length > 1 && availableLines < 2) this.startContinuationPage();

    let index = 0;
    while (index < lines.length) {
      let capacity = Math.max(0, Math.floor((this.y - BOTTOM_MARGIN) / LINE_HEIGHT) + 1);
      if (capacity === 0) {
        this.startContinuationPage();
        capacity = Math.max(0, Math.floor((this.y - BOTTOM_MARGIN) / LINE_HEIGHT) + 1);
      }
      let take = Math.min(capacity, lines.length - index);
      if (lines.length - index - take === 1 && take > 2) take -= 1;
      if (take === 1 && lines.length - index > 1) {
        this.startContinuationPage();
        continue;
      }
      for (let offset = 0; offset < take; offset += 1) {
        const lineIndex = index + offset;
        this.drawWrappedLine(lines[lineIndex]!, lineIndex < lines.length - 1);
      }
      index += take;
      if (index < lines.length) this.startContinuationPage();
    }
  }

  private drawWrappedLine(line: WrappedLine, justify: boolean): void {
    if (line.words.length === 0) {
      this.y -= LINE_HEIGHT;
      return;
    }
    const gapCount = line.words.slice(1).filter((word) => word.spaceBefore).length;
    const naturalSpace = this.fonts.regular.widthOfTextAtSize(" ", PRINT_BODY_FONT_SIZE);
    const usableWidth = this.contentWidth - line.indent;
    const candidateSpace = gapCount > 0
      ? naturalSpace + (usableWidth - line.width) / gapCount
      : naturalSpace;
    const space = justify && gapCount > 0 && candidateSpace <= MAX_JUSTIFIED_SPACE
      ? candidateSpace
      : naturalSpace;
    let x = this.contentX + line.indent;
    for (let index = 0; index < line.words.length; index += 1) {
      const word = line.words[index]!;
      if (index > 0 && word.spaceBefore) {
        // Keep the whitespace in the content stream so copy, search, and text
        // extraction retain word boundaries even when justification widens it.
        this.drawText(this.page!, " ", x, this.y, "regular", PRINT_BODY_FONT_SIZE);
        x += space;
      }
      const style = styleForFont(word.font, this.fonts);
      this.drawText(this.page!, word.text, x, this.y, style, PRINT_BODY_FONT_SIZE);
      x += word.font.widthOfTextAtSize(word.text, PRINT_BODY_FONT_SIZE);
    }
    this.y -= LINE_HEIGHT;
  }

  private drawSceneBreak(): void {
    this.ensureVerticalSpace(LINE_HEIGHT * 3);
    this.y -= LINE_HEIGHT * 0.7;
    this.drawCenteredInBox(
      this.page!,
      "* * *",
      this.y,
      "regular",
      PRINT_BODY_FONT_SIZE,
      this.contentX,
      this.contentWidth,
    );
    this.y -= LINE_HEIGHT * 1.6;
    this.suppressNextParagraphIndent = true;
  }

  private ensureVerticalSpace(points: number): void {
    if (!this.page || this.y - points < BOTTOM_MARGIN) this.startContinuationPage();
  }

  private drawText(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    style: FontStyle,
    size: number,
  ): void {
    const pageFont = this.pageFonts.get(page)?.[style];
    if (!pageFont) throw new Error("The print page font resources are unavailable.");
    page.pushOperators(
      beginText(),
      setFillingColor(rgb(0, 0, 0)),
      setFontAndSize(pageFont.key, size),
      moveText(x, y),
      showText(pageFont.font.encodeText(text)),
      endText(),
    );
  }

  private drawCentered(page: PDFPage, text: string, y: number, style: FontStyle, size: number): void {
    const font = this.fonts[style];
    this.drawText(page, text, (PRINT_PAGE_WIDTH - font.widthOfTextAtSize(text, size)) / 2, y, style, size);
  }

  private drawCenteredInBox(
    page: PDFPage,
    text: string,
    y: number,
    style: FontStyle,
    size: number,
    x: number,
    width: number,
  ): void {
    const font = this.fonts[style];
    this.drawText(page, text, x + (width - font.widthOfTextAtSize(text, size)) / 2, y, style, size);
  }
}

function compilePrintSections(tokens: readonly ManuscriptCompileToken[]): PrintSection[] {
  const sections: PrintSection[] = [];
  let current: PrintSection | null = null;
  for (const token of tokens) {
    if (token.kind === "chapter") {
      current = { title: token.title ?? "", scenes: [] };
      sections.push(current);
      continue;
    }
    if (!current || token.chapterTitle === null && current.title !== null) {
      current = { title: null, scenes: [] };
      sections.push(current);
    }
    current.scenes.push(token.body ?? "");
  }
  return sections;
}

function parsePrintBlocks(source: string): PrintBlock[] {
  const text = markdownBody(source).replace(/<!--[\s\S]*?-->/gu, "");
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const blocks: PrintBlock[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!;
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = /^(?: {0,3})(`{3,}|~{3,})[^\n]*$/u.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const literal: string[] = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^(?: {0,3})${escapeRegExp(marker[0]!)}{${marker.length},}\\s*$`, "u").test(lines[index]!)) {
        literal.push(lines[index]!);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "literal", lines: literal });
      continue;
    }
    const heading = /^(?: {0,3})#{1,6}[\t ]+(.+?)\s*#*\s*$/u.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", runs: parseInlineRuns(heading[1]!) });
      index += 1;
      continue;
    }
    if (/^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u.test(line)) {
      blocks.push({ kind: "separator" });
      index += 1;
      continue;
    }
    const listItem = /^\s{0,3}(?:[-+*]|\d+[.)])\s+(.+)$/u.exec(line);
    if (listItem) {
      blocks.push({ kind: "paragraph", runs: parseInlineRuns(`- ${listItem[1]!}`), indent: false });
      index += 1;
      continue;
    }
    if (/^\s{0,3}>/u.test(line)) {
      const quote: string[] = [];
      while (index < lines.length) {
        const match = /^\s{0,3}>\s?(.*)$/u.exec(lines[index]!);
        if (!match) break;
        quote.push(match[1]!);
        index += 1;
      }
      blocks.push({ kind: "paragraph", runs: parseInlineRuns(quote.join(" ")), indent: false });
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index]!.trim() && !startsPrintBlock(lines[index]!)) {
      paragraph.push(lines[index]!.trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", runs: parseInlineRuns(paragraph.join(" ")), indent: true });
  }
  return blocks;
}

function startsPrintBlock(line: string): boolean {
  return /^(?: {0,3})(?:#{1,6}[\t ]+|`{3,}|~{3,}|>|[-+*]\s+|\d+[.)]\s+)/u.test(line)
    || /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u.test(line);
}

function parseInlineRuns(text: string): StyledRun[] {
  const pattern = /(`+)([^`]+?)\1|!\[([^\]]*)\]\([^)]*\)|\[([^\]]+)\]\([^)]*\)|\[\[([^\]|]+)\|([^\]]+)\]\]|\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!\w)_([^_\n]+)_(?!\w)/gu;
  const runs: StyledRun[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    pushRun(runs, unescapeMarkdown(text.slice(cursor, index)), "regular");
    if (match[1]) pushRun(runs, match[2] ?? "", "regular");
    else if (match[3] !== undefined) pushRun(runs, match[3].trim() ? `[Image: ${match[3].trim()}]` : "[Image]", "italic");
    else if (match[4] !== undefined) pushRun(runs, match[4], "regular");
    else if (match[6] !== undefined) pushRun(runs, match[6], "regular");
    else if (match[5] !== undefined) pushRun(runs, match[5], "regular");
    else if (match[7] !== undefined) pushRun(runs, match[7], "regular");
    else if (match[8] !== undefined) pushRun(runs, match[8], "semibold");
    else if (match[9] !== undefined) pushRun(runs, match[9], "semibold");
    else if (match[10] !== undefined) pushRun(runs, match[10], "regular");
    else pushRun(runs, match[11] ?? match[12] ?? "", "italic");
    cursor = index + match[0].length;
  }
  pushRun(runs, unescapeMarkdown(text.slice(cursor)), "regular");
  return runs;
}

function pushRun(runs: StyledRun[], text: string, style: FontStyle): void {
  if (!text) return;
  const previous = runs.at(-1);
  if (previous?.style === style) previous.text += text;
  else runs.push({ text, style });
}

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_[\]{}()#+\-.!>])/gu, "$1");
}

function wrapStyledRuns(
  runs: readonly StyledRun[],
  fonts: FontSet,
  maxWidth: number,
  firstIndent: number,
): WrappedLine[] {
  const words: StyledWord[] = [];
  let pendingSpace = false;
  for (const run of runs) {
    for (const match of run.text.matchAll(/\s+|\S+/gu)) {
      if (/^\s+$/u.test(match[0])) {
        pendingSpace = true;
        continue;
      }
      words.push({
        text: match[0],
        font: fonts[run.style],
        spaceBefore: words.length > 0 && pendingSpace,
      });
      pendingSpace = false;
    }
  }
  if (words.length === 0) return [];
  const lines: WrappedLine[] = [];
  let current: StyledWord[] = [];
  let width = 0;
  let indent = firstIndent;
  const naturalSpace = fonts.regular.widthOfTextAtSize(" ", PRINT_BODY_FONT_SIZE);

  const flush = (): void => {
    if (current.length === 0) return;
    lines.push({ words: current, width, indent });
    current = [];
    width = 0;
    indent = 0;
  };

  for (const original of words) {
    const fragments = splitOversizedWord(original, maxWidth - indent, PRINT_BODY_FONT_SIZE);
    for (const word of fragments) {
      const wordWidth = word.font.widthOfTextAtSize(word.text, PRINT_BODY_FONT_SIZE);
      const gapWidth = current.length > 0 && word.spaceBefore ? naturalSpace : 0;
      const candidateWidth = width + gapWidth + wordWidth;
      if (current.length > 0 && candidateWidth > maxWidth - indent) flush();
      const placedWord = current.length === 0 ? { ...word, spaceBefore: false } : word;
      if (placedWord.spaceBefore) width += naturalSpace;
      current.push(placedWord);
      width += wordWidth;
    }
  }
  flush();
  return lines;
}

function splitOversizedWord(word: StyledWord, maxWidth: number, size: number): StyledWord[] {
  if (word.font.widthOfTextAtSize(word.text, size) <= maxWidth) return [word];
  const fragments: StyledWord[] = [];
  let fragment = "";
  for (const character of Array.from(word.text)) {
    const candidate = fragment + character;
    if (fragment && word.font.widthOfTextAtSize(candidate, size) > maxWidth) {
      fragments.push({ text: fragment, font: word.font, spaceBefore: fragments.length === 0 && word.spaceBefore });
      fragment = character;
    } else {
      fragment = candidate;
    }
  }
  if (fragment) fragments.push({ text: fragment, font: word.font, spaceBefore: fragments.length === 0 && word.spaceBefore });
  return fragments;
}

function wrapCenteredText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function styleForFont(font: PDFFont, fonts: FontSet): FontStyle {
  if (font === fonts.italic) return "italic";
  if (font === fonts.semibold) return "semibold";
  if (font === fonts.semiboldItalic) return "semiboldItalic";
  return "regular";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
