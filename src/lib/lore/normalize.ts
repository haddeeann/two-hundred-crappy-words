const MARKDOWN_EXTENSION_PATTERN = /\.(?:md|markdown)$/iu;

export function markdownFileStem(path: string): string {
  const name = path.split("/").at(-1) ?? path;
  return name.replace(MARKDOWN_EXTENSION_PATTERN, "");
}

export function relativeMarkdownStem(path: string): string {
  return path.replace(MARKDOWN_EXTENSION_PATTERN, "");
}

export function normalizeLoreName(value: string): string {
  return normalizeLoreSearchText(value.trim());
}

export function normalizeLoreSearchText(value: string): string {
  return value
    .normalize("NFC")
    .toUpperCase()
    .toLowerCase()
    .normalize("NFC");
}

export function simplifyHeadingText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/[`*_~]+/gu, "")
    .replace(/^\s*[\[\]()]+|[\[\]()]+\s*$/gu, "")
    .trim();
}

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSION_PATTERN.test(path);
}
