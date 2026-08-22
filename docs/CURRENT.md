# Current work

Last updated: 2026-08-22

## Active milestone

**0.5 — Connected lore**

World projects are complete. The active milestone makes manuscript and world-bible knowledge quick to find, link, trace, and consult without sending creative work anywhere or taking the writer out of the drafting flow.

## Active slice

**0.5.6 — Side-by-side lore reference**

### Intended outcome

Let a writer consult a resolved note beside the manuscript without replacing the active draft, its selection, or its save context. Keep the first reference surface clearly read-only, keyboard reachable, and derived from a verified indexed source; add a safe create-new path for a broken note only when its destination is unambiguous.

### Acceptance criteria

- [ ] Open a resolved outgoing link or quick-opener result in a side reference without navigating away from the active editor or changing its selection.
- [ ] Read the verified contained Markdown source through existing scope and stable-read protections; show stale/unavailable state instead of displaying mismatched indexed ranges.
- [ ] Present a clear read-only title, path, headings, and text view with keyboard focus transfer, scrolling, close, and return-to-editor behavior.
- [ ] Refresh or close the reference safely after incremental edit, move, removal, folder change, or index replacement without retaining its creative text in app data.
- [ ] Offer broken-note creation only for a valid unambiguous project-relative destination, use atomic create-new semantics, and never repair or rewrite the source link silently.
- [ ] Preserve active-draft autosave, recovery, daily credit, completion, and quick-opener behavior; pass focused state tests and packaged split-view QA.

## Next slices

1. 0.5.7 — Add bounded unlinked mentions and previewed safe rename handling.
2. 0.5.8 — Add connected-lore navigation history and finish milestone regression QA.

## Completed checkpoint

- Slice 0.5.5 is complete. Command/Ctrl+P now opens a session-only modal search over the current memory index. Each of at most thirty results shows a title, project-relative path, match reason, and bounded context. Exact title/alias/path/heading matches, prefixes, word prefixes, substrings, and prose use documented tiering plus stable path/range ties; colliding notes remain separate choices. Exact Unicode source ranges are mapped only after cheap global ranking, and the verified fingerprint gate prevents stale coordinates from selecting changed text.
- Packaged macOS QA covered visual layout, explicit repeat-open focus, accessibility state, title/heading/prose/no-result searches, ArrowDown/Enter traversal, Escape focus restoration, exact source selection, guarded opening, and query reset. The first package exposed and safely recovered a focus race before the explicit post-mount focus fix. On the 2,000-note fixture, worst-case common prose search dropped from a correctly rejected 3,255.16 ms prototype to 5.94 ms cold; warm selective search averaged 13.64 ms. The full suite has 250 passing tests across thirty-six files, Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, and no search query or result history is persisted.
- Slice 0.5.4 is complete. The editor now detects only a live, unescaped, unclosed wiki-link target at a collapsed UTF-16 caret and ranks at most eight note or uniquely resolved heading candidates. Title, alias, filename, rooted path, prefix, word-prefix, and substring matches use deterministic tie-breakers; colliding names insert rooted project-relative paths rather than guessing. Arrow keys traverse, Enter or Tab inserts through the native undo path, Escape dismisses, and labels, headings, punctuation, autosave, recovery, and gross-positive daily-credit behavior remain writer-owned.
- The active Markdown note now has a bounded connections disclosure for resolved, broken, invalid, and ambiguous outgoing links plus source-context backlinks. Resolved buttons use the existing guarded navigation flow and select the indexed heading or exact source link. Packaged macOS QA covered note and heading completion, accessibility state, focus retention, visual layout, unsaved connection refresh, bidirectional navigation, exact selections, undo, safe save, and clean close. The 2,000-note fixture measured 8.21 ms for the first completion query and 3.13 ms warm; the full suite has 246 passing tests across thirty-five files, Svelte/TypeScript checks report zero errors and warnings, and frontend plus packaged macOS builds pass.
- Slice 0.5.3 is complete. The selected project now receives a recursive, native-picker-scoped filesystem watch whose noisy events are coalesced before affected files or directory subtrees are reconciled. Every changed path is revalidated for containment, exclusions, symbolic links, stable reads, and whole-project limits; unreadable or unstable changes retain known-good records and mark the index stale with explicit refresh available. App-owned writes flow through the same watcher without adding lore persistence or daily credit, active unsaved/recovered buffers remain authoritative overlays, and monitoring is disposed on project changes and teardown.
- Packaged macOS QA automatically reflected an external create, heading edit, in-root move, and removal while preserving exclusions and link resolution. A read-only unsaved draft remained the indexed overlay after a conflicting external disk edit, the guarded-write dialog showed both versions, **Keep writing** preserved the draft, and a later safe Command+S completed normally. The first package also proved the stale fallback when the optional native watch command was absent; enabling the official filesystem plugin feature corrected it. The focused incremental suite has 44 passing tests across ten files; the full suite has 237 passing tests across thirty-three files, Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.
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
