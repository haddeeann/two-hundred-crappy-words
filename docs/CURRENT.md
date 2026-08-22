# Current work

Last updated: 2026-08-22

## Active milestone

**0.5 — Connected lore**

World projects are complete. The active milestone makes manuscript and world-bible knowledge quick to find, link, trace, and consult without sending creative work anywhere or taking the writer out of the drafting flow.

## Active slice

**0.5.1 — Connected-lore index and link semantics**

### Intended outcome

Define the durable meaning of indexed notes and wiki links before scanning or writing link syntax across a real project. Keep the index derived and app-local, preserve ordinary Markdown compatibility, make ambiguity and broken targets visible, and establish performance/privacy boundaries that later incremental indexing can test.

### Acceptance criteria

- [ ] Inventory the existing world-project, structured-note, filesystem, and recovery constraints that indexing must preserve.
- [ ] Propose which Markdown files, metadata, headings, and paths are indexed and which hidden, generated, metadata, symbolic-link, or configured paths are excluded.
- [ ] Specify note identity and title precedence for structured and ordinary Markdown without silently adding metadata to existing files.
- [ ] Specify `[[Note]]`, `[[Note|label]]`, and heading-link grammar, escaping, normalization, case, ambiguity, and broken-link behavior.
- [ ] Define a versioned app-local derived index record, invalidation inputs, size limits, and no-network/privacy boundary.
- [ ] Add representative parsing fixtures and performance targets to the proposal.
- [ ] Pause for approval before implementing semantics that become durable writer-authored Markdown or expanding the approved frontmatter convention.

## Next slices

1. 0.5.2 — Implement and test the approved Markdown/frontmatter parser and initial safe full-project index.
2. 0.5.3 — Add incremental refresh after app and external filesystem changes.

## Completed checkpoint

- Milestone 0.4 is complete. The app recognizes, adopts, and creates portable UUID-identified world projects while preserving ordinary folders; creates nine optional structured Markdown note types; keeps private practice, recovery, recent locations, and navigation app-local; reconnects moved worlds; and handles live copies only through an explicit same/independent/ordinary choice.
- Slice 0.4.5 adds a versioned twelve-entry recent-project repository plus safe project-relative restoration for selected directory, expanded branches, and active file. Missing paths and symlinks fall back safely, a moved world's new absolute path never receives an old path-specific recovery draft, and removing a recent shortcut never touches project files.
- Backup and portability boundaries are explained in-app and in `docs/BACKUP_AND_PORTABILITY.md`. `workspace.json` contains recent absolute locations and relative navigation, but no creative text; the project manifest remains free of machine/editor state.
- The packaged “The Patient Comet” walkthrough passed restart restoration, missing-location recovery, move/reopen, recent deduplication/removal, all three copy choices, unknown-field preservation, byte-stable unaffected manifests, keyboard focus, and app-local privacy inspection. The full suite has 195 passing tests across twenty-four files; Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.
- Earlier 0.4 checkpoints passed recognition and ordinary-folder compatibility (141 tests), guarded adoption (155 tests), native creation and move/reopen (164 tests), and nine structured templates (174 tests), each against a freshly packaged macOS build. Milestones 0.2 and 0.3 remain complete with their saved regression walkthroughs in `docs/MANUAL_QA.md`.

## Blockers and decision gates

No implementation blocker. Slice 0.5.1 intentionally ends at a user decision gate because wiki-link meaning becomes durable writer-authored Markdown and any new structured-note frontmatter key expands the approved portable format.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
