# Current work

Last updated: 2026-08-22

## Active milestone

**0.4 — World projects**

Daily practice is complete. The active milestone turns an ordinary folder into an optional, portable science-fiction world project without taking ownership away from the writer or changing existing folders unexpectedly.

## Active slice

**0.4.4 — Add optional Markdown templates and create notes by semantic role**

### Intended outcome

Let a writer create an ordinary Markdown note from an optional science-fiction template in the appropriate configured project folder. Keep the prose fully editable in any text editor, limit frontmatter to the approved safe subset, and never modify an existing note or require a template.

### Acceptance criteria

- [ ] Define deterministic, dependency-free templates for character, location, faction, species, technology, spacecraft, event, scene, and chapter notes.
- [ ] Emit only approved `id`, `type`, and `title` frontmatter with safe scalar serialization and a local UUID v4.
- [ ] Map each template to a sensible configured semantic folder while allowing the writer to choose another real project folder.
- [ ] Add an explicit accessible note-creation form with template, title, portable filename, and destination.
- [ ] Write new `.md` notes with create-new semantics and never alter existing Markdown or require frontmatter for editing.
- [ ] Open the created note immediately and keep every prompt easy to ignore, replace, or delete.
- [ ] Pass focused tests, full frontend/Rust checks, and a packaged-app keyboard and disposable-project walkthrough.

## Next slices

1. 0.4.5 — Recent projects, navigation restoration, portability guidance, and milestone QA.

## Completed checkpoint

- The 0.4 format gate was approved on 2026-08-21. `docs/PROJECT_FORMAT.md` defines one visible `200-crappy-words.project.json` manifest with a local UUID, display name, and semantic folder mapping; personal practice, recovery, permissions, recent locations, and editor state remain app-local. Ordinary folders remain fully supported. Optional YAML frontmatter on newly created structured notes is limited initially to `id`, `type`, and `title`. Decision D-020 is accepted.
- The 0.4.1 foundation implements dependency-free version 1 parsing, validation, deterministic serialization, portable folder-path validation, read-only folder inspection, and namespaced UUID storage keys. Folder opening distinguishes missing, valid, malformed, invalid, unreadable, and newer manifests; every problem mode retains ordinary text editing and performs no write. Valid projects show their project name at the tree root and use stable app-local practice identity. Twenty-two focused tests bring the full suite to 141 passing tests across seventeen files; Svelte/TypeScript checks report zero warnings and the production frontend build passes.
- The 0.4.2 adoption flow explicitly previews the project name and nine independently selectable suggested folders, preflights every collision, creates only absent directories, and writes the manifest last with create-new semantics. Partial failures name the failed step and preserve every existing path. After adoption, path-keyed goal and ledger data are copied idempotently to the UUID identity while the legacy source remains intact.
- The packaged macOS walkthrough adopted a disposable ordinary folder as “A Quiet Red Planet,” omitted Research and Inbox, preserved its 5-word goal and corrected Aug 21 history, and reopened cleanly after restart. The manifest hash and modification time were unchanged by reopening. Keyboard QA covers initial name-field focus, Enter submission semantics, visible controls, and Escape cancellation from anywhere in the form. The full suite has 155 passing tests across eighteen files; Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, and Rust formatting/checks pass.
- The 0.4.3 native creation flow collects separate display and portable folder names, lets the writer tailor the suggested structure, chooses a parent through the native picker, preflights root collisions, and creates the root, selected directories, and manifest in a guarded deterministic order. Pure execution reports whether the root and which children were created if any step fails.
- The packaged macOS walkthrough created “The Glass Meridian” with eight selected directories, wrote a six-word manuscript note, set and reached a six-word goal, closed normally, moved the root externally, explained the stale remembered path on startup, and reopened the moved project through the native picker. The manuscript text, `6 / 6` practice state, display name, and UUID identity survived; the manifest hash remained unchanged. QA also covers invalid portable names, focus returning to the invalid field, live error clearing, initial focus, Escape, and selectable structure. The full suite has 164 passing tests across nineteen files; Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, and Rust formatting/checks pass.
- Milestone 0.3 passed its full disposable-project macOS walkthrough on 2026-08-21 using Computer Use against a freshly packaged build. The run covered baseline protection, per-project goals, live and persisted daily totals, quiet one-time completion, truthful goal changes, populated history, two restarts, correction validation, append-only audit display, deletion semantics, keyboard traversal, visible focus, and accessible labels.
- QA exposed two issues before the final pass. The correction editor now receives focus when opened so Enter and Escape work immediately. New ledger revisions now preserve prior correction entries, including through correction, later writing, deletion, and restart. The lifecycle regression test covers the audit across that transition.
- The frontend suite contains 119 passing tests across fifteen files. Svelte/TypeScript checks report zero errors and zero warnings, the production frontend and macOS application builds pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.
- Milestone 0.2 passed its disposable-file macOS walkthrough on 2026-08-19, including autosave, conflicts, missing and unwritable sources, interruption recovery, selected-folder restoration, window behavior, and keyboard access.

## Blockers and decision gates

No blocker. The format gate approved optional structured Markdown frontmatter limited to `id`, `type`, and `title`; template work must stay within that boundary and preserve ordinary Markdown compatibility.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
