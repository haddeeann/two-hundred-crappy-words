export interface SourceRange {
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface LoreIssue {
  kind:
    | "frontmatter-malformed"
    | "frontmatter-field"
    | "duplicate-metadata"
    | "duplicate-alias"
    | "unclosed-fence"
    | "unclosed-comment"
    | "malformed-wiki-link";
  message: string;
  range: SourceRange;
}

export const CANON_STATUSES = ["idea", "draft", "canon", "retired"] as const;
export type CanonStatus = (typeof CANON_STATUSES)[number];

export const CONTINUITY_CERTAINTIES = [
  "exact",
  "approximate",
  "uncertain",
] as const;
export type ContinuityCertainty = (typeof CONTINUITY_CERTAINTIES)[number];

export interface ContinuityValueSource {
  range: SourceRange;
  fieldRanges: Readonly<Record<string, SourceRange>>;
  unknownKeys: readonly string[];
}

export type ContinuityValue =
  | (ContinuityValueSource & { kind: "note"; id: string })
  | (ContinuityValueSource & { kind: "text"; text: string })
  | (ContinuityValueSource & {
      kind: "quantity";
      amount: string;
      unitSystem: string;
      unit: string;
    })
  | (ContinuityValueSource & {
      kind: "range";
      minimum: string;
      maximum: string;
      unitSystem: string;
      unit: string;
    })
  | ContinuityTimeValue
  | (ContinuityValueSource & { kind: "unknown"; reason: string });

export interface ContinuityTimeValue extends ContinuityValueSource {
  kind: "time";
  calendar: string;
  expression: string;
}

export interface ParsedContinuityFact {
  id: string;
  property: string;
  value: ContinuityValue;
  canon: CanonStatus | null;
  certainty: ContinuityCertainty | null;
  validFrom: ContinuityTimeValue | null;
  validTo: ContinuityTimeValue | null;
  note: string | null;
  range: SourceRange;
  fieldRanges: Readonly<Record<string, SourceRange>>;
  unknownKeys: readonly string[];
}

export interface ParsedFrontmatter {
  range: SourceRange | null;
  bodyStart: number;
  id: string | null;
  type: string | null;
  title: string | null;
  aliases: string[];
  canon: CanonStatus | null;
  facts: ParsedContinuityFact[];
  issues: LoreIssue[];
}

export interface ParsedHeading {
  level: number;
  text: string;
  lookupText: string;
  range: SourceRange;
  textRange: SourceRange;
}

export interface ParsedWikiLink {
  raw: string;
  noteTarget: string;
  headingTarget: string | null;
  label: string | null;
  range: SourceRange;
  destinationRange: SourceRange;
  noteRange: SourceRange;
  headingRange: SourceRange | null;
  labelRange: SourceRange | null;
}

export interface ParsedMarkdownNote {
  path: string;
  id: string | null;
  type: string | null;
  title: string;
  aliases: string[];
  canon: CanonStatus | null;
  facts: ParsedContinuityFact[];
  headings: ParsedHeading[];
  links: ParsedWikiLink[];
  issues: LoreIssue[];
  frontmatter: ParsedFrontmatter;
}

export type LoreLinkResolution =
  | {
      kind: "resolved";
      targetPath: string;
      heading: ParsedHeading | null;
    }
  | {
      kind: "invalid-target" | "broken-note" | "ambiguous-note";
      candidatePaths: string[];
      message: string;
    }
  | {
      kind: "broken-heading" | "ambiguous-heading";
      targetPath: string;
      candidateHeadings: ParsedHeading[];
      message: string;
    };

export interface IndexedWikiLink {
  link: ParsedWikiLink;
  resolution: LoreLinkResolution;
  context: string;
}

export interface LoreIndexIssue {
  kind: "duplicate-note-id" | "duplicate-continuity-fact-id";
  message: string;
  paths: string[];
}

export interface LoreDocumentRecord {
  path: string;
  fingerprint: string;
  size: number;
  id: string | null;
  type: string | null;
  title: string;
  aliases: string[];
  canon: CanonStatus | null;
  facts: ParsedContinuityFact[];
  headings: ParsedHeading[];
  outgoing: IndexedWikiLink[];
  parseIssues: LoreIssue[];
  searchText: string;
  normalizedSearchText: string;
}

export interface LoreBacklink {
  sourcePath: string;
  targetPath: string;
  link: ParsedWikiLink;
  context: string;
}

export interface LoreProjectIndex {
  format: "200-crappy-words/lore-index";
  version: 1;
  generation: number;
  documents: ReadonlyMap<string, LoreDocumentRecord>;
  backlinks: ReadonlyMap<string, readonly LoreBacklink[]>;
  issues: LoreIndexIssue[];
}
