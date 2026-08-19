# Current work

Last updated: 2026-08-19

## Active milestone

**0.2 — Trustworthy editor**

The editor now autosaves, protects navigation, maintains local interruption-recovery drafts, supports predictable nested folders, and limits access to writer-selected locations. The remaining milestone work deliberately exercises failure paths and packages the result.

## Active slice

**0.2.7 — Failure-path and milestone QA**

### Intended outcome

Deliberately exercise the ways files and folders can fail or change, finish the accessibility pass, and prove a production desktop bundle before activating daily-practice work.

### Acceptance criteria

- [ ] Unreadable, deleted, renamed, externally modified, and write-denied files have explicit non-destructive behavior.
- [ ] Folder removal, rapid navigation, rapid typing, and close-during-save are exercised.
- [ ] Keyboard access, focus visibility, error announcements, labels, and basic contrast are reviewed.
- [ ] Recovery and selected-folder restoration are manually demonstrated in the desktop app.
- [ ] `npm run check`, `npm test`, `npm run build`, `cargo check --locked`, and a production Tauri build pass.
- [ ] The README is truthful at milestone exit and 0.3 has one executable first slice.

## Next slices

1. 0.3.1 — Daily-credit semantics and word-count foundation.
2. 0.3.2 — Live document and daily progress treatment.
3. 0.3.3 — Persist progress by local date and project.

## Known state

- Branch: `main`
- The repository began this milestone at commit `bc77846`.
- The roadmap and README were committed at `13c7658`.
- Slice 0.2.1 converted the page to TypeScript, introduced an explicit revision-based save-state model, and added Vitest with six regression tests.
- Slice 0.2.2 added a 750 ms serialized autosave queue, immediate manual flush, visible save status, retryable failures, and race-condition coverage. Thirteen tests now pass.
- Slice 0.2.3 flushes edits before file/folder navigation and Tauri window closure. A failed save offers Retry, Discard changes, or Keep writing; navigation-guard coverage brings the suite to eighteen tests.
- Slice 0.2.4 mirrors dirty text to a private app-local store, detects source-file divergence, shows bounded source and draft previews, and lets the writer recover, dismiss, or cancel without a silent overwrite. Recovery cleanup is revision-aware and documented in `docs/DATA_AND_RECOVERY.md`; twenty-eight tests now pass.
- Slice 0.2.5 naturally sorts directories before files, preserves expanded subtrees on refresh, gives folders explicit selection, creates only in the selected folder, atomically refuses overwrite, and validates portable names. Five test files now contain forty passing tests.
- Slice 0.2.6 adds keyboard-labelled close and minimize controls, routes custom close through the safe-save handler, removes the unused greeting and opener plugin, and replaces the static `**` filesystem grant with Tauri's persisted scopes for explicitly selected folders. The model is documented in `docs/SECURITY_AND_PERMISSIONS.md`.
- Tauri now has the explicit `core:window:allow-destroy` capability required to complete an intercepted safe close without recursively emitting another close request.
- Baseline `npm run check` originally reported nine implicit-`any` errors and a missing Node type; these are resolved.
- `npm run check`, `npm test`, `npm run build`, and `cargo check --locked` pass after 0.2.6; a clean Tauri development launch succeeds with the narrowed capability set.
- A Tauri development smoke launch compiled and opened successfully; interaction-level manual QA remains for the milestone checkpoint.
- Production dependencies report zero `npm audit --omit=dev` findings. Four current audit findings are confined to development dependencies and must not be blindly auto-fixed.
- Because runtime folder scopes were not persisted in earlier builds, the first launch after this change requires choosing the writing folder once; later launches can restore it.

## Blockers

None. If the local Node toolchain is not visible to the execution environment, locate the user's NVM installation and use it without changing their global default unexpectedly.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
