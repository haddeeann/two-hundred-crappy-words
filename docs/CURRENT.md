# Current work

Last updated: 2026-08-19

## Active milestone

**0.3 — Daily practice**

The trustworthy-editor foundation is complete. The active milestone now makes the product's central promise real: accurate, humane progress toward a default goal of 200 words per local day.

## Active slice

**0.3.1 — Daily-credit semantics and word-count foundation**

### Intended outcome

Define deterministic word and daily-credit behavior before adding UI or permanent progress storage. Keep document word count distinct from earned daily credit, following accepted decision D-005.

### Acceptance criteria

- [ ] Document Unicode-aware tokenization rules with representative examples and edge cases.
- [ ] Implement a pure document word-count function with fixtures for whitespace, punctuation, contractions, em dashes, numbers, and representative non-English text.
- [ ] Implement and test gross-positive daily credit: positive count changes earn credit, while deletions do not remove credit already earned.
- [ ] Specify how opening, switching, pasting, recovery, and external changes affect credit without persisting manuscript text.
- [ ] Run `npm run check`, `npm test`, and `npm run build` with the new behavior covered.

## Next slices

1. 0.3.2 — Live document and daily progress treatment.
2. 0.3.3 — Persist progress by local date and project.
3. 0.3.4 — Accessible 200-word completion moment and configurable target.

## Completed checkpoint

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
