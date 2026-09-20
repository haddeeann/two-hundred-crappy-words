import { strToU8, zipSync, type Zippable } from "fflate";
import { markdownBody, type ManuscriptCompileToken } from "./compile";

export interface ManuscriptEpubMetadata {
  author: string;
  language: string;
  modifiedAt: string;
}

export interface ManuscriptEpubInput {
  manuscriptId: string;
  title: string;
  tokens: readonly ManuscriptCompileToken[];
  metadata: ManuscriptEpubMetadata;
}

export interface ValidatedManuscriptEpubMetadata extends ManuscriptEpubMetadata {
  author: string;
  language: string;
  modifiedAt: string;
}

interface EpubSection {
  title: string | null;
  scenes: string[];
}

const EPUB_MIMETYPE = "application/epub+zip";
const ZIP_TIMESTAMP = new Date(1980, 0, 1);

export function validateManuscriptEpubMetadata(
  metadata: ManuscriptEpubMetadata,
): { kind: "valid"; metadata: ValidatedManuscriptEpubMetadata } | { kind: "invalid"; message: string } {
  const author = metadata.author.normalize("NFC").trim();
  if (!author) return { kind: "invalid", message: "Enter the author name exactly as it will appear at the retailer." };
  if (author.length > 200) return { kind: "invalid", message: "Author name must be 200 characters or fewer." };

  let language: string;
  try {
    language = new Intl.Locale(metadata.language.trim()).toString();
  } catch {
    return { kind: "invalid", message: "Enter a valid language tag such as en, en-US, or fr." };
  }
  const modified = new Date(metadata.modifiedAt);
  if (!Number.isFinite(modified.getTime())) {
    return { kind: "invalid", message: "The export modification time is invalid." };
  }
  return {
    kind: "valid",
    metadata: {
      author,
      language,
      modifiedAt: modified.toISOString().replace(/\.\d{3}Z$/u, "Z"),
    },
  };
}

export function buildManuscriptEpub(input: ManuscriptEpubInput): Uint8Array {
  const validated = validateManuscriptEpubMetadata(input.metadata);
  if (validated.kind === "invalid") throw new Error(validated.message);
  const metadata = validated.metadata;
  const sections = compileSections(input.tokens);
  const files: Zippable = {};
  files.mimetype = [strToU8(EPUB_MIMETYPE), { level: 0 }];
  files["META-INF/container.xml"] = strToU8(containerXml());
  files["EPUB/styles.css"] = strToU8(stylesheet());
  files["EPUB/title.xhtml"] = strToU8(titlePage(input.title, metadata));

  const sectionFiles = sections.map((section, index) => {
    const filename = `section-${String(index + 1).padStart(3, "0")}.xhtml`;
    files[`EPUB/${filename}`] = strToU8(sectionPage(section, metadata.language));
    return { section, filename, id: `section-${index + 1}` };
  });
  files["EPUB/nav.xhtml"] = strToU8(navigationPage(input.title, metadata.language, sectionFiles));
  files["EPUB/package.opf"] = strToU8(packageDocument(input, metadata, sectionFiles));

  return zipSync(files, { level: 6, mtime: ZIP_TIMESTAMP });
}

export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function compileSections(tokens: readonly ManuscriptCompileToken[]): EpubSection[] {
  const sections: EpubSection[] = [];
  let current: EpubSection | null = null;
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

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

function packageDocument(
  input: ManuscriptEpubInput,
  metadata: ValidatedManuscriptEpubMetadata,
  sectionFiles: readonly { filename: string; id: string }[],
): string {
  const manifest = sectionFiles
    .map(({ filename, id }) => `    <item id="${id}" href="${filename}" media-type="application/xhtml+xml"/>`)
    .join("\n");
  const spine = sectionFiles.map(({ id }) => `    <itemref idref="${id}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="publication-id" xml:lang="${escapeXml(metadata.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="publication-id">urn:uuid:${escapeXml(input.manuscriptId)}</dc:identifier>
    <dc:title>${escapeXml(input.title)}</dc:title>
    <dc:creator>${escapeXml(metadata.author)}</dc:creator>
    <dc:language>${escapeXml(metadata.language)}</dc:language>
    <meta property="dcterms:modified">${escapeXml(metadata.modifiedAt)}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="styles" href="styles.css" media-type="text/css"/>
    <item id="title-page" href="title.xhtml" media-type="application/xhtml+xml"/>
${manifest}
  </manifest>
  <spine>
    <itemref idref="title-page"/>
${spine}
  </spine>
</package>
`;
}

function navigationPage(
  title: string,
  language: string,
  sectionFiles: readonly { section: EpubSection; filename: string }[],
): string {
  const chapters = sectionFiles
    .filter(({ section }) => section.title !== null)
    .map(({ section, filename }) => `        <li><a href="${filename}">${escapeXml(section.title ?? "")}</a></li>`)
    .join("\n");
  return xhtmlDocument({
    title: `Contents — ${title}`,
    language,
    body: `    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>
        <li><a href="title.xhtml">${escapeXml(title)}</a></li>${chapters ? `\n${chapters}` : ""}
      </ol>
    </nav>`,
    includeEpubNamespace: true,
  });
}

function titlePage(title: string, metadata: ValidatedManuscriptEpubMetadata): string {
  return xhtmlDocument({
    title,
    language: metadata.language,
    body: `    <section class="title-page" epub:type="titlepage">
      <h1>${escapeXml(title)}</h1>
      <p>${escapeXml(metadata.author)}</p>
    </section>`,
    includeEpubNamespace: true,
  });
}

function sectionPage(section: EpubSection, language: string): string {
  const scenes = section.scenes
    .map((scene, index) => `${index > 0 ? "    <div class=\"scene-break\" role=\"separator\" aria-label=\"Scene break\">* * *</div>\n" : ""}${renderMarkdownBody(scene)}`)
    .join("\n");
  const heading = section.title === null ? "" : `    <h1>${escapeXml(section.title)}</h1>\n`;
  return xhtmlDocument({
    title: section.title ?? "Manuscript",
    language,
    body: `    <section class="book-section">
${heading}${scenes}
    </section>`,
  });
}

function xhtmlDocument({
  title,
  language,
  body,
  includeEpubNamespace = false,
}: {
  title: string;
  language: string;
  body: string;
  includeEpubNamespace?: boolean;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"${includeEpubNamespace ? " xmlns:epub=\"http://www.idpf.org/2007/ops\"" : ""} lang="${escapeXml(language)}" xml:lang="${escapeXml(language)}">
  <head>
    <meta charset="UTF-8"/>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
  </head>
  <body>
${body}
  </body>
</html>
`;
}

function stylesheet(): string {
  return `body {
  line-height: normal;
  orphans: 2;
  widows: 2;
}
h1 {
  margin: 2em 0 1.5em;
  text-align: center;
}
p {
  margin: 0;
  text-indent: 1.2em;
}
h1 + p,
.scene-break + p,
.title-page p {
  text-indent: 0;
}
.scene-break {
  margin: 1.5em auto;
  text-align: center;
}
.title-page {
  margin-top: 20%;
  text-align: center;
}
.title-page h1 {
  margin-bottom: 2em;
}
blockquote {
  margin: 1em 2em;
}
pre {
  white-space: pre-wrap;
}
`;
}

function renderMarkdownBody(source: string): string {
  const text = markdownBody(source).replace(/<!--[\s\S]*?-->/gu, "");
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const output: string[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!;
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = /^(?: {0,3})(`{3,}|~{3,})[^\n]*$/u.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^(?: {0,3})${escapeRegExp(marker[0]!)}{${marker.length},}\\s*$`, "u").test(lines[index]!)) {
        code.push(lines[index]!);
        index += 1;
      }
      if (index < lines.length) index += 1;
      output.push(`    <pre><code>${escapeXml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = /^(?: {0,3})(#{1,6})[\t ]+(.+?)\s*#*\s*$/u.exec(line);
    if (heading) {
      const level = Math.min(6, heading[1]!.length + 1);
      output.push(`    <h${level}>${renderInlineMarkdown(heading[2]!)}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u.test(line)) {
      output.push("    <hr/>");
      index += 1;
      continue;
    }
    const bullet = /^\s{0,3}[-+*]\s+(.+)$/u.exec(line);
    const numbered = /^\s{0,3}\d+[.)]\s+(.+)$/u.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items: string[] = [];
      while (index < lines.length) {
        const match = ordered
          ? /^\s{0,3}\d+[.)]\s+(.+)$/u.exec(lines[index]!)
          : /^\s{0,3}[-+*]\s+(.+)$/u.exec(lines[index]!);
        if (!match) break;
        items.push(`      <li>${renderInlineMarkdown(match[1]!)}</li>`);
        index += 1;
      }
      const tag = ordered ? "ol" : "ul";
      output.push(`    <${tag}>\n${items.join("\n")}\n    </${tag}>`);
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
      output.push(`    <blockquote><p>${renderInlineMarkdown(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index]!.trim() && !startsBlock(lines[index]!)) {
      paragraph.push(lines[index]!.trim());
      index += 1;
    }
    output.push(`    <p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
  }
  return output.join("\n");
}

function startsBlock(line: string): boolean {
  return /^(?: {0,3})(?:#{1,6}[\t ]+|`{3,}|~{3,}|>|[-+*]\s+|\d+[.)]\s+)/u.test(line)
    || /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u.test(line);
}

function renderInlineMarkdown(text: string): string {
  const pattern = /(`+)([^`]+?)\1|!\[([^\]]*)\]\([^)]*\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|\[\[([^\]|]+)\|([^\]]+)\]\]|\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!\w)_([^_\n]+)_(?!\w)/gu;
  let result = "";
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    result += escapeXml(text.slice(cursor, index));
    if (match[1]) result += `<code>${escapeXml(match[2] ?? "")}</code>`;
    else if (match[3] !== undefined) result += escapeXml(match[3].trim() ? `[Image: ${match[3].trim()}]` : "[Image]");
    else if (match[4] !== undefined) result += `<a href="${escapeXml(match[5] ?? "")}">${escapeXml(match[4])}</a>`;
    else if (match[7] !== undefined) result += escapeXml(match[7]);
    else if (match[6] !== undefined) result += escapeXml(match[6]);
    else if (match[8] !== undefined) result += escapeXml(match[8]);
    else if (match[9] !== undefined) result += `<strong>${escapeXml(match[9])}</strong>`;
    else if (match[10] !== undefined) result += `<strong>${escapeXml(match[10])}</strong>`;
    else if (match[11] !== undefined) result += `<s>${escapeXml(match[11])}</s>`;
    else result += `<em>${escapeXml(match[12] ?? match[13] ?? "")}</em>`;
    cursor = index + match[0].length;
  }
  return result + escapeXml(text.slice(cursor));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
