# Current work

Last updated: 2026-08-21

## Active milestone

**0.3 — Daily practice**

The trustworthy-editor foundation is complete. The active milestone now makes the product's central promise real: accurate, humane progress toward a default goal of 200 words per local day.

## Active slice

**0.3.3 — Persist progress by local date and project**

### Intended outcome

Turn the verified session counter into truthful daily progress that survives restart. Store only local project/date counters and bookkeeping—not manuscript text—and preserve the no-double-credit baselines already used for file opening and recovery.

### Acceptance criteria

- [x] Define and test local calendar-date keys, including midnight, time-zone, and backward-clock behavior.
- [x] Persist credited words per explicitly selected project and local date in app-local data without storing manuscript text.
- [x] Restore today's credited words after restart and prevent opening, switching, or recovery from crediting existing prose again.
- [x] Serialize rapid ledger updates so an older write cannot replace newer progress.
- [x] Document the ledger location, schema, project identity, retention, and correction/migration expectations.
- [x] Change the footer from honest session language to today's progress only after persistence is verified.
- [ ] Pass focused ledger tests, full frontend checks, and a restart-level desktop demonstration.

## Next slices

1. 0.3.4 — Accessible 200-word completion moment and configurable target.
2. 0.3.5 — Writing history and gentle streak information.
3. 0.3.6 — Corrections, date/time-zone behavior, and milestone QA.

## Completed checkpoint

- Slice 0.3.3 implementation stores versioned daily counters by selected folder path and local date in app data, rechecks the local day during editing, restores prior-date entries after backward clock or time-zone changes, serializes revisions, flushes progress during safe navigation, and never stores manuscript text in the ledger. Eleven focused ledger tests bring the full suite to 79 passing tests across eleven files; Svelte/TypeScript checks and the production build pass. Window-only screen capture confirms the `Today` footer remains visually sound. A human restart demonstration is the remaining slice checkpoint.
- While the restart checkpoint waits, the reversible 0.3.4 implementation adds validated per-project goals, persists once-per-date completion state, and shows a motion-free inline `Daily goal reached. Nicely done.` status without moving focus or interrupting typing. The new goal control fits the native window in window-only visual capture; interaction and completion still need human demonstration before roadmap credit.
- The pure 0.3.5 history foundation records each day's applicable goal, lists only observed practice dates, and calculates current/best rhythms across local calendar boundaries. Today does not prematurely break a rhythm that reached yesterday, and a later gap becomes a fresh-start message without erasing the best. The rules are captured in decision D-018 and await UI integration after automated verification.
- Slice 0.3.2 connects counting to active editor input, carries earned credit across in-session file and folder changes, and presents the live document count plus a compact native progress meter labelled `This session`. Five new tests cover presentation and cross-document state, bringing the suite to 68 passing tests across ten files. Svelte/TypeScript checks and the production frontend build pass. The macOS desktop flow and footer layout were manually approved on 2026-08-21; deletion lowered the document count without erasing earned session credit.
- Slice 0.3.1 defines deterministic Unicode word tokens and gross-positive edit credit in `docs/WORD_COUNTING.md` and decision D-015. The pure implementation has sixteen focused fixtures; the full frontend suite contains 63 passing tests across nine files, and Svelte/TypeScript checks plus the production frontend build pass.
- Milestone 0.2 passed its disposable-file macOS walkthrough on 2026-08-19.
- The run manually demonstrated nested file creation, autosave during navigation, external-change refusal and explicit overwrite, moved-file refusal, write-denied safe close and successful saving after permission restoration, forced-interruption recovery, stale-recovery cleanup, remembered selected-folder scope, whole-folder removal, window controls, title-bar dragging, keyboard traversal, focus visibility, and basic visual legibility.
- QA exposed a non-recursive native-picker scope for nested files. Commit `1c20728` added the recursive grant and a focused regression test; the nested file was then opened successfully.
- The frontend suite contains 47 passing tests after the scope fix. The milestone's earlier completion audit also passed Svelte/TypeScript checks, the production frontend build, `cargo check --locked`, Rust formatting, and an unsigned release-mode macOS `.app` build.
- Production dependencies have zero `npm audit --omit=dev` findings. Four known findings remain confined to development dependencies and must not be blindly auto-fixed.
- Signing, notarization, and installer polish remain intentionally deferred to milestone 0.8.

## Blockers

The implementation is complete; slice 0.3.3 awaits a short restart-level desktop demonstration using disposable text.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
