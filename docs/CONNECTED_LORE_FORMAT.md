# Connected lore: index and link semantics

Status: **APPROVED** on 2026-08-22

This document defines the first durable meaning of wiki links and the first derived project index for 200 Crappy Words. The format is approved for implementation because writers will place this syntax in portable Markdown and because it adds one optional structured-note frontmatter field. Individual sections describe shipped behavior only after their implementation lands.

## Design goals

Connected lore should:

- keep Markdown useful in ordinary text editors;
- resolve links deterministically across supported filesystems;
- make missing and ambiguous targets visible instead of guessing;
- work in an ordinary folder as well as a world project;
- keep scanning, search, and backlinks entirely local;
- never rewrite a file merely because it was indexed or opened;
- keep unsaved and externally changed text under the existing recovery and guarded-write rules; and
- remain responsive for a realistically large solo-writer project.

## Existing constraints

The index and parser must preserve these established rules:

- Any folder may remain ordinary. Opening or indexing it creates no manifest or frontmatter.
- World-project UUIDs identify projects after a move, while ordinary folders remain path-identified.
- Version-one structured notes currently reserve only scalar `id`, `type`, and `title` frontmatter.
- Invalid or unsupported metadata disables only the feature that needs it; prose remains editable.
- Symbolic links are not trusted as project-contained destinations.
- Recovery drafts identify a particular absolute source path and disk revision.
- Source writes compare against the last known disk content and require an explicit conflict choice.
- Project metadata contains no machine-specific index, recent, editor, or recovery state.
- The application has no network, account, telemetry, or whole-filesystem workflow.

## Indexed files

The initial index includes regular, non-symbolic-link files whose final extension is `.md` or `.markdown`, compared case-insensitively, beneath the explicitly opened root.

It excludes:

- `200-crappy-words.project.json` and every non-Markdown file;
- a path with any segment beginning with `.`, including `.git` and `.svelte-kit`;
- symbolic-link files and every directory branch reached through a symbolic link;
- exact directory names `node_modules` and `target`, compared case-insensitively;
- a path the writer explicitly excludes in app-local project settings; and
- a future generated-output path only when the feature creating that output explicitly registers it.

The app does not guess that generic folders such as `Build`, `Output`, `Archive`, or `Research` are generated. A writer may use those names creatively. Exclusions are project-relative, stay app-local, and never grant access outside the selected root.

An individual Markdown file larger than 2 MiB is skipped with a visible issue but remains editable. The initial full index stops after 5,000 files or 50 MiB of accepted Markdown and explains that the remaining files were not indexed. These are safety limits, not project-format restrictions, and may be raised after measurement.

## Safe Markdown subset

The parser recognizes metadata, headings, and wiki links without evaluating Markdown, YAML tags, HTML, or code.

It ignores link-like text inside:

- the opening frontmatter block;
- fenced code blocks using backticks or tildes;
- inline code spans;
- HTML comments; and
- a wiki link escaped with an odd number of immediately preceding backslashes.

It recognizes ATX headings (`# Heading`) and Setext headings. Heading text is indexed after removing surrounding Markdown emphasis and link-label punctuation for lookup, while the original text and source range remain available for display. Duplicate normalized headings within one file are ambiguous rather than silently selecting the first.

Malformed frontmatter, an unclosed fence, or a malformed wiki link produces a bounded source issue and does not prevent the rest of the file from being searchable as ordinary text where safe.

## Note identity and names

Every indexed document has a project-relative path. A structured note with a valid unique UUID also has its portable note ID. Duplicate IDs are reported and are not repaired automatically.

The primary display title uses the first available value in this order:

1. valid frontmatter `title`;
2. the first level-one Markdown heading; or
3. the filename without its final Markdown extension.

Indexing never inserts or normalizes a title, ID, or heading. A mismatch among frontmatter title, heading, and filename is allowed; the frontmatter title is primary and the others remain lookup names.

A note may be found by its primary title, approved aliases, filename stem, or project-relative path without its Markdown extension. All names are trimmed, normalized to Unicode NFC, and compared with locale-independent Unicode case folding. Internal whitespace and punctuation remain significant. Names differing only by case or Unicode normalization are treated as colliding so results do not change between case-sensitive and case-insensitive filesystems.

## Optional `aliases` frontmatter

To satisfy alternate character, place, ship, and faction names without proprietary metadata, extend the approved safe frontmatter subset with one optional field:

```yaml
---
id: "c6d5ba63-e70e-4618-9da8-6da077839f22"
type: "character"
title: "Mara Venn"
aliases:
  - "Mara"
  - "Commander Venn"
---
```

`aliases` is a block sequence of JSON-compatible quoted strings. Inline YAML arrays, aliases/anchors, tags, nested objects, and executable values remain unsupported. Each alias is trimmed, must be non-empty, must contain no control character, and is limited to 120 Unicode code points. At most 32 aliases are indexed per note. Duplicate normalized aliases are ignored with a non-destructive issue.

The field is optional. Existing notes remain valid and are never rewritten merely to add it. Initial templates continue emitting only `id`, `type`, and `title`; a later explicit metadata editor may add aliases through the existing compare-before-write protection while preserving unknown fields and the body.

## Wiki-link grammar

The initial forms are:

```markdown
[[Mara Venn]]
[[Mara Venn|the commander]]
[[Mara Venn#Early life]]
[[Mara Venn#Early life|before the expedition]]
[[#Aftermath]]
[[Lore/Planets/Velorum]]
```

The content before the first unescaped `|` is the destination; content after it is the visible label. The first unescaped `#` in the destination separates a note target from a heading target. An empty note target with a heading means the current file.

Inside a wiki link, `\\`, `\|`, `\#`, and `\]` represent literal backslash, pipe, hash, and closing bracket characters. Outside a link, an odd number of backslashes immediately before `[[` suppresses link parsing; one escape backslash is omitted from rendered text. A link closes at the first unescaped `]]`. Newlines and nested `[[` are invalid. Empty destinations, empty headings, and empty explicit labels are invalid and remain ordinary visible text with a source issue.

The parser records exact UTF-16 offsets for the full source, destination, heading, and label so the Svelte editor can select or replace the intended range without guessing. Stored index locations also include one-based line and column for human-readable backlink context.

## Resolution

Resolution is deterministic and never picks an arbitrary candidate:

1. A target containing `/` is a project-root-relative path. A final `.md` or `.markdown` is optional. Absolute paths, backslashes, empty segments, `.` segments, and `..` segments are invalid. A unique case-folded path match resolves; path collisions are ambiguous.
2. Any other target is matched against the union of each document's primary title, aliases, filename stem, and relative path stem. Multiple matching names on one document still count as one candidate.
3. Exactly one candidate resolves. Zero candidates are broken. More than one candidate is ambiguous and lists the candidate paths; title does not silently outrank alias or filename.
4. If a heading is present, it is resolved inside the already resolved document. Exactly one normalized heading resolves; zero is broken and more than one is ambiguous.

Path syntax is the explicit disambiguation mechanism. Paths are rooted at the project rather than relative to the source note, so moving the source does not change their meaning. A later previewed rename feature may update name links, but this version does not hide an opaque ID inside writer-authored Markdown.

Broken and ambiguous links remain intact in source. Following one shows a clear result and offers safe navigation or missing-note creation only when that later flow can guarantee create-new semantics.

## Derived index

The initial index is versioned in memory as `200-crappy-words/lore-index` version 1 and is rebuilt when a project opens. It contains, per accepted Markdown file:

- project-relative path and a content fingerprint;
- valid note ID, type, title, and aliases;
- headings with source ranges;
- outgoing wiki links with source ranges and bounded context;
- resolution issues; and
- normalized in-memory search terms needed for title and content search.

Version 1 does not persist creative text, headings, aliases, link context, or search terms into Tauri app data. Persisted app-local settings may contain only project identity, safe relative exclusion paths, and index schema preferences. A future persistent cache is a separate privacy decision and must document backup, deletion, and leakage boundaries before implementation.

The active unsaved editor buffer overlays that file's disk-derived record after a short debounce; it is never written to the index store. A recovered draft is treated the same way. Async parse results carry the source fingerprint that began the work and are discarded if the file or active buffer changed before they commit.

## Invalidation and external changes

The implementation sequence should:

1. perform a bounded full scan after a folder opens;
2. update one record after an app create or confirmed save;
3. overlay unsaved active text without earning daily credit or changing recovery behavior;
4. reconcile external create, edit, move, and removal events in slice 0.5.3; and
5. provide an explicit refresh and a visible stale/error state whenever monitoring is unavailable.

Index failure must never block opening or saving a document. A file that changes while being read is reparsed or left visibly stale; it is never written by the indexer.

## Privacy and security boundary

- Scanning is limited to the explicitly selected folder scope.
- Symlinks and unsafe relative paths cannot expand that scope.
- Creative text and derived index data are not transmitted.
- No account, network request, telemetry, shell execution, or remote parser is introduced.
- Markdown, frontmatter, links, and HTML are data only and are never evaluated.
- Search snippets and backlink context exist only in memory in version 1.
- Removing or rebuilding the index never removes or modifies a creative file.

## Representative fixtures

Parser and resolver tests should cover at least:

| Fixture | Expected result |
| --- | --- |
| Valid structured note plus aliases | ID, type, primary title, and two lookup aliases |
| Ordinary note with H1 | H1 title, filename fallback name, no inserted metadata |
| Ordinary note without H1 | Filename-stem title |
| Duplicate UUIDs | Both editable; ID issue; no automatic repair |
| Duplicate titles in different folders | `[[Title]]` ambiguous; rooted path link resolves |
| Case-only and NFC/NFD name collision | Ambiguous on every supported filesystem |
| Link, label, heading, and escaped delimiters | Exact decoded fields and source offsets |
| Links inside frontmatter, code, and comments | Not indexed as outgoing links |
| Same-file heading link | Resolves only within the source document |
| Duplicate heading text | Heading target ambiguous |
| Broken note and broken heading | Separate visible issue kinds |
| Hidden, generated, symlink, excluded, oversized paths | Skipped with the documented reason |
| Edit while an async parse is pending | Stale result discarded |
| Recovery draft overlay | Draft links visible in memory; no disk write or daily credit |

## Performance targets

Use a generated fixture of 2,000 Markdown files and 25 MiB total accepted text, including nested folders, links, headings, collisions, and ignored paths. On the current development Mac, the first complete index should finish within 3 seconds without delaying editor keystroke handling longer than 50 milliseconds. A single-file parse and graph update should finish within 100 milliseconds, and a warm title/backlink query within 50 milliseconds.

These are milestone budgets and must be measured outside the tight unit-test timing environment before exit. Failure to meet them should favor chunking, worker execution, and smaller in-memory representations before adding a persistent creative-text cache.

## Approved decision

The user approved the complete version-one decision on 2026-08-22, especially:

1. add optional block-sequence `aliases` to the portable structured-note frontmatter subset;
2. use project-root-relative paths for explicit disambiguation;
3. resolve name links against title, aliases, filename stem, and relative path without silent precedence;
4. treat case/Unicode collisions and duplicate headings as ambiguity;
5. ignore links in frontmatter, code, and HTML comments and support the documented backslash escapes; and
6. keep the creative-text index memory-only until measured performance proves a persistent cache necessary.

Implementation may now proceed in small, tested slices. Any later change to these writer-authored link or frontmatter semantics requires another permanent-format decision gate.
