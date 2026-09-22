# Publishing export targets

Last reviewed: 2026-09-21

This document separates publishing requirements from visual taste. Export defaults should follow current retailer and production guidance first; writer preferences belong only where those standards intentionally allow choice.

## Research conclusion

The app should not treat DOCX and PDF as two generic richer reading copies.

1. **Reflowable EPUB 3 is the primary ebook target.** Amazon KDP accepts EPUB and recommends validating it with Kindle Previewer. Apple Books requires an EPUB upload that passes EPUBCheck. Google Play Books prefers EPUB and supports EPUB 3.3. EPUB is therefore the most portable direct-publishing artifact for a text-heavy novel.
2. **A print-ready PDF interior is a separate target.** Its page size, margins, gutter, font embedding, pagination, bleed, and front matter are physical production decisions. Amazon KDP and IngramSpark both accept print PDFs and require embedded fonts. A PDF intended for print should not be reused as the ebook.
3. **DOCX is an optional editable handoff, not the canonical publishing target.** KDP accepts DOCX and often converts simple books successfully, but EPUB is the cross-retailer ebook standard and PDF is the stable print artifact. DOCX may later help writers work with editors or continue layout in Word, Pages, or Kindle Create.
4. **KPF is not an app export target.** It is Amazon's Kindle Create package rather than a portable retailer-neutral format. A standards-based EPUB can still be inspected with Kindle Previewer before upload.

## Ebook contract

The first publishing adapter should generate a reflowable EPUB 3 publication from the same freshly verified manuscript traversal as Markdown and plain text.

- Use semantic XHTML and one ordered content document per chapter or contiguous loose-scene section.
- Include a navigation document and machine-readable table of contents, and place its linked contents page near the front with a TOC landmark for broad Kindle navigation compatibility.
- Include a simple title page with the exact book title and writer-supplied author name.
- Carry a stable publication identifier derived from the manuscript UUID, an explicit language, and the export modification time.
- Keep planning-only scene titles, synopses, notes, targets, frontmatter, and excluded prose out of the book.
- Render scene boundaries consistently without depending on an image or a particular font.
- Keep typography reflowable and reader-controlled. Do not add page numbers, running headers, running footers, fixed page dimensions, or a bundled body font.
- Use paragraph styles rather than tabs: a modest first-line indent, no artificial blank paragraph between ordinary paragraphs, and no first-line indent immediately after a chapter heading or scene break.
- Escape generated XML safely and preserve only Markdown semantics that the adapter can represent without guessing.
- Package the EPUB according to the W3C specification, including an uncompressed first `mimetype` entry.
- Pass the current EPUBCheck release with no errors before the adapter is considered complete. Packaged QA should also inspect the file in Kindle Previewer on macOS.

The export UI needs only publication metadata that cannot be inferred safely: author display name and language. Title comes from the selected manuscript. Optional dedication, copyright, ISBN, publisher, and cover handling should not block the first standards-compliant body export; they can be added as explicit front-matter inputs later.

### Implementation status

The offline EPUB adapter is implemented as of 2026-09-20. It uses the existing freshly verified compile tokens and the small typed `fflate` ZIP library; it does not upload prose or invoke a conversion service. Author and BCP 47 language are export-only inputs. The output is deterministic for the same approved plan, metadata, and frozen export time, is written with create-new protection, and is reread byte-for-byte before success is reported.

Official EPUBCheck 5.4.0 validated both a generated fixture and the final exact packaged macOS export under EPUB 3.4 rules with zero findings. The packaged run also proved that structure, included sources, excluded source, and daily credit remained unchanged. Kindle Previewer rendered the title and chapter content cleanly, exposed the expected logical navigation, and reported Enhanced Typesetting support. Amazon's current guidance identifies the logical TOC as required and a linked HTML contents page near the front as strongly recommended, so the same navigation document now appears in the spine and declares a TOC landmark. The bundled Amazon converter parsed that final artifact, resolved its hyperlinks, guide items, navigation, and start location, and successfully built both legacy and enhanced Kindle output. Cover packaging remains an explicit later capability because KDP also supports a separately supplied cover.

## Print-interior contract

The print adapter generates a PDF specifically labeled **Print interior**, not a generic PDF ebook.

The first preset should target a text-heavy US novel with no bleed:

- 6 × 9 inch trim, which KDP identifies as the most common US paperback size;
- mirrored inside/outside margins, with the gutter computed from the final page count and never below the retailer minimum;
- a simple readable serif body face with an embeddable commercial-use license, generally within KDP's 9–12 point guidance;
- justified body paragraphs, 0.2 inch first-line indents, zero paragraph spacing, and single/normal line spacing;
- each chapter beginning on a new page with a centered heading;
- no running header or page number on a chapter-opening page;
- sequential pagination and, when enabled, conventional alternating book-title/author running headers;
- all fonts embedded and the resulting page dimensions, page count, and font embedding verified after generation.

Bleed, illustrations, custom trim sizes, covers, hardcover-specific layout, and decorative typesetting are separate capabilities. The first print preset should refuse unsupported content rather than produce a file that only looks plausible.

### Implementation status

The offline print adapter is implemented as of 2026-09-21. It lazily loads `pdf-lib` plus `fontkit` only when the format is selected and uses the same fresh verified compile tokens as every other export. Four official Source Serif 4 TTF faces are bundled under the SIL Open Font License and embedded in every PDF. The deterministic renderer freezes publication metadata; uses exact 432 × 648 point Media, Crop, and Trim boxes; applies conservative mirrored margins and the current KDP page-count gutter bands; sets 11-point justified body prose with 0.2-inch subsequent-paragraph indents; leaves first paragraphs after chapter headings and scene breaks flush; begins each chapter on a new page; and reserves running heads and sequential folios for continuation pages. Markdown image syntax and HTML images are rejected because illustrations and bleed are outside this preset.

The completion report includes the actual PDF page count. It warns below KDP's current 24-page paperback minimum and always directs the writer to KDP Print Previewer and a physical proof. Packaged macOS QA produced a 438,103-byte two-page fixture, mechanically confirmed exact page boxes and all four embedded font programs, extracted the complete expected reading text without planning or excluded prose, and visually inspected both rendered pages. A native replacement attempt reached the app's existing-path check and was refused without changing the artifact. Source files, structure, and daily credit remained unchanged.

## Validation and wording

The app may truthfully call an EPUB **standards-validated** only after EPUBCheck succeeds. It may call a PDF **KDP-oriented print interior** after its mechanical checks pass, but it must still direct the writer to KDP Print Previewer and a physical proof; the app cannot promise retailer acceptance.

Every publishing export retains the existing compile safety contract: one selected manuscript, exact portable order, fresh source verification, complete blocker reporting, native Save As, create-new/no-clobber writing, exact output reread, no source or structure mutation, and no daily writing credit.

## Primary sources

- Amazon KDP, [supported ebook manuscript formats](https://kdp.amazon.com/en_US/help/topic/G200634390)
- Amazon KDP, [ebook manuscript formatting guide](https://kdp.amazon.com/en_US/help/topic/G200645680)
- Amazon KDP, [paths to getting content on Kindle](https://kdp.amazon.com/en_US/help/topic/G79CTKR8BX79E96L)
- Amazon KDP, [creating logical and HTML tables of contents](https://kdp.amazon.com/en_US/help/topic/G201605710)
- Amazon KDP, [Kindle navigation guidelines](https://kdp.amazon.com/en_US/help/topic/GY3AD8C6C6GAG42N)
- Amazon KDP, [paperback and hardcover manuscript templates](https://kdp.amazon.com/en_US/help/topic/G201834230)
- Amazon KDP, [trim size, bleed, and margins](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6)
- Amazon KDP, [saving a print manuscript](https://kdp.amazon.com/en_US/help/topic/G202145060)
- Amazon KDP, [paperback fonts](https://kdp.amazon.com/en_US/help/topic/G202145450)
- Amazon KDP, [paperback submission guidelines and page-count ranges](https://kdp.amazon.com/en_US/help/topic/G201857950)
- Adobe Fonts, [Source Serif repository and OFL license](https://github.com/adobe-fonts/source-serif)
- W3C, [EPUB 3.3 Recommendation](https://www.w3.org/TR/epub-33/)
- Apple Books for Authors, [publishing from the web](https://authors.apple.com/support/4574-publish-book-from-web)
- Google Play Books, [EPUB file guidance](https://support.google.com/books/partner/answer/3316879)
- IngramSpark, [File Creation Guide](https://www.ingramspark.com/hubfs/downloads/file-creation-guide.pdf)
