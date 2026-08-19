# Current work

Last updated: 2026-08-19

## Active milestone

**0.2 — Trustworthy editor**

The current prototype can open, edit, create, and explicitly save text files, but it can lose unsaved edits during navigation and does not yet recover interrupted work. Safety comes before product expansion.

## Active slice

**0.2.3 — Safe navigation**

### Intended outcome

Ensure file changes, folder changes, and window closure resolve pending edits before leaving the current writing context.

### Acceptance criteria

- [ ] Switching files flushes pending edits before reading the destination.
- [ ] Switching folders flushes pending edits before opening the picker or committing a new folder.
- [ ] A failed navigation save keeps the current document active and offers a safe retry/cancel/discard decision.
- [ ] A late write from one file cannot update another file's save state.
- [ ] Closing the Tauri window flushes pending edits before allowing closure.
- [ ] Close-save failure keeps the window open and explains the problem.
- [ ] Navigation and close coordination has focused automated coverage where practical.
- [ ] `npm run check`, `npm test`, `npm run build`, and `cargo check --locked` pass.

## Next slices

1. 0.2.4 — Crash/interruption recovery.
2. 0.2.5 — File-tree usability and create-in-selected-folder.
3. 0.2.6 — Native window controls and filesystem permission hardening.
4. 0.2.7 — Failure-path and milestone QA.

## Known state

- Branch: `main`
- The repository began this milestone at commit `bc77846`.
- The roadmap and README were committed at `13c7658`.
- Slice 0.2.1 converted the page to TypeScript, introduced an explicit revision-based save-state model, and added Vitest with six regression tests.
- Slice 0.2.2 added a 750 ms serialized autosave queue, immediate manual flush, visible save status, retryable failures, and race-condition coverage. Thirteen tests now pass.
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
