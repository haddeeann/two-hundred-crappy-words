# Current work

Last updated: 2026-08-19

## Active milestone

**0.2 — Trustworthy editor**

The current prototype can open, edit, create, and explicitly save text files, but it can lose unsaved edits during navigation and does not yet recover interrupted work. Safety comes before product expansion.

## Active slice

**0.2.4 — Crash/interruption recovery**

### Intended outcome

Keep a private local recovery copy of dirty content and offer it when an interrupted edit is newer than the file on disk.

### Acceptance criteria

- [ ] Dirty content is mirrored to app-local recovery storage without waiting for normal autosave.
- [ ] Recovery records contain the source path, content, update time, and enough persisted-file identity to detect relevance.
- [ ] A newer recovery record is offered when its source file is opened or restored at launch.
- [ ] The writer can restore or dismiss a recovery record without silent overwrite.
- [ ] A recovery record is removed only after confirmed file persistence or explicit dismissal.
- [ ] Recovery storage location and privacy behavior are documented.
- [ ] Forced-interruption and stale-record behavior has focused automated coverage.
- [ ] `npm run check`, `npm test`, `npm run build`, and `cargo check --locked` pass.

## Next slices

1. 0.2.5 — File-tree usability and create-in-selected-folder.
2. 0.2.6 — Native window controls and filesystem permission hardening.
3. 0.2.7 — Failure-path and milestone QA.

## Known state

- Branch: `main`
- The repository began this milestone at commit `bc77846`.
- The roadmap and README were committed at `13c7658`.
- Slice 0.2.1 converted the page to TypeScript, introduced an explicit revision-based save-state model, and added Vitest with six regression tests.
- Slice 0.2.2 added a 750 ms serialized autosave queue, immediate manual flush, visible save status, retryable failures, and race-condition coverage. Thirteen tests now pass.
- Slice 0.2.3 flushes edits before file/folder navigation and Tauri window closure. A failed save offers Retry, Discard changes, or Keep writing; navigation-guard coverage brings the suite to eighteen tests.
- Tauri now has the explicit `core:window:allow-destroy` capability required to complete an intercepted safe close without recursively emitting another close request.
- Baseline `npm run check` originally reported nine implicit-`any` errors and a missing Node type; these are resolved.
- `npm run check`, `npm test`, `npm run build`, and `cargo check --locked` pass after 0.2.1.
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
