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
