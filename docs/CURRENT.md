# Current work

Last updated: 2026-08-21

## Active milestone

**0.4 — World projects**

Daily practice is complete. The active milestone turns an ordinary folder into an optional, portable science-fiction world project without taking ownership away from the writer or changing existing folders unexpectedly.

## Active slice

**0.4.1 — Propose the portable project model**

### Intended outcome

Define the smallest versioned, human-readable project manifest and the boundary between portable project data and machine-local state. This slice produces a reviewable format proposal before any application code writes permanent project metadata.

### Acceptance criteria

- [x] Audit the current folder, persistence, permission, and navigation assumptions that the project model must preserve.
- [x] Propose a minimal manifest name, schema, stable project identity, and format-version behavior.
- [x] Specify which settings travel with the project and which remain app-local.
- [x] Define safe adoption, creation, move/reopen, unknown-version, and future-migration behavior.
- [x] Document compatibility with ordinary folders and the no-overwrite rule.
- [ ] Present the on-disk format at the milestone decision gate before implementation.

## Next slices

1. 0.4.2 — Create or adopt a world project without overwriting existing material.
2. 0.4.3 — Add the restrained default folder structure and optional templates.
3. 0.4.4 — Project navigation, recent projects, portability guidance, and milestone QA.

## Completed checkpoint

- The 0.4.1 audit and format proposal are complete in `docs/PROJECT_FORMAT.md`. The recommendation is one visible `200-crappy-words.project.json` manifest with a local UUID, display name, and semantic folder mapping; personal practice, recovery, permissions, recent locations, and editor state remain app-local. Ordinary folders remain fully supported. Optional YAML frontmatter on newly created structured notes is limited initially to `id`, `type`, and `title`. Decision D-020 remains proposed rather than accepted.
- Milestone 0.3 passed its full disposable-project macOS walkthrough on 2026-08-21 using Computer Use against a freshly packaged build. The run covered baseline protection, per-project goals, live and persisted daily totals, quiet one-time completion, truthful goal changes, populated history, two restarts, correction validation, append-only audit display, deletion semantics, keyboard traversal, visible focus, and accessible labels.
- QA exposed two issues before the final pass. The correction editor now receives focus when opened so Enter and Escape work immediately. New ledger revisions now preserve prior correction entries, including through correction, later writing, deletion, and restart. The lifecycle regression test covers the audit across that transition.
- The frontend suite contains 119 passing tests across fifteen files. Svelte/TypeScript checks report zero errors and zero warnings, the production frontend and macOS application builds pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.
- Milestone 0.2 passed its disposable-file macOS walkthrough on 2026-08-19, including autosave, conflicts, missing and unwritable sources, interruption recovery, selected-folder restoration, window behavior, and keyboard access.

## Blockers and decision gates

The required milestone 0.4 format decision gate is ready. Implementation must pause until the user approves or revises the manifest and frontmatter proposal in `docs/PROJECT_FORMAT.md`.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
