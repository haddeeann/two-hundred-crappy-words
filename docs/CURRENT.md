# Current work

Last updated: 2026-08-19

## Active milestone

**0.2 — Trustworthy editor**

The editor now autosaves, protects navigation, and maintains local interruption-recovery drafts. The remaining milestone work makes nested folders predictable, completes the frameless window, narrows permissions, and deliberately exercises failure paths.

## Active slice

**0.2.6 — Window behavior and permission hardening**

### Intended outcome

Complete the frameless window's native controls and replace the prototype's broad filesystem grant with selected-folder scope that can be restored safely.

### Acceptance criteria

- [ ] Accessible minimize and close controls work without becoming drag regions.
- [ ] Closing through the custom control retains the existing safe-save behavior.
- [ ] Broad static `**` filesystem scope is replaced by selected-folder access that survives a restart.
- [ ] Unused Tauri template command and opener plugin are removed.
- [ ] The resulting native/security behavior is documented.
- [ ] `npm run check`, `npm test`, `npm run build`, and `cargo check --locked` pass.

## Next slices

1. 0.2.7 — Failure-path and milestone QA.
2. 0.3.1 — Daily-credit semantics and word-count foundation.
3. 0.3.2 — Live document and daily progress treatment.

## Known state

- Branch: `main`
- The repository began this milestone at commit `bc77846`.
- The roadmap and README were committed at `13c7658`.
- Slice 0.2.1 converted the page to TypeScript, introduced an explicit revision-based save-state model, and added Vitest with six regression tests.
- Slice 0.2.2 added a 750 ms serialized autosave queue, immediate manual flush, visible save status, retryable failures, and race-condition coverage. Thirteen tests now pass.
- Slice 0.2.3 flushes edits before file/folder navigation and Tauri window closure. A failed save offers Retry, Discard changes, or Keep writing; navigation-guard coverage brings the suite to eighteen tests.
- Slice 0.2.4 mirrors dirty text to a private app-local store, detects source-file divergence, shows bounded source and draft previews, and lets the writer recover, dismiss, or cancel without a silent overwrite. Recovery cleanup is revision-aware and documented in `docs/DATA_AND_RECOVERY.md`; twenty-eight tests now pass.
- Slice 0.2.5 naturally sorts directories before files, preserves expanded subtrees on refresh, gives folders explicit selection, creates only in the selected folder, atomically refuses overwrite, and validates portable names. Five test files now contain forty passing tests.
- Tauri now has the explicit `core:window:allow-destroy` capability required to complete an intercepted safe close without recursively emitting another close request.
- Baseline `npm run check` originally reported nine implicit-`any` errors and a missing Node type; these are resolved.
- `npm run check`, `npm test`, `npm run build`, and `cargo check --locked` pass after 0.2.5; a Tauri development smoke launch also succeeds.
- A Tauri development smoke launch compiled and opened successfully; interaction-level manual QA remains for the milestone checkpoint.
- Production dependencies report zero `npm audit --omit=dev` findings. Four current audit findings are confined to development dependencies and must not be blindly auto-fixed.
- The Tauri capability currently grants read-directory and read/write-text access for `**`; narrowing this is part of 0.2.

## Blockers

None. If the local Node toolchain is not visible to the execution environment, locate the user's NVM installation and use it without changing their global default unexpectedly.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
