# Current work

Last updated: 2026-08-22

## Active milestone

**0.4 — World projects**

Daily practice is complete. The active milestone turns an ordinary folder into an optional, portable science-fiction world project without taking ownership away from the writer or changing existing folders unexpectedly.

## Active slice

**0.4.2 — Create or adopt a world project safely**

### Intended outcome

Add an explicit, previewable action that turns the currently open ordinary folder into a named world project. Preflight the manifest and every selected default directory before writing, never overwrite an existing path, migrate app-local practice identity without deleting its path-keyed fallback, and leave any partial creation understandable and recoverable.

### Acceptance criteria

- [ ] Define a pure creation plan that reports every collision before the first write.
- [ ] Add an explicit accessible adoption form with project name and selectable suggested folders.
- [ ] Create only absent directories and write the manifest with create-new semantics.
- [ ] Report partial failure precisely without removing or replacing pre-existing material.
- [ ] Copy existing path-keyed daily goal and progress to the UUID identity while retaining the legacy records.
- [ ] Reload the folder as a world project and demonstrate that ordinary Open Folder still performs no writes.
- [ ] Pass focused tests, full frontend checks, and a disposable-folder desktop walkthrough.

## Next slices

1. 0.4.3 — Create a new project through a native parent-folder flow.
2. 0.4.4 — Add optional Markdown templates and create notes by semantic role.
3. 0.4.5 — Recent projects, navigation restoration, portability guidance, and milestone QA.

## Completed checkpoint

- The 0.4 format gate was approved on 2026-08-21. `docs/PROJECT_FORMAT.md` defines one visible `200-crappy-words.project.json` manifest with a local UUID, display name, and semantic folder mapping; personal practice, recovery, permissions, recent locations, and editor state remain app-local. Ordinary folders remain fully supported. Optional YAML frontmatter on newly created structured notes is limited initially to `id`, `type`, and `title`. Decision D-020 is accepted.
- The 0.4.1 foundation implements dependency-free version 1 parsing, validation, deterministic serialization, portable folder-path validation, read-only folder inspection, and namespaced UUID storage keys. Folder opening distinguishes missing, valid, malformed, invalid, unreadable, and newer manifests; every problem mode retains ordinary text editing and performs no write. Valid projects show their project name at the tree root and use stable app-local practice identity. Twenty-two focused tests bring the full suite to 141 passing tests across seventeen files; Svelte/TypeScript checks report zero warnings and the production frontend build passes.
- Milestone 0.3 passed its full disposable-project macOS walkthrough on 2026-08-21 using Computer Use against a freshly packaged build. The run covered baseline protection, per-project goals, live and persisted daily totals, quiet one-time completion, truthful goal changes, populated history, two restarts, correction validation, append-only audit display, deletion semantics, keyboard traversal, visible focus, and accessible labels.
- QA exposed two issues before the final pass. The correction editor now receives focus when opened so Enter and Escape work immediately. New ledger revisions now preserve prior correction entries, including through correction, later writing, deletion, and restart. The lifecycle regression test covers the audit across that transition.
- The frontend suite contains 119 passing tests across fifteen files. Svelte/TypeScript checks report zero errors and zero warnings, the production frontend and macOS application builds pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.
- Milestone 0.2 passed its disposable-file macOS walkthrough on 2026-08-19, including autosave, conflicts, missing and unwritable sources, interruption recovery, selected-folder restoration, window behavior, and keyboard access.

## Blockers and decision gates

No blocker. The format gate is approved; implementation is active and must preserve the documented no-write behavior for ordinary folder opening.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
