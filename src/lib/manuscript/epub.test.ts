import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  buildManuscriptEpub,
  equalBytes,
  validateManuscriptEpubMetadata,
} from "./epub";

const MANUSCRIPT_ID = "7339b0ee-5f87-493d-bcad-e56636d7cb26";
const MODIFIED = "2026-09-20T16:00:00Z";

describe("standards-based EPUB packaging", () => {
  it("requires explicit author and a valid publication language", () => {
    expect(validateManuscriptEpubMetadata({ author: "", language: "en", modifiedAt: MODIFIED })).toMatchObject({ kind: "invalid" });
    expect(validateManuscriptEpubMetadata({ author: "Pat", language: "not a language", modifiedAt: MODIFIED })).toMatchObject({ kind: "invalid" });
    expect(validateManuscriptEpubMetadata({ author: "  Pat Example  ", language: "en-us", modifiedAt: MODIFIED })).toEqual({
      kind: "valid",
      metadata: { author: "Pat Example", language: "en-US", modifiedAt: MODIFIED },
    });
  });

  it("builds a deterministic reflowable package with an uncompressed first mimetype entry", () => {
    const input = {
      manuscriptId: MANUSCRIPT_ID,
      title: "The Patient & Comet",
      metadata: { author: "Pat <Example>", language: "en-US", modifiedAt: MODIFIED },
      tokens: [
        { kind: "scene" as const, body: "A loose opening.", chapterTitle: null },
        { kind: "chapter" as const, title: "Signals & Dust" },
        { kind: "scene" as const, body: "First *signal*.\n\nSecond paragraph.", chapterTitle: "Signals & Dust" },
        { kind: "scene" as const, body: "A **reply**.", chapterTitle: "Signals & Dust" },
        { kind: "scene" as const, body: "A loose ending.", chapterTitle: null },
      ],
    };
    const first = buildManuscriptEpub(input);
    const second = buildManuscriptEpub(input);
    expect(equalBytes(first, second)).toBe(true);

    expect(Array.from(first.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(first[8]).toBe(0);
    expect(first[9]).toBe(0);
    const filenameLength = first[26]! | first[27]! << 8;
    const extraFieldLength = first[28]! | first[29]! << 8;
    expect(strFromU8(first.slice(30, 30 + filenameLength))).toBe("mimetype");
    expect(extraFieldLength).toBe(0);

    const files = unzipSync(first);
    expect(strFromU8(files.mimetype!)).toBe("application/epub+zip");
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      "META-INF/container.xml",
      "EPUB/package.opf",
      "EPUB/nav.xhtml",
      "EPUB/title.xhtml",
      "EPUB/styles.css",
      "EPUB/section-001.xhtml",
      "EPUB/section-002.xhtml",
      "EPUB/section-003.xhtml",
    ]));

    const packageXml = strFromU8(files["EPUB/package.opf"]!);
    expect(packageXml).toContain(`<dc:identifier id="publication-id">urn:uuid:${MANUSCRIPT_ID}</dc:identifier>`);
    expect(packageXml).toContain("<dc:title>The Patient &amp; Comet</dc:title>");
    expect(packageXml).toContain("<dc:creator>Pat &lt;Example&gt;</dc:creator>");
    expect(packageXml).toContain("<dc:language>en-US</dc:language>");
    expect(packageXml).toContain(`<meta property="dcterms:modified">${MODIFIED}</meta>`);

    const nav = strFromU8(files["EPUB/nav.xhtml"]!);
    expect(nav).toContain("Signals &amp; Dust");
    expect(nav).not.toContain("loose opening");
    const chapter = strFromU8(files["EPUB/section-002.xhtml"]!);
    expect(chapter).toContain("<h1>Signals &amp; Dust</h1>");
    expect(chapter).toContain("First <em>signal</em>.");
    expect(chapter).toContain("A <strong>reply</strong>.");
    expect(chapter).toContain(`class="scene-break" role="separator" aria-label="Scene break">* * *</div>`);
    expect(strFromU8(files["EPUB/styles.css"]!)).not.toContain("font-family");
  });
});
