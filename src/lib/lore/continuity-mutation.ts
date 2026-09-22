import { fingerprintContent } from "$lib/editor/recovery";
import { validateProjectId } from "$lib/project/manifest";
import { parseFrontmatter } from "./frontmatter";
import type {
  CanonStatus,
  ContinuityCertainty,
  ContinuityValue,
  ParsedContinuityFact,
  ParsedFrontmatter,
} from "./types";

export type ContinuityValueDraft =
  | { kind: "note"; id: string }
  | { kind: "text"; text: string }
  | { kind: "quantity"; amount: string; unitSystem: string; unit: string }
  | {
      kind: "range";
      minimum: string;
      maximum: string;
      unitSystem: string;
      unit: string;
    }
  | ContinuityTimeDraft
  | { kind: "unknown"; reason: string };

export interface ContinuityTimeDraft {
  kind: "time";
  calendar: string;
  expression: string;
}

export interface ContinuityFactDraft {
  id: string;
  property: string;
  value: ContinuityValueDraft;
  canon?: CanonStatus | null;
  certainty?: ContinuityCertainty | null;
  validFrom?: ContinuityTimeDraft | null;
  validTo?: ContinuityTimeDraft | null;
  note?: string | null;
}

export interface ContinuityMutationPlan {
  kind: "ready";
  operation: "set-note-canon" | "add-fact" | "edit-fact" | "remove-fact";
  noteId: string;
  factId: string | null;
  originalText: string;
  originalFingerprint: string;
  updatedText: string;
  updatedFingerprint: string;
  summary: string;
}

export type ContinuityMutationResult =
  | ContinuityMutationPlan
  | { kind: "unavailable"; reason: string };

export type ContinuityMutationRequest =
  | { operation: "set-note-canon"; noteId: string; canon: CanonStatus | null }
  | { operation: "add-fact"; noteId: string; draft: ContinuityFactDraft }
  | {
      operation: "edit-fact";
      noteId: string;
      factId: string;
      draft: ContinuityFactDraft;
    }
  | { operation: "remove-fact"; noteId: string; factId: string };

export interface ContinuityMutationPreview {
  before: string;
  after: string;
  firstLine: number;
  unchangedBeforeCharacters: number;
  unchangedAfterCharacters: number;
}

export function planContinuityMutation(
  sourceText: string,
  request: ContinuityMutationRequest,
): ContinuityMutationResult {
  if (request.operation === "set-note-canon") {
    return planSetContinuityCanon(sourceText, request.noteId, request.canon);
  }
  if (request.operation === "add-fact") {
    return planAddContinuityFact(sourceText, request.noteId, request.draft);
  }
  if (request.operation === "edit-fact") {
    return planEditContinuityFact(
      sourceText,
      request.noteId,
      request.factId,
      request.draft,
    );
  }
  return planRemoveContinuityFact(sourceText, request.noteId, request.factId);
}

export function previewContinuityMutation(
  plan: ContinuityMutationPlan,
): ContinuityMutationPreview {
  const { originalText, updatedText } = plan;
  let prefix = 0;
  const sharedLength = Math.min(originalText.length, updatedText.length);
  while (prefix < sharedLength && originalText[prefix] === updatedText[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < originalText.length - prefix &&
    suffix < updatedText.length - prefix &&
    originalText[originalText.length - suffix - 1] ===
      updatedText[updatedText.length - suffix - 1]
  ) suffix += 1;

  const start = originalText.lastIndexOf("\n", Math.max(0, prefix - 1)) + 1;
  const originalChangeEnd = originalText.length - suffix;
  const updatedChangeEnd = updatedText.length - suffix;
  const originalEnd = lineEndAfter(originalText, originalChangeEnd);
  const updatedEnd = lineEndAfter(updatedText, updatedChangeEnd);
  return {
    before: originalText.slice(start, originalEnd),
    after: updatedText.slice(start, updatedEnd),
    firstLine: originalText.slice(0, start).split("\n").length,
    unchangedBeforeCharacters: start,
    unchangedAfterCharacters: Math.min(
      originalText.length - originalEnd,
      updatedText.length - updatedEnd,
    ),
  };
}

export function planSetContinuityCanon(
  sourceText: string,
  expectedNoteId: string,
  canon: CanonStatus | null,
): ContinuityMutationResult {
  const eligible = eligibleFrontmatter(sourceText, expectedNoteId);
  if (eligible.kind === "unavailable") return eligible;
  const { frontmatter } = eligible;
  if (frontmatter.canon === canon) {
    return unavailable("The note already has that canon setting.");
  }
  const eol = lineEnding(sourceText);
  let updatedText: string;
  if (frontmatter.canonRange) {
    const end = lineEndIncludingBreak(sourceText, frontmatter.canonRange.end);
    const replacement = canon === null ? "" : `canon: ${quote(canon)}${eol}`;
    updatedText = replaceRange(sourceText, frontmatter.canonRange.start, end, replacement);
  } else {
    if (canon === null) return unavailable("The note has no canon setting to remove.");
    const insertion = frontmatter.factsRange?.start ?? frontmatter.closingRange!.start;
    updatedText = replaceRange(sourceText, insertion, insertion, `canon: ${quote(canon)}${eol}`);
  }
  const verified = verifyMutation(updatedText, expectedNoteId);
  if (verified.kind === "unavailable") return verified;
  if (verified.frontmatter.canon !== canon) {
    return unavailable("The planned canon change did not reparse exactly; nothing is ready to write.");
  }
  return readyPlan(
    "set-note-canon",
    expectedNoteId,
    null,
    sourceText,
    updatedText,
    canon === null ? "Remove the note canon setting." : `Set note canon to ${canon}.`,
  );
}

export function planAddContinuityFact(
  sourceText: string,
  expectedNoteId: string,
  draft: ContinuityFactDraft,
): ContinuityMutationResult {
  const eligible = eligibleFrontmatter(sourceText, expectedNoteId);
  if (eligible.kind === "unavailable") return eligible;
  if (validateProjectId(draft.id)) return unavailable("The new fact needs a canonical lowercase UUID v4.");
  if (eligible.frontmatter.facts.some(({ id }) => id === draft.id)) {
    return unavailable("That fact ID already exists in this note.");
  }
  const eol = lineEnding(sourceText);
  const serialized = serializeFact(draft, eol);
  const validation = parseFrontmatter(`---${eol}facts:${eol}${serialized}${eol}---${eol}`);
  if (validation.issues.length || validation.facts.length !== 1) {
    return unavailable(
      validation.issues[0]?.message ?? "The new fact does not match the approved continuity format.",
    );
  }
  let updatedText: string;
  if (eligible.frontmatter.factsRange) {
    const insertion = lineEndIncludingBreak(
      sourceText,
      eligible.frontmatter.factsRange.end,
    );
    updatedText = replaceRange(sourceText, insertion, insertion, `${serialized}${eol}`);
  } else {
    const insertion = eligible.frontmatter.closingRange!.start;
    updatedText = replaceRange(
      sourceText,
      insertion,
      insertion,
      `facts:${eol}${serialized}${eol}`,
    );
  }
  const verified = verifyMutation(updatedText, expectedNoteId);
  if (verified.kind === "unavailable") return verified;
  if (!verified.frontmatter.facts.some(({ id }) => id === draft.id)) {
    return unavailable("The planned fact insertion did not reparse exactly; nothing is ready to write.");
  }
  return readyPlan(
    "add-fact",
    expectedNoteId,
    draft.id,
    sourceText,
    updatedText,
    `Add ${draft.property}.`,
  );
}

export function planRemoveContinuityFact(
  sourceText: string,
  expectedNoteId: string,
  factId: string,
): ContinuityMutationResult {
  const eligible = eligibleFrontmatter(sourceText, expectedNoteId);
  if (eligible.kind === "unavailable") return eligible;
  const fact = eligible.frontmatter.facts.find(({ id }) => id === factId);
  if (!fact) return unavailable("That fact is not uniquely available in the current note.");
  const end = lineEndIncludingBreak(sourceText, fact.range.end);
  const updatedText = replaceRange(sourceText, fact.range.start, end, "");
  const verified = verifyMutation(updatedText, expectedNoteId);
  if (verified.kind === "unavailable") return verified;
  if (verified.frontmatter.facts.some(({ id }) => id === factId)) {
    return unavailable("The planned fact removal did not reparse exactly; nothing is ready to write.");
  }
  return readyPlan(
    "remove-fact",
    expectedNoteId,
    factId,
    sourceText,
    updatedText,
    `Remove ${fact.property}.`,
  );
}

export function planEditContinuityFact(
  sourceText: string,
  expectedNoteId: string,
  factId: string,
  draft: ContinuityFactDraft,
): ContinuityMutationResult {
  const eligible = eligibleFrontmatter(sourceText, expectedNoteId);
  if (eligible.kind === "unavailable") return eligible;
  if (draft.id !== factId) {
    return unavailable("A fact's stable identity cannot be changed during editing.");
  }
  const fact = eligible.frontmatter.facts.find(({ id }) => id === factId);
  if (!fact) return unavailable("That fact is not uniquely available in the current note.");

  const eol = lineEnding(sourceText);
  const replacements: SourceReplacement[] = [];
  replaceScalar(replacements, fact.fieldRanges.property!, `    property: ${quote(draft.property)}`);
  replaceValueFields(replacements, sourceText, fact.value, draft.value, eol);
  replaceOptionalScalar(replacements, sourceText, fact, "canon", draft.canon, eol);
  replaceOptionalScalar(
    replacements,
    sourceText,
    fact,
    "certainty",
    draft.certainty,
    eol,
  );
  replaceOptionalTime(replacements, sourceText, fact, "validFrom", draft.validFrom, eol);
  replaceOptionalTime(replacements, sourceText, fact, "validTo", draft.validTo, eol);
  replaceOptionalScalar(replacements, sourceText, fact, "note", draft.note, eol);

  const updatedText = applyReplacements(sourceText, replacements);
  if (updatedText === sourceText) return unavailable("The fact already has those values.");
  const verified = verifyMutation(updatedText, expectedNoteId);
  if (verified.kind === "unavailable") return verified;
  const updatedFact = verified.frontmatter.facts.find(({ id }) => id === factId);
  if (!updatedFact || !factMatchesDraft(updatedFact, draft)) {
    return unavailable("The planned fact edit did not reparse exactly; nothing is ready to write.");
  }
  return readyPlan(
    "edit-fact",
    expectedNoteId,
    factId,
    sourceText,
    updatedText,
    `Edit ${fact.property}.`,
  );
}

function eligibleFrontmatter(
  sourceText: string,
  expectedNoteId: string,
): { kind: "ready"; frontmatter: ParsedFrontmatter } | { kind: "unavailable"; reason: string } {
  const frontmatter = parseFrontmatter(sourceText);
  if (!frontmatter.range || !frontmatter.closingRange) {
    return unavailable("Continuity authoring requires a valid leading frontmatter block.");
  }
  if (!frontmatter.id || frontmatter.id !== expectedNoteId) {
    return unavailable("Continuity authoring requires the expected valid stable note ID.");
  }
  const unsafe = frontmatter.issues.find(({ kind }) =>
    kind === "frontmatter-malformed" ||
    kind === "frontmatter-field" ||
    kind === "duplicate-metadata",
  );
  if (unsafe) {
    return unavailable(`Structured metadata must be corrected before authoring: ${unsafe.message}`);
  }
  return { kind: "ready", frontmatter };
}

function verifyMutation(
  sourceText: string,
  expectedNoteId: string,
): { kind: "ready"; frontmatter: ParsedFrontmatter } | { kind: "unavailable"; reason: string } {
  return eligibleFrontmatter(sourceText, expectedNoteId);
}

function serializeFact(draft: ContinuityFactDraft, eol: string): string {
  const lines = [
    `  - id: ${quote(draft.id)}`,
    `    property: ${quote(draft.property)}`,
    "    value:",
    ...serializeValue(draft.value, "      "),
  ];
  if (draft.canon) lines.push(`    canon: ${quote(draft.canon)}`);
  if (draft.certainty) lines.push(`    certainty: ${quote(draft.certainty)}`);
  if (draft.validFrom) {
    lines.push("    validFrom:", ...serializeValue(draft.validFrom, "      "));
  }
  if (draft.validTo) {
    lines.push("    validTo:", ...serializeValue(draft.validTo, "      "));
  }
  if (draft.note) lines.push(`    note: ${quote(draft.note)}`);
  return lines.join(eol);
}

function serializeValue(value: ContinuityValueDraft, indent: string): string[] {
  const lines = [`${indent}kind: ${quote(value.kind)}`];
  if (value.kind === "note") lines.push(`${indent}id: ${quote(value.id)}`);
  else if (value.kind === "text") lines.push(`${indent}text: ${quote(value.text)}`);
  else if (value.kind === "quantity") {
    lines.push(
      `${indent}amount: ${quote(value.amount)}`,
      `${indent}unitSystem: ${quote(value.unitSystem)}`,
      `${indent}unit: ${quote(value.unit)}`,
    );
  } else if (value.kind === "range") {
    lines.push(
      `${indent}minimum: ${quote(value.minimum)}`,
      `${indent}maximum: ${quote(value.maximum)}`,
      `${indent}unitSystem: ${quote(value.unitSystem)}`,
      `${indent}unit: ${quote(value.unit)}`,
    );
  } else if (value.kind === "time") {
    lines.push(
      `${indent}calendar: ${quote(value.calendar)}`,
      `${indent}expression: ${quote(value.expression)}`,
    );
  } else lines.push(`${indent}reason: ${quote(value.reason)}`);
  return lines;
}

interface SourceReplacement {
  start: number;
  end: number;
  text: string;
}

const VALUE_FIELD_KEYS = [
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
] as const;

function replaceValueFields(
  replacements: SourceReplacement[],
  sourceText: string,
  current: ContinuityValue,
  draft: ContinuityValueDraft,
  eol: string,
): void {
  const desired = valueFields(draft);
  const missing: string[] = [];
  for (const key of VALUE_FIELD_KEYS) {
    const range = current.fieldRanges[key];
    const value = desired.get(key);
    if (range && value !== undefined) replaceScalar(replacements, range, `      ${key}: ${quote(value)}`);
    else if (range) removeLine(replacements, sourceText, range);
    else if (value !== undefined) missing.push(`      ${key}: ${quote(value)}`);
  }
  if (missing.length > 0) {
    const insertion = lineEndIncludingBreak(sourceText, current.range.end);
    replacements.push({ start: insertion, end: insertion, text: `${missing.join(eol)}${eol}` });
  }
}

function valueFields(value: ContinuityValueDraft): ReadonlyMap<string, string> {
  const result = new Map<string, string>([["kind", value.kind]]);
  if (value.kind === "note") result.set("id", value.id);
  else if (value.kind === "text") result.set("text", value.text);
  else if (value.kind === "quantity") {
    result.set("amount", value.amount);
    result.set("unitSystem", value.unitSystem);
    result.set("unit", value.unit);
  } else if (value.kind === "range") {
    result.set("minimum", value.minimum);
    result.set("maximum", value.maximum);
    result.set("unitSystem", value.unitSystem);
    result.set("unit", value.unit);
  } else if (value.kind === "time") {
    result.set("calendar", value.calendar);
    result.set("expression", value.expression);
  } else result.set("reason", value.reason);
  return result;
}

function replaceOptionalScalar(
  replacements: SourceReplacement[],
  sourceText: string,
  fact: ParsedContinuityFact,
  key: "canon" | "certainty" | "note",
  value: string | null | undefined,
  eol: string,
): void {
  const range = fact.fieldRanges[key];
  if (range && value) replaceScalar(replacements, range, `    ${key}: ${quote(value)}`);
  else if (range) removeLine(replacements, sourceText, range);
  else if (value) insertFactField(replacements, sourceText, fact, `    ${key}: ${quote(value)}${eol}`);
}

function replaceOptionalTime(
  replacements: SourceReplacement[],
  sourceText: string,
  fact: ParsedContinuityFact,
  key: "validFrom" | "validTo",
  value: ContinuityTimeDraft | null | undefined,
  eol: string,
): void {
  const current = fact[key];
  const range = fact.fieldRanges[key];
  if (current && range && value) {
    replaceScalar(replacements, current.fieldRanges.kind!, `      kind: ${quote("time")}`);
    replaceScalar(replacements, current.fieldRanges.calendar!, `      calendar: ${quote(value.calendar)}`);
    replaceScalar(replacements, current.fieldRanges.expression!, `      expression: ${quote(value.expression)}`);
  } else if (range && !value) {
    removeLine(replacements, sourceText, range);
  } else if (!range && value) {
    insertFactField(
      replacements,
      sourceText,
      fact,
      `    ${key}:${eol}${serializeValue(value, "      ").join(eol)}${eol}`,
    );
  }
}

function insertFactField(
  replacements: SourceReplacement[],
  sourceText: string,
  fact: ParsedContinuityFact,
  text: string,
): void {
  const insertion = lineEndIncludingBreak(sourceText, fact.range.end);
  const existing = replacements.find(
    (replacement) => replacement.start === insertion && replacement.end === insertion,
  );
  if (existing) existing.text += text;
  else replacements.push({ start: insertion, end: insertion, text });
}

function replaceScalar(
  replacements: SourceReplacement[],
  range: { start: number; end: number },
  text: string,
): void {
  replacements.push({ start: range.start, end: range.end, text });
}

function removeLine(
  replacements: SourceReplacement[],
  sourceText: string,
  range: { start: number; end: number },
): void {
  replacements.push({
    start: range.start,
    end: lineEndIncludingBreak(sourceText, range.end),
    text: "",
  });
}

function applyReplacements(text: string, replacements: readonly SourceReplacement[]): string {
  return [...replacements]
    .sort((left, right) => right.start - left.start || right.end - left.end)
    .reduce(
      (result, replacement) =>
        replaceRange(result, replacement.start, replacement.end, replacement.text),
      text,
    );
}

function factMatchesDraft(fact: ParsedContinuityFact, draft: ContinuityFactDraft): boolean {
  return fact.id === draft.id &&
    fact.property === draft.property &&
    valuesMatch(fact.value, draft.value) &&
    fact.canon === (draft.canon ?? null) &&
    fact.certainty === (draft.certainty ?? null) &&
    timesMatch(fact.validFrom, draft.validFrom ?? null) &&
    timesMatch(fact.validTo, draft.validTo ?? null) &&
    fact.note === (draft.note ?? null);
}

function valuesMatch(value: ContinuityValue, draft: ContinuityValueDraft): boolean {
  if (value.kind !== draft.kind) return false;
  if (value.kind === "note" && draft.kind === "note") return value.id === draft.id;
  if (value.kind === "text" && draft.kind === "text") return value.text === draft.text;
  if (value.kind === "quantity" && draft.kind === "quantity") {
    return value.amount === draft.amount && value.unitSystem === draft.unitSystem && value.unit === draft.unit;
  }
  if (value.kind === "range" && draft.kind === "range") {
    return value.minimum === draft.minimum && value.maximum === draft.maximum &&
      value.unitSystem === draft.unitSystem && value.unit === draft.unit;
  }
  if (value.kind === "time" && draft.kind === "time") return timesMatch(value, draft);
  return value.kind === "unknown" && draft.kind === "unknown" && value.reason === draft.reason;
}

function timesMatch(
  value: { kind: "time"; calendar: string; expression: string } | null,
  draft: ContinuityTimeDraft | null,
): boolean {
  return value === null
    ? draft === null
    : draft !== null && value.calendar === draft.calendar && value.expression === draft.expression;
}

function readyPlan(
  operation: ContinuityMutationPlan["operation"],
  noteId: string,
  factId: string | null,
  originalText: string,
  updatedText: string,
  summary: string,
): ContinuityMutationPlan {
  return {
    kind: "ready",
    operation,
    noteId,
    factId,
    originalText,
    originalFingerprint: fingerprintContent(originalText),
    updatedText,
    updatedFingerprint: fingerprintContent(updatedText),
    summary,
  };
}

function lineEnding(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function lineEndIncludingBreak(text: string, contentEnd: number): number {
  if (text.startsWith("\r\n", contentEnd)) return contentEnd + 2;
  if (text[contentEnd] === "\n") return contentEnd + 1;
  return contentEnd;
}

function lineEndAfter(text: string, offset: number): number {
  const newline = text.indexOf("\n", offset);
  return newline < 0 ? text.length : newline + 1;
}

function replaceRange(
  text: string,
  start: number,
  end: number,
  replacement: string,
): string {
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function unavailable(reason: string): { kind: "unavailable"; reason: string } {
  return { kind: "unavailable", reason };
}

export function continuityValueDraft(value: ContinuityValue): ContinuityValueDraft {
  if (value.kind === "note") return { kind: value.kind, id: value.id };
  if (value.kind === "text") return { kind: value.kind, text: value.text };
  if (value.kind === "quantity") {
    return {
      kind: value.kind,
      amount: value.amount,
      unitSystem: value.unitSystem,
      unit: value.unit,
    };
  }
  if (value.kind === "range") {
    return {
      kind: value.kind,
      minimum: value.minimum,
      maximum: value.maximum,
      unitSystem: value.unitSystem,
      unit: value.unit,
    };
  }
  if (value.kind === "time") {
    return { kind: value.kind, calendar: value.calendar, expression: value.expression };
  }
  return { kind: value.kind, reason: value.reason };
}
