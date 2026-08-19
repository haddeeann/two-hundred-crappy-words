# Current work

Last updated: 2026-08-19

## Active milestone

**0.2 — Trustworthy editor**

The current prototype can open, edit, create, and explicitly save text files, but it can lose unsaved edits during navigation and does not yet recover interrupted work. Safety comes before product expansion.

## Active slice

**0.2.1 — Establish the safety baseline**

### Intended outcome

Create a small testable foundation for save and navigation behavior without changing the visible writing workflow unnecessarily.

### Acceptance criteria

- [ ] Record the current frontend and Rust check results.
- [ ] Introduce focused test infrastructure appropriate for Svelte/TypeScript logic.
- [ ] Extract pure, testable word/file/save helpers only where needed for the next slices.
- [ ] Define explicit editor save states rather than relying only on content equality.
- [ ] Add regression tests for the chosen save-state transitions.
- [ ] Keep opening, editing, creating, and `Command/Ctrl+S` behavior working.
- [ ] `npm run check` passes.
- [ ] `npm run build` passes.

## Next slices

1. 0.2.2 — Debounced autosave with visible saving, saved, dirty, and failed states.
2. 0.2.3 — Safe file/folder/window navigation and save flushing.
3. 0.2.4 — Crash/interruption recovery.
4. 0.2.5 — File-tree usability and create-in-selected-folder.
5. 0.2.6 — Native window controls and filesystem permission hardening.
6. 0.2.7 — Failure-path and milestone QA.

## Known state

- Branch: `main`
- The repository began this milestone at commit `bc77846`.
- `README.md` contains a truthful prototype description and is currently an uncommitted user-requested change.
- Most application logic and UI are currently in `src/routes/+page.svelte`.
- No JavaScript dependencies were installed in `node_modules` when the roadmap was created.
- The Tauri capability currently grants read-directory and read/write-text access for `**`; narrowing this is part of 0.2.

## Blockers

None. If the local Node toolchain is not visible to the execution environment, locate the user's NVM installation and use it without changing their global default unexpectedly.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
