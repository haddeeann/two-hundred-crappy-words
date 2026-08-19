# Current work

Last updated: 2026-08-19

## Active milestone

**0.3 — Daily practice**

The trustworthy-editor foundation is complete. The active milestone now makes the product's central promise real: accurate, humane progress toward a default goal of 200 words per local day.

## Active slice

**0.3.2 — Live document and session progress treatment**

### Intended outcome

Bring the tested counting model into the editor so a writer can see the current document count and progress earned during this running session. Keep the presentation compact, calm, keyboard-safe, and truthful that persistence arrives in the following slice.

### Acceptance criteria

- [ ] Show the active document's live word count without affecting typing or saving.
- [ ] Show session-earned progress toward the default 200-word target without calling it persistent daily history yet.
- [ ] Establish a no-credit baseline when a file opens, switches, or recovers; apply credit only to active editor input.
- [ ] Preserve session credit while switching documents and folders within the running app.
- [ ] Provide concise accessible labels and a progress treatment that does not announce every keystroke.
- [ ] Add focused integration coverage and pass the full frontend checks.

## Next slices

1. 0.3.3 — Persist progress by local date and project.
2. 0.3.4 — Accessible 200-word completion moment and configurable target.
3. 0.3.5 — Writing history and gentle streak information.

## Completed checkpoint

- Slice 0.3.1 defines deterministic Unicode word tokens and gross-positive edit credit in `docs/WORD_COUNTING.md` and decision D-015. The pure implementation has sixteen focused fixtures; the full frontend suite contains 63 passing tests across nine files, and Svelte/TypeScript checks plus the production frontend build pass.
- Milestone 0.2 passed its disposable-file macOS walkthrough on 2026-08-19.
- The run manually demonstrated nested file creation, autosave during navigation, external-change refusal and explicit overwrite, moved-file refusal, write-denied safe close and successful saving after permission restoration, forced-interruption recovery, stale-recovery cleanup, remembered selected-folder scope, whole-folder removal, window controls, title-bar dragging, keyboard traversal, focus visibility, and basic visual legibility.
- QA exposed a non-recursive native-picker scope for nested files. Commit `1c20728` added the recursive grant and a focused regression test; the nested file was then opened successfully.
- The frontend suite contains 47 passing tests after the scope fix. The milestone's earlier completion audit also passed Svelte/TypeScript checks, the production frontend build, `cargo check --locked`, Rust formatting, and an unsigned release-mode macOS `.app` build.
- Production dependencies have zero `npm audit --omit=dev` findings. Four known findings remain confined to development dependencies and must not be blindly auto-fixed.
- Signing, notarization, and installer polish remain intentionally deferred to milestone 0.8.

## Blockers

None.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
