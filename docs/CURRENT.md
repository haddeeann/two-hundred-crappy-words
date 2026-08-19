# Current work

Last updated: 2026-08-19

## Active milestone

**0.2 — Trustworthy editor**

The current prototype can open, edit, create, and explicitly save text files, but it can lose unsaved edits during navigation and does not yet recover interrupted work. Safety comes before product expansion.

## Active slice

**0.2.2 — Debounced autosave**

### Intended outcome

Save edits after a short idle interval without interrupting typing, while making dirty, saving, saved, and failed states truthful.

### Acceptance criteria

- [ ] Autosave begins after a short, documented idle delay.
- [ ] Continued typing reschedules the pending save.
- [ ] `Command/Ctrl+S` still requests an immediate save.
- [ ] The UI exposes dirty, saving, saved, and failed states without interrupting typing.
- [ ] Edits made during an in-flight save remain dirty and receive a later save.
- [ ] A stale completion cannot mark newer content as saved.
- [ ] Failed saves remain dirty, show a useful error, and can be retried.
- [ ] Timer and save-race behavior has focused automated coverage.
- [ ] `npm run check`, `npm test`, `npm run build`, and `cargo check --locked` pass.

## Next slices

1. 0.2.3 — Safe file/folder/window navigation and save flushing.
2. 0.2.4 — Crash/interruption recovery.
3. 0.2.5 — File-tree usability and create-in-selected-folder.
4. 0.2.6 — Native window controls and filesystem permission hardening.
5. 0.2.7 — Failure-path and milestone QA.

## Known state

- Branch: `main`
- The repository began this milestone at commit `bc77846`.
- The roadmap and README were committed at `13c7658`.
- Slice 0.2.1 converted the page to TypeScript, introduced an explicit revision-based save-state model, and added Vitest with six regression tests.
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
