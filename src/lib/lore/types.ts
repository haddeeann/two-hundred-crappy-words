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

export interface ParsedFrontmatter {
  range: SourceRange | null;
  bodyStart: number;
  id: string | null;
  type: string | null;
  title: string | null;
  aliases: string[];
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
  kind: "duplicate-note-id";
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
  headings: ParsedHeading[];
  outgoing: IndexedWikiLink[];
  parseIssues: LoreIssue[];
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
