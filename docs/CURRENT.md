# Current work

Last updated: 2026-08-19

## Active milestone

**0.2 — Trustworthy editor**

The editor now autosaves, protects navigation, and maintains local interruption-recovery drafts. The remaining milestone work makes nested folders predictable, completes the frameless window, narrows permissions, and deliberately exercises failure paths.

## Active slice

**0.2.5 — File-tree usability**

### Intended outcome

Make nested folder browsing and file creation predictable without disturbing the writer's current context.

### Acceptance criteria

- [ ] Directories are sorted before files with stable, locale-aware names.
- [ ] Expanded folders and active selection survive a relevant tree refresh.
- [ ] A new file is created in the selected directory, falling back to the project root.
- [ ] Invalid names and existing paths are rejected before a write.
- [ ] Only the affected directory is refreshed after creation.
- [ ] Folder and file controls expose predictable keyboard and pointer behavior.
- [ ] `npm run check`, `npm test`, `npm run build`, and `cargo check --locked` pass.

## Next slices

1. 0.2.6 — Native window controls and filesystem permission hardening.
2. 0.2.7 — Failure-path and milestone QA.
3. 0.3.1 — Daily-credit semantics and word-count foundation.

## Known state

- Branch: `main`
- The repository began this milestone at commit `bc77846`.
- The roadmap and README were committed at `13c7658`.
- Slice 0.2.1 converted the page to TypeScript, introduced an explicit revision-based save-state model, and added Vitest with six regression tests.
- Slice 0.2.2 added a 750 ms serialized autosave queue, immediate manual flush, visible save status, retryable failures, and race-condition coverage. Thirteen tests now pass.
- Slice 0.2.3 flushes edits before file/folder navigation and Tauri window closure. A failed save offers Retry, Discard changes, or Keep writing; navigation-guard coverage brings the suite to eighteen tests.
- Slice 0.2.4 mirrors dirty text to a private app-local store, detects source-file divergence, shows bounded source and draft previews, and lets the writer recover, dismiss, or cancel without a silent overwrite. Recovery cleanup is revision-aware and documented in `docs/DATA_AND_RECOVERY.md`; twenty-eight tests now pass.
- Tauri now has the explicit `core:window:allow-destroy` capability required to complete an intercepted safe close without recursively emitting another close request.
- Baseline `npm run check` originally reported nine implicit-`any` errors and a missing Node type; these are resolved.
- `npm run check`, `npm test`, `npm run build`, and `cargo check --locked` pass after 0.2.4.
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
