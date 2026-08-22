# Current work

Last updated: 2026-08-22

## Active milestone

**0.5 — Connected lore**

World projects are complete. The active milestone makes manuscript and world-bible knowledge quick to find, link, trace, and consult without sending creative work anywhere or taking the writer out of the drafting flow.

## Active slice

**0.5.2 — Safe Markdown parser and initial project index**

### Intended outcome

Implement the approved safe Markdown/frontmatter/wiki-link parser and a bounded, versioned, memory-only index for an explicitly opened project. Preserve exact source locations, ordinary-folder compatibility, symlink and path containment, and non-destructive issue reporting.

### Acceptance criteria

- [x] Parse the approved safe frontmatter subset, including optional aliases, without evaluating YAML or rewriting source.
- [x] Parse titles, ATX/Setext headings, wiki links, escapes, ignored regions, exact UTF-16 ranges, and bounded issues.
- [ ] Resolve note and heading targets deterministically, including broken, ambiguous, case, Unicode, duplicate-ID, and same-file cases.
- [ ] Scan only accepted contained Markdown files; skip hidden, symlinked, excluded, generated, oversized, and over-budget input with visible issues.
- [ ] Build a versioned memory-only project index with stale-result protection and active-buffer overlay support.
- [ ] Pass representative fixtures and measure the approved large-project performance budget before advancing.

## Next slices

1. 0.5.3 — Add incremental refresh after app and external filesystem changes.
2. 0.5.4 — Add keyboard-friendly link completion plus outgoing and backlink surfaces.

## Completed checkpoint

- The first 0.5.2 checkpoint adds focused, dependency-free lore modules for safe frontmatter, title, ATX/Setext heading, and wiki-link parsing. It validates optional aliases without enabling YAML aliases or tags, records exact UTF-16 and human-readable locations, ignores metadata/code/comments, reports malformed input without rewriting it, and normalizes Unicode names consistently. Fourteen focused tests pass; the full suite has 209 passing tests across twenty-seven files, frontend build passes, and Svelte/TypeScript checks report zero errors and warnings.
- Slice 0.5.1 defines the durable connected-lore semantics in `docs/CONNECTED_LORE_FORMAT.md`. The user approved optional structured-note aliases, rooted project-relative path links, collision-visible name resolution, documented escapes and ignored regions, and a memory-only version-one index on 2026-08-22.
- Milestone 0.4 is complete. The app recognizes, adopts, and creates portable UUID-identified world projects while preserving ordinary folders; creates nine optional structured Markdown note types; keeps private practice, recovery, recent locations, and navigation app-local; reconnects moved worlds; and handles live copies only through an explicit same/independent/ordinary choice.
- Slice 0.4.5 adds a versioned twelve-entry recent-project repository plus safe project-relative restoration for selected directory, expanded branches, and active file. Missing paths and symlinks fall back safely, a moved world's new absolute path never receives an old path-specific recovery draft, and removing a recent shortcut never touches project files.
- Backup and portability boundaries are explained in-app and in `docs/BACKUP_AND_PORTABILITY.md`. `workspace.json` contains recent absolute locations and relative navigation, but no creative text; the project manifest remains free of machine/editor state.
- The packaged “The Patient Comet” walkthrough passed restart restoration, missing-location recovery, move/reopen, recent deduplication/removal, all three copy choices, unknown-field preservation, byte-stable unaffected manifests, keyboard focus, and app-local privacy inspection. The full suite has 195 passing tests across twenty-four files; Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.
- Earlier 0.4 checkpoints passed recognition and ordinary-folder compatibility (141 tests), guarded adoption (155 tests), native creation and move/reopen (164 tests), and nine structured templates (174 tests), each against a freshly packaged macOS build. Milestones 0.2 and 0.3 remain complete with their saved regression walkthroughs in `docs/MANUAL_QA.md`.

## Blockers and decision gates

No blocker. The permanent-format decision gate was approved on 2026-08-22. Implementation may proceed within `docs/CONNECTED_LORE_FORMAT.md`; changing those writer-authored semantics requires another approval.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
