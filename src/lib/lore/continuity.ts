import { validateProjectId } from "$lib/project/manifest";
import { sourceRange } from "./source";
import {
  CANON_STATUSES,
  CONTINUITY_CERTAINTIES,
  type CanonStatus,
  type ContinuityCertainty,
  type ContinuityTimeValue,
  type ContinuityValue,
  type LoreIssue,
  type ParsedContinuityFact,
  type SourceRange,
} from "./types";

export const CONTINUITY_FACT_FORMAT_VERSION = 1 as const;
export const MAX_CONTINUITY_FACTS = 256;
export const MAX_CONTINUITY_FRONTMATTER_BYTES = 256 * 1024;

export const BUILT_IN_CONTINUITY_PROPERTIES = [
  "born",
  "died",
  "occurs-at",
  "ends-at",
  "located-at",
  "participant",
  "instance-of",
  "species",
  "member-of",
  "parent-of",
  "partner-of",
  "operated-by",
  "home-port",
] as const;

export interface ContinuitySourceLine {
  text: string;
  start: number;
  end: number;
}

interface ParsedField {
  key: string;
  value: string | null;
  children: Map<string, ParsedField>;
  range: SourceRange;
}

interface FactGroup {
  lines: ContinuitySourceLine[];
  firstContent: string;
  malformedStart: boolean;
}

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const KEBAB_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const FACT_FIELDS = new Set([
  "id",
  "property",
  "value",
  "canon",
  "certainty",
  "validFrom",
  "validTo",
  "note",
]);

export function isCanonStatus(value: string): value is CanonStatus {
  return (CANON_STATUSES as readonly string[]).includes(value);
}

export function parseContinuityFacts(
  lines: readonly ContinuitySourceLine[],
  lineStarts: readonly number[],
): { facts: ParsedContinuityFact[]; issues: LoreIssue[] } {
  const groups: FactGroup[] = [];
  const issues: LoreIssue[] = [];
  let current: FactGroup | null = null;

  for (const line of lines) {
    if (!line.text.trim() || /^\s*#/u.test(line.text)) {
      if (current) current.lines.push(line);
      continue;
    }
    const item = /^ {2}-(?:\s+(.*))?$/u.exec(line.text);
    if (item) {
      current = {
        lines: [line],
        firstContent: item[1] ?? "",
        malformedStart: !item[1],
      };
      groups.push(current);
      continue;
    }
    if (!current) {
      issues.push(
        continuityIssue(
          "facts must be a block sequence with two-space-indented items.",
          line,
          lineStarts,
        ),
      );
      continue;
    }
    current.lines.push(line);
  }

  const facts: ParsedContinuityFact[] = [];
  for (const group of groups.slice(0, MAX_CONTINUITY_FACTS)) {
    const parsed = parseFactGroup(group, lineStarts);
    issues.push(...parsed.issues);
    if (parsed.fact) facts.push(parsed.fact);
  }
  if (groups.length > MAX_CONTINUITY_FACTS) {
    for (const group of groups.slice(MAX_CONTINUITY_FACTS)) {
      issues.push(
        continuityIssue(
          `Only the first ${MAX_CONTINUITY_FACTS} continuity facts are accepted.`,
          group.lines[0]!,
          lineStarts,
        ),
      );
    }
  }

  const idCounts = new Map<string, number>();
  for (const fact of facts) idCounts.set(fact.id, (idCounts.get(fact.id) ?? 0) + 1);
  const uniqueFacts = facts.filter((fact) => {
    if (idCounts.get(fact.id) === 1) return true;
    issues.push({
      kind: "duplicate-metadata",
      message: `Duplicate continuity fact ID ${fact.id} was ignored.`,
      range: fact.fieldRanges.id ?? fact.range,
    });
    return false;
  });

  return { facts: uniqueFacts, issues };
}

function parseFactGroup(
  group: FactGroup,
  lineStarts: readonly number[],
): { fact: ParsedContinuityFact | null; issues: LoreIssue[] } {
  const issues: LoreIssue[] = [];
  const first = group.lines[0]!;
  const last = [...group.lines].reverse().find((line) => line.text.trim()) ?? first;
  const factRange = sourceRange(first.start, last.end, lineStarts);
  if (group.malformedStart) {
    return {
      fact: null,
      issues: [continuityIssue("Each fact item must begin with a field.", first, lineStarts)],
    };
  }

  const fields = new Map<string, ParsedField>();
  let activeMapping: ParsedField | null = null;

  for (let index = 0; index < group.lines.length; index += 1) {
    const line = group.lines[index]!;
    if (!line.text.trim() || /^\s*#/u.test(line.text)) continue;
    let content: string;
    let indent: number;
    if (index === 0) {
      content = group.firstContent;
      indent = 4;
    } else {
      if (line.text.includes("\t")) {
        issues.push(
          continuityIssue("Continuity facts use spaces, not tabs.", line, lineStarts),
        );
        continue;
      }
      indent = line.text.length - line.text.trimStart().length;
      content = line.text.slice(indent);
    }

    if (indent !== 4 && indent !== 6) {
      issues.push(
        continuityIssue(
          "Fact fields use four spaces and nested value fields use six spaces.",
          line,
          lineStarts,
        ),
      );
      continue;
    }
    const parsed = parseFieldLine(content, line, lineStarts);
    if (!parsed.field) {
      issues.push(parsed.issue!);
      continue;
    }

    if (indent === 4) {
      activeMapping = parsed.field.value === null ? parsed.field : null;
      addField(fields, parsed.field, issues);
      continue;
    }
    if (!activeMapping || activeMapping.value !== null) {
      issues.push(
        continuityIssue(
          "A nested value field must follow a mapping field such as value, validFrom, or validTo.",
          line,
          lineStarts,
        ),
      );
      continue;
    }
    if (parsed.field.value === null) {
      issues.push(
        continuityIssue(
          "Continuity fact mappings may not be nested more than one level.",
          line,
          lineStarts,
        ),
      );
      continue;
    }
    addField(activeMapping.children, parsed.field, issues);
    activeMapping.range = sourceRange(
      activeMapping.range.start,
      parsed.field.range.end,
      lineStarts,
    );
  }

  if (issues.length) return { fact: null, issues };
  const semantic = buildFact(fields, factRange);
  return { fact: semantic.fact, issues: semantic.issues };
}

function parseFieldLine(
  content: string,
  line: ContinuitySourceLine,
  lineStarts: readonly number[],
): { field: ParsedField | null; issue: LoreIssue | null } {
  const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/u.exec(content);
  if (
    !match ||
    !KEY_PATTERN.test(match[1]!) ||
    [...match[1]!].length > 80
  ) {
    return {
      field: null,
      issue: continuityIssue(
        "Each continuity field must use a plain key of at most 80 characters followed by a quoted string or nested mapping.",
        line,
        lineStarts,
      ),
    };
  }
  const raw = match[2] ?? "";
  if (!raw.trim()) {
    return {
      field: {
        key: match[1]!,
        value: null,
        children: new Map(),
        range: sourceRange(line.start, line.end, lineStarts),
      },
      issue: null,
    };
  }
  const value = parseQuotedString(raw);
  if (value === null) {
    return {
      field: null,
      issue: continuityIssue(
        "Continuity values must be JSON-compatible double-quoted strings; tags, anchors, aliases, merge keys, implicit dates, and unquoted values are not accepted.",
        line,
        lineStarts,
      ),
    };
  }
  return {
    field: {
      key: match[1]!,
      value,
      children: new Map(),
      range: sourceRange(line.start, line.end, lineStarts),
    },
    issue: null,
  };
}

function addField(
  target: Map<string, ParsedField>,
  field: ParsedField,
  issues: LoreIssue[],
): void {
  if (target.has(field.key)) {
    issues.push({
      kind: "duplicate-metadata",
      message: `Duplicate continuity field ${field.key} was ignored with its fact.`,
      range: field.range,
    });
    return;
  }
  target.set(field.key, field);
}

function buildFact(
  fields: ReadonlyMap<string, ParsedField>,
  range: SourceRange,
): { fact: ParsedContinuityFact | null; issues: LoreIssue[] } {
  const issues: LoreIssue[] = [];
  const id = requiredScalar(fields, "id", issues, range);
  const property = requiredScalar(fields, "property", issues, range);
  const valueField = requiredMapping(fields, "value", issues, range);
  const canon = optionalEnum(fields, "canon", CANON_STATUSES, issues);
  const certainty = optionalEnum(
    fields,
    "certainty",
    CONTINUITY_CERTAINTIES,
    issues,
  );
  const note = optionalScalar(fields, "note", issues);
  const validFrom = optionalTime(fields, "validFrom", issues);
  const validTo = optionalTime(fields, "validTo", issues);

  if (id !== null && validateProjectId(id)) {
    issues.push(fieldIssue(fields.get("id"), "id must be a canonical lowercase UUID v4."));
  }
  if (
    property !== null &&
    (!KEBAB_PATTERN.test(property) || [...property].length > 80)
  ) {
    issues.push(
      fieldIssue(
        fields.get("property"),
        "property must use at most 80 lowercase kebab-case characters.",
      ),
    );
  }
  if (note !== null) validateBoundedText(note, "note", 1_000, fields.get("note"), issues);
  const value = valueField ? buildValue(valueField, issues) : null;

  if (issues.length || id === null || property === null || value === null) {
    return { fact: null, issues };
  }
  return {
    fact: {
      id,
      property,
      value,
      canon: canon as CanonStatus | null,
      certainty: certainty as ContinuityCertainty | null,
      validFrom,
      validTo,
      note,
      range,
      fieldRanges: Object.fromEntries(
        [...fields].map(([key, field]) => [key, field.range]),
      ),
      unknownKeys: [...fields.keys()].filter((key) => !FACT_FIELDS.has(key)),
    },
    issues,
  };
}

function buildValue(field: ParsedField, issues: LoreIssue[]): ContinuityValue | null {
  const fields = field.children;
  const kind = requiredScalar(fields, "kind", issues, field.range);
  if (!kind) return null;
  const source = valueSource(field);
  if (kind === "note") {
    const id = requiredScalar(fields, "id", issues, field.range);
    if (id !== null && validateProjectId(id)) {
      issues.push(fieldIssue(fields.get("id"), "A note value ID must be a canonical lowercase UUID v4."));
    }
    return id && !issues.length ? { ...source, kind, id } : null;
  }
  if (kind === "text") {
    const text = requiredScalar(fields, "text", issues, field.range);
    if (text !== null) validateBoundedText(text, "text", 1_000, fields.get("text"), issues);
    return text !== null && !issues.length ? { ...source, kind, text } : null;
  }
  if (kind === "quantity") {
    const amount = decimalField(fields, "amount", issues, field.range);
    const unitSystem = kebabField(fields, "unitSystem", issues, field.range);
    const unit = boundedField(fields, "unit", 80, issues, field.range);
    return amount && unitSystem && unit && !issues.length
      ? { ...source, kind, amount, unitSystem, unit }
      : null;
  }
  if (kind === "range") {
    const minimum = decimalField(fields, "minimum", issues, field.range);
    const maximum = decimalField(fields, "maximum", issues, field.range);
    const unitSystem = kebabField(fields, "unitSystem", issues, field.range);
    const unit = boundedField(fields, "unit", 80, issues, field.range);
    if (minimum && maximum && compareDecimals(minimum, maximum) > 0) {
      issues.push(
        fieldIssue(fields.get("maximum"), "maximum must be greater than or equal to minimum."),
      );
    }
    return minimum && maximum && unitSystem && unit && !issues.length
      ? { ...source, kind, minimum, maximum, unitSystem, unit }
      : null;
  }
  if (kind === "time") return buildTimeValue(field, issues);
  if (kind === "unknown") {
    const reason = requiredScalar(fields, "reason", issues, field.range);
    if (reason !== null) {
      validateBoundedText(reason, "reason", 1_000, fields.get("reason"), issues);
    }
    return reason !== null && !issues.length ? { ...source, kind, reason } : null;
  }
  issues.push(
    fieldIssue(
      fields.get("kind"),
      "kind must be note, text, quantity, range, time, or unknown.",
    ),
  );
  return null;
}

function buildTimeValue(
  field: ParsedField,
  issues: LoreIssue[],
): ContinuityTimeValue | null {
  const fields = field.children;
  const kind = requiredScalar(fields, "kind", issues, field.range);
  const calendar = kebabField(fields, "calendar", issues, field.range);
  const expression = boundedField(fields, "expression", 120, issues, field.range);
  if (kind !== null && kind !== "time") {
    issues.push(fieldIssue(fields.get("kind"), "A time bound must have kind time."));
  }
  if (calendar === "gregorian" && expression && !isGregorianExpression(expression)) {
    issues.push(
      fieldIssue(
        fields.get("expression"),
        "A Gregorian expression must be a year, year-month, full date, or closed start/end interval.",
      ),
    );
  }
  return kind === "time" && calendar && expression && !issues.length
    ? { ...valueSource(field), kind, calendar, expression }
    : null;
}

function optionalTime(
  fields: ReadonlyMap<string, ParsedField>,
  key: string,
  issues: LoreIssue[],
): ContinuityTimeValue | null {
  const field = fields.get(key);
  if (!field) return null;
  if (field.value !== null) {
    issues.push(fieldIssue(field, `${key} must be a nested time mapping.`));
    return null;
  }
  return buildTimeValue(field, issues);
}

function valueSource(field: ParsedField): {
  range: SourceRange;
  fieldRanges: Readonly<Record<string, SourceRange>>;
  unknownKeys: readonly string[];
} {
  const known = new Set([
    "kind",
    "id",
    "text",
    "amount",
    "unitSystem",
    "unit",
    "minimum",
    "maximum",
    "calendar",
    "expression",
    "reason",
  ]);
  return {
    range: field.range,
    fieldRanges: Object.fromEntries(
      [...field.children].map(([key, child]) => [key, child.range]),
    ),
    unknownKeys: [...field.children.keys()].filter((key) => !known.has(key)),
  };
}

function requiredScalar(
  fields: ReadonlyMap<string, ParsedField>,
  key: string,
  issues: LoreIssue[],
  fallbackRange: SourceRange,
): string | null {
  const value = optionalScalar(fields, key, issues);
  if (!fields.has(key)) {
    issues.push(
      fieldIssue(undefined, `A continuity fact requires ${key}.`, fallbackRange),
    );
  }
  return value;
}

function optionalScalar(
  fields: ReadonlyMap<string, ParsedField>,
  key: string,
  issues: LoreIssue[],
): string | null {
  const field = fields.get(key);
  if (!field) return null;
  if (field.value === null) {
    issues.push(fieldIssue(field, `${key} must be a quoted string.`));
    return null;
  }
  return field.value;
}

function requiredMapping(
  fields: ReadonlyMap<string, ParsedField>,
  key: string,
  issues: LoreIssue[],
  fallbackRange: SourceRange,
): ParsedField | null {
  const field = fields.get(key);
  if (!field) {
    issues.push(
      fieldIssue(undefined, `A continuity fact requires ${key}.`, fallbackRange),
    );
    return null;
  }
  if (field.value !== null) {
    issues.push(fieldIssue(field, `${key} must be a nested mapping.`));
    return null;
  }
  return field;
}

function optionalEnum<T extends string>(
  fields: ReadonlyMap<string, ParsedField>,
  key: string,
  allowed: readonly T[],
  issues: LoreIssue[],
): T | null {
  const value = optionalScalar(fields, key, issues);
  if (value === null) return null;
  if (!allowed.includes(value as T)) {
    issues.push(fieldIssue(fields.get(key), `${key} must be ${joinChoices(allowed)}.`));
    return null;
  }
  return value as T;
}

function decimalField(
  fields: ReadonlyMap<string, ParsedField>,
  key: string,
  issues: LoreIssue[],
  fallbackRange: SourceRange,
): string | null {
  const value = requiredScalar(fields, key, issues, fallbackRange);
  if (value !== null && !DECIMAL_PATTERN.test(value)) {
    issues.push(fieldIssue(fields.get(key), `${key} must be a canonical decimal string.`));
    return null;
  }
  if (value !== null && [...value].length > 120) {
    issues.push(fieldIssue(fields.get(key), `${key} must contain at most 120 characters.`));
    return null;
  }
  return value;
}

function kebabField(
  fields: ReadonlyMap<string, ParsedField>,
  key: string,
  issues: LoreIssue[],
  fallbackRange: SourceRange,
): string | null {
  const value = requiredScalar(fields, key, issues, fallbackRange);
  if (value !== null && (!KEBAB_PATTERN.test(value) || [...value].length > 80)) {
    issues.push(fieldIssue(fields.get(key), `${key} must use at most 80 lowercase kebab-case characters.`));
    return null;
  }
  return value;
}

function boundedField(
  fields: ReadonlyMap<string, ParsedField>,
  key: string,
  maximum: number,
  issues: LoreIssue[],
  fallbackRange: SourceRange,
): string | null {
  const value = requiredScalar(fields, key, issues, fallbackRange);
  if (value !== null) validateBoundedText(value, key, maximum, fields.get(key), issues);
  return value;
}

function validateBoundedText(
  value: string,
  label: string,
  maximum: number,
  field: ParsedField | undefined,
  issues: LoreIssue[],
): void {
  if (!value.trim()) {
    issues.push(fieldIssue(field, `${label} must not be empty.`));
  } else if (CONTROL_CHARACTER_PATTERN.test(value)) {
    issues.push(fieldIssue(field, `${label} must not contain control characters.`));
  } else if ([...value].length > maximum) {
    issues.push(fieldIssue(field, `${label} must contain at most ${maximum} Unicode characters.`));
  }
}

function isGregorianExpression(value: string): boolean {
  const parts = value.split("/");
  if (parts.length > 2 || parts.some((part) => !isGregorianPart(part))) return false;
  return true;
}

function isGregorianPart(value: string): boolean {
  const match = /^(\d{4,})(?:-(\d{2})(?:-(\d{2}))?)?$/u.exec(value);
  if (!match) return false;
  if (!match[2]) return true;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return false;
  if (!match[3]) return true;
  const day = Number(match[3]);
  const year = BigInt(match[1]!);
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1]!;
}

function isLeapYear(year: bigint): boolean {
  return year % 400n === 0n || (year % 4n === 0n && year % 100n !== 0n);
}

function compareDecimals(first: string, second: string): number {
  const a = decimalParts(first);
  const b = decimalParts(second);
  if (a.negative !== b.negative) return a.negative ? -1 : 1;
  const direction = a.negative ? -1 : 1;
  if (a.whole.length !== b.whole.length) {
    return (a.whole.length < b.whole.length ? -1 : 1) * direction;
  }
  const whole = a.whole.localeCompare(b.whole);
  if (whole) return Math.sign(whole) * direction;
  const length = Math.max(a.fraction.length, b.fraction.length);
  const fraction = a.fraction.padEnd(length, "0").localeCompare(b.fraction.padEnd(length, "0"));
  return Math.sign(fraction) * direction;
}

function decimalParts(value: string): {
  negative: boolean;
  whole: string;
  fraction: string;
} {
  const negative = value.startsWith("-") && !/^-0(?:\.0+)?$/u.test(value);
  const unsigned = value.replace(/^-/, "");
  const [whole = "0", fraction = ""] = unsigned.split(".");
  return {
    negative,
    whole: whole.replace(/^0+(?=\d)/u, ""),
    fraction: fraction.replace(/0+$/u, ""),
  };
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

function continuityIssue(
  message: string,
  line: ContinuitySourceLine,
  lineStarts: readonly number[],
): LoreIssue {
  return {
    kind: "frontmatter-field",
    message,
    range: sourceRange(line.start, line.end, lineStarts),
  };
}

function fieldIssue(
  field: ParsedField | undefined,
  message: string,
  fallbackRange: SourceRange = { start: 0, end: 0, line: 1, column: 1 },
): LoreIssue {
  return {
    kind: "frontmatter-field",
    message,
    range: field?.range ?? fallbackRange,
  };
}

function joinChoices(values: readonly string[]): string {
  return values.length < 2
    ? (values[0] ?? "an approved value")
    : `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`;
}
