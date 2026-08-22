# Current work

Last updated: 2026-08-22

## Active milestone

**0.4 — World projects**

Daily practice is complete. The active milestone turns an ordinary folder into an optional, portable science-fiction world project without taking ownership away from the writer or changing existing folders unexpectedly.

## Active slice

**0.4.3 — Create a new world project through a native parent-folder flow**

### Intended outcome

Let a writer create a named world project without preparing its root folder in Finder or Terminal. Choose the parent through the native folder picker, preview the project name, folder name, and selected structure, then create the root and manifest without overwriting any existing path.

### Acceptance criteria

- [ ] Add an explicit, keyboard-accessible new-project action that works with or without a folder already open.
- [ ] Collect and validate separate display and portable folder names, plus selectable suggested folders.
- [ ] Choose the parent with the native folder picker and preflight the root collision before writing.
- [ ] Create the root, selected directories, and manifest in a deterministic safe order without overwriting any path.
- [ ] Explain partial creation precisely and leave the new folder recoverable as ordinary files.
- [ ] Open the completed project immediately with its stable UUID identity and default local practice state.
- [ ] Pass focused tests, full frontend/Rust checks, and a create-close-move-reopen packaged-app walkthrough.

## Next slices

1. 0.4.4 — Add optional Markdown templates and create notes by semantic role.
2. 0.4.5 — Recent projects, navigation restoration, portability guidance, and milestone QA.

## Completed checkpoint

- The 0.4 format gate was approved on 2026-08-21. `docs/PROJECT_FORMAT.md` defines one visible `200-crappy-words.project.json` manifest with a local UUID, display name, and semantic folder mapping; personal practice, recovery, permissions, recent locations, and editor state remain app-local. Ordinary folders remain fully supported. Optional YAML frontmatter on newly created structured notes is limited initially to `id`, `type`, and `title`. Decision D-020 is accepted.
- The 0.4.1 foundation implements dependency-free version 1 parsing, validation, deterministic serialization, portable folder-path validation, read-only folder inspection, and namespaced UUID storage keys. Folder opening distinguishes missing, valid, malformed, invalid, unreadable, and newer manifests; every problem mode retains ordinary text editing and performs no write. Valid projects show their project name at the tree root and use stable app-local practice identity. Twenty-two focused tests bring the full suite to 141 passing tests across seventeen files; Svelte/TypeScript checks report zero warnings and the production frontend build passes.
- The 0.4.2 adoption flow explicitly previews the project name and nine independently selectable suggested folders, preflights every collision, creates only absent directories, and writes the manifest last with create-new semantics. Partial failures name the failed step and preserve every existing path. After adoption, path-keyed goal and ledger data are copied idempotently to the UUID identity while the legacy source remains intact.
- The packaged macOS walkthrough adopted a disposable ordinary folder as “A Quiet Red Planet,” omitted Research and Inbox, preserved its 5-word goal and corrected Aug 21 history, and reopened cleanly after restart. The manifest hash and modification time were unchanged by reopening. Keyboard QA covers initial name-field focus, Enter submission semantics, visible controls, and Escape cancellation from anywhere in the form. The full suite has 155 passing tests across eighteen files; Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, and Rust formatting/checks pass.
- Milestone 0.3 passed its full disposable-project macOS walkthrough on 2026-08-21 using Computer Use against a freshly packaged build. The run covered baseline protection, per-project goals, live and persisted daily totals, quiet one-time completion, truthful goal changes, populated history, two restarts, correction validation, append-only audit display, deletion semantics, keyboard traversal, visible focus, and accessible labels.
- QA exposed two issues before the final pass. The correction editor now receives focus when opened so Enter and Escape work immediately. New ledger revisions now preserve prior correction entries, including through correction, later writing, deletion, and restart. The lifecycle regression test covers the audit across that transition.
- The frontend suite contains 119 passing tests across fifteen files. Svelte/TypeScript checks report zero errors and zero warnings, the production frontend and macOS application builds pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.
- Milestone 0.2 passed its disposable-file macOS walkthrough on 2026-08-19, including autosave, conflicts, missing and unwritable sources, interruption recovery, selected-folder restoration, window behavior, and keyboard access.

## Blockers and decision gates

No blocker. The format gate is approved. Native new-project creation must reuse the adoption planner and preserve the documented no-overwrite and ordinary-folder no-write guarantees.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
