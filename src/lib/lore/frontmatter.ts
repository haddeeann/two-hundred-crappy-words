import { validateProjectId, validateProjectName } from "$lib/project/manifest";
import { normalizeLoreName } from "./normalize";
import { lineStartsFor, sourceRange } from "./source";
import type { LoreIssue, ParsedFrontmatter } from "./types";

const TYPE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const MAX_ALIASES = 32;
const MAX_ALIAS_CODE_POINTS = 120;

interface FrontmatterLine {
  text: string;
  start: number;
  end: number;
}

export function parseFrontmatter(text: string): ParsedFrontmatter {
  const lineStarts = lineStartsFor(text);
  const empty: ParsedFrontmatter = {
    range: null,
    bodyStart: 0,
    id: null,
    type: null,
    title: null,
    aliases: [],
    issues: [],
  };
  if (!isDelimiterLine(readLine(text, 0).text)) return empty;

  const opening = readLine(text, 0);
  let cursor = opening.next;
  let closing: ReturnType<typeof readLine> | null = null;
  const lines: FrontmatterLine[] = [];
  while (cursor < text.length) {
    const line = readLine(text, cursor);
    if (isDelimiterLine(line.text)) {
      closing = line;
      break;
    }
    lines.push({ text: line.text, start: cursor, end: line.contentEnd });
    cursor = line.next;
  }

  if (!closing) {
    return {
      ...empty,
      bodyStart: opening.next,
      issues: [
        issue(
          "frontmatter-malformed",
          "Opening frontmatter has no closing --- delimiter; metadata was ignored.",
          0,
          opening.contentEnd,
          lineStarts,
        ),
      ],
    };
  }

  const result: ParsedFrontmatter = {
    ...empty,
    range: sourceRange(0, closing.next, lineStarts),
    bodyStart: closing.next,
  };
  const scalarValues = new Map<string, { value: string; line: FrontmatterLine }[]>();
  const aliasValues: { value: string; line: FrontmatterLine }[] = [];
  let aliasBlock: FrontmatterLine | null = null;
  let aliasesDuplicated = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.text.trim() || /^\s*#/u.test(line.text)) continue;
    const field = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/u.exec(line.text);
    if (!field) {
      result.issues.push(
        issue(
          "frontmatter-malformed",
          "Unsupported frontmatter syntax was ignored.",
          line.start,
          line.end,
          lineStarts,
        ),
      );
      continue;
    }
    const key = field[1]!;
    const raw = field[2] ?? "";
    if (key === "aliases") {
      const duplicateBlock = aliasBlock !== null;
      if (duplicateBlock) {
        aliasesDuplicated = true;
        result.issues.push(
          issue(
            "duplicate-metadata",
            "Duplicate aliases metadata was ignored.",
            line.start,
            line.end,
            lineStarts,
          ),
        );
      } else {
        aliasBlock = line;
      }
      if (raw.trim()) {
        result.issues.push(
          issue(
            "frontmatter-field",
            "aliases must be a block sequence of quoted strings.",
            line.start,
            line.end,
            lineStarts,
          ),
        );
        continue;
      }
      while (index + 1 < lines.length) {
        const candidate = lines[index + 1]!;
        if (!/^\s+/u.test(candidate.text)) break;
        index += 1;
        if (!candidate.text.trim() || /^\s*#/u.test(candidate.text)) continue;
        const item = /^\s+-\s+(.*)$/u.exec(candidate.text);
        if (!item) {
          result.issues.push(
            issue(
              "frontmatter-field",
              "Each alias must be a quoted block-sequence item.",
              candidate.start,
              candidate.end,
              lineStarts,
            ),
          );
          continue;
        }
        const decoded = parseQuotedString(item[1]!);
        if (decoded === null) {
          result.issues.push(
            issue(
              "frontmatter-field",
              "Each alias must be a JSON-compatible quoted string.",
              candidate.start,
              candidate.end,
              lineStarts,
            ),
          );
        } else if (!duplicateBlock) {
          aliasValues.push({ value: decoded, line: candidate });
        }
      }
      continue;
    }
    if (key !== "id" && key !== "type" && key !== "title") continue;
    const decoded = parseQuotedString(raw);
    if (decoded === null) {
      result.issues.push(
        issue(
          "frontmatter-field",
          `${key} must be a JSON-compatible quoted string.`,
          line.start,
          line.end,
          lineStarts,
        ),
      );
      continue;
    }
    const values = scalarValues.get(key) ?? [];
    values.push({ value: decoded, line });
    scalarValues.set(key, values);
  }

  for (const key of ["id", "type", "title"] as const) {
    const values = scalarValues.get(key) ?? [];
    if (values.length > 1) {
      result.issues.push(
        issue(
          "duplicate-metadata",
          `Duplicate ${key} metadata was ignored.`,
          values[1]!.line.start,
          values.at(-1)!.line.end,
          lineStarts,
        ),
      );
      continue;
    }
    const value = values[0]?.value;
    if (value === undefined) continue;
    const validation = validateScalar(key, value);
    if (validation) {
      result.issues.push(
        issue(
          "frontmatter-field",
          validation,
          values[0]!.line.start,
          values[0]!.line.end,
          lineStarts,
        ),
      );
    } else {
      result[key] = value.trim();
    }
  }

  const normalizedAliases = new Set<string>();
  for (const { value, line } of aliasesDuplicated ? [] : aliasValues) {
    const alias = value.trim();
    const aliasIssue = validateAlias(alias);
    if (aliasIssue) {
      result.issues.push(
        issue("frontmatter-field", aliasIssue, line.start, line.end, lineStarts),
      );
      continue;
    }
    const normalized = normalizeLoreName(alias);
    if (normalizedAliases.has(normalized)) {
      result.issues.push(
        issue(
          "duplicate-alias",
          `Duplicate alias “${alias}” was ignored.`,
          line.start,
          line.end,
          lineStarts,
        ),
      );
      continue;
    }
    if (result.aliases.length >= MAX_ALIASES) {
      result.issues.push(
        issue(
          "frontmatter-field",
          `Only the first ${MAX_ALIASES} valid aliases are indexed.`,
          line.start,
          line.end,
          lineStarts,
        ),
      );
      continue;
    }
    normalizedAliases.add(normalized);
    result.aliases.push(alias);
  }
  result.issues.sort(
    (first, second) => first.range.start - second.range.start || first.range.end - second.range.end,
  );
  return result;
}

function validateScalar(key: "id" | "type" | "title", value: string): string | null {
  if (key === "id") return validateProjectId(value)?.replace("projectId", "id") ?? null;
  if (key === "title") {
    return validateProjectName(value)?.replace("name", "title") ?? null;
  }
  return TYPE_PATTERN.test(value)
    ? null
    : "type must use lowercase kebab-case text.";
}

function validateAlias(value: string): string | null {
  if (!value) return "An alias must not be empty.";
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    return "An alias must not contain control characters.";
  }
  if ([...value].length > MAX_ALIAS_CODE_POINTS) {
    return `An alias must contain at most ${MAX_ALIAS_CODE_POINTS} Unicode characters.`;
  }
  return null;
}

function parseQuotedString(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return null;
  try {
    const value: unknown = JSON.parse(trimmed);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function isDelimiterLine(line: string): boolean {
  return line.replace(/\r$/u, "") === "---";
}

function readLine(text: string, start: number): {
  text: string;
  contentEnd: number;
  next: number;
} {
  const newline = text.indexOf("\n", start);
  const contentEnd = newline === -1 ? text.length : newline;
  return {
    text: text.slice(start, contentEnd).replace(/\r$/u, ""),
    contentEnd,
    next: newline === -1 ? text.length : newline + 1,
  };
}

function issue(
  kind: LoreIssue["kind"],
  message: string,
  start: number,
  end: number,
  lineStarts: readonly number[],
): LoreIssue {
  return { kind, message, range: sourceRange(start, end, lineStarts) };
}
