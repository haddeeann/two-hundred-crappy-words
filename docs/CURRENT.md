# Current work

Last updated: 2026-08-22

## Active milestone

**0.5 — Connected lore**

World projects are complete. The active milestone makes manuscript and world-bible knowledge quick to find, link, trace, and consult without sending creative work anywhere or taking the writer out of the drafting flow.

## Active slice

**0.5.3 — Incremental lore refresh**

### Intended outcome

Keep the memory-only lore index truthful after app-owned and external filesystem changes without rescanning on every event or weakening source-write and selected-folder protections. Give the writer an explicit stale/error state and refresh fallback whenever monitoring cannot reconcile safely.

### Acceptance criteria

- [ ] Keep the index current after confirmed app saves and Markdown creation without awarding extra daily credit or writing metadata.
- [ ] Coalesce external create, content-change, move, and removal events beneath the selected root and update only affected safe Markdown records.
- [ ] Revalidate containment, exclusions, symlinks, byte limits, and stable reads before accepting an event-driven update.
- [ ] Preserve an unsaved/recovered active-buffer overlay when its disk file changes and leave source-conflict handling to guarded writes.
- [ ] Dispose monitoring on folder changes and app teardown; never retain or watch a path outside the current selected root.
- [ ] Surface monitoring failures as stale with an explicit refresh, and pass focused race tests plus packaged external-change QA.

## Next slices

1. 0.5.4 — Add keyboard-friendly link completion plus outgoing and backlink surfaces.
2. 0.5.5 — Add fast project search and a keyboard-first quick opener.

## Completed checkpoint

- Slice 0.5.2 is complete. The selected project now receives a bounded background scan and a keyboard-accessible, explicitly refreshable lore-index status. The index is versioned and memory-only; active unsaved Markdown overlays after 180 ms without changing recovery, autosave, conflict, or daily-credit behavior. A cooperative builder reuses unchanged parse/search records while globally recomputing resolutions and backlinks. On the 2,000-file, 24.78 MiB fixture, full indexing took 222.31 ms total with a 6.94 ms longest work chunk, a single update took 6.65 ms, and warm title/backlink lookup averaged 0.0001 ms—all within the approved 3,000/50/100/50 ms budgets.
- Packaged macOS QA indexed exactly two eligible disposable notes, showed the expected hidden/dependency/symlink exclusions and broken note at its source location, added a broken-heading issue while the editor still showed Unsaved, retained it through refresh and autosave, and passed Return/Tab focus. QA first exposed a denied metadata call; the corrected narrow `fs:allow-stat` capability then passed. The full suite has 225 passing tests across thirty-one files, Svelte/TypeScript checks report zero errors and warnings, frontend and packaged app builds pass, and the core editor remained usable throughout the failed first scan.
- The second 0.5.2 checkpoint adds deterministic candidate and heading resolution, collision-visible duplicate-ID handling, source-context backlinks, bounded project traversal, explicit exclusion reasons, stable-read retry, scan caps, and a versioned memory-only index session whose pending work is invalidated by newer disk or active-buffer state. Twenty-nine focused lore tests pass; the full suite has 224 passing tests across thirty-one files, frontend build passes, and Svelte/TypeScript checks report zero errors and warnings. The next step connects this tested boundary to the selected Tauri folder and measures the approved fixture.
- The first 0.5.2 checkpoint adds focused, dependency-free lore modules for safe frontmatter, title, ATX/Setext heading, and wiki-link parsing. It validates optional aliases without enabling YAML aliases or tags, records exact UTF-16 and human-readable locations, ignores metadata/code/comments, reports malformed input without rewriting it, and normalizes Unicode names consistently. Fourteen focused tests pass; the full suite has 209 passing tests across twenty-seven files, frontend build passes, and Svelte/TypeScript checks report zero errors and warnings.
- Slice 0.5.1 defines the durable connected-lore semantics in `docs/CONNECTED_LORE_FORMAT.md`. The user approved optional structured-note aliases, rooted project-relative path links, collision-visible name resolution, documented escapes and ignored regions, and a memory-only version-one index on 2026-08-22.
- Milestone 0.4 is complete. The app recognizes, adopts, and creates portable UUID-identified world projects while preserving ordinary folders; creates nine optional structured Markdown note types; keeps private practice, recovery, recent locations, and navigation app-local; reconnects moved worlds; and handles live copies only through an explicit same/independent/ordinary choice.
- Slice 0.4.5 adds a versioned twelve-entry recent-project repository plus safe project-relative restoration for selected directory, expanded branches, and active file. Missing paths and symlinks fall back safely, a moved world's new absolute path never receives an old path-specific recovery draft, and removing a recent shortcut never touches project files.
- Backup and portability boundaries are explained in-app and in `docs/BACKUP_AND_PORTABILITY.md`. `workspace.json` contains recent absolute locations and relative navigation, but no creative text; the project manifest remains free of machine/editor state.
- The packaged “The Patient Comet” walkthrough passed restart restoration, missing-location recovery, move/reopen, recent deduplication/removal, all three copy choices, unknown-field preservation, byte-stable unaffected manifests, keyboard focus, and app-local privacy inspection. The full suite has 195 passing tests across twenty-four files; Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.
- Earlier 0.4 checkpoints passed recognition and ordinary-folder compatibility (141 tests), guarded adoption (155 tests), native creation and move/reopen (164 tests), and nine structured templates (174 tests), each against a freshly packaged macOS build. Milestones 0.2 and 0.3 remain complete with their saved regression walkthroughs in `docs/MANUAL_QA.md`.

## Blockers and decision gates

No blocker. External monitoring remains constrained to the currently selected native-picker scope and does not change the approved writer-authored format. A broader path, persistent creative-text cache, or new link semantics would require another approval.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
