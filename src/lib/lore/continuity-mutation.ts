import { fingerprintContent } from "$lib/editor/recovery";
import { validateProjectId } from "$lib/project/manifest";
import { parseFrontmatter } from "./frontmatter";
import type {
  CanonStatus,
  ContinuityCertainty,
  ContinuityValue,
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
  operation: "set-note-canon" | "add-fact" | "remove-fact";
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
