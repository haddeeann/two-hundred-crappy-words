# Current work

Last updated: 2026-08-22

## Active milestone

**0.4 — World projects**

Daily practice is complete. The active milestone turns an ordinary folder into an optional, portable science-fiction world project without taking ownership away from the writer or changing existing folders unexpectedly.

## Active slice

**0.4.5 — Recent projects, navigation restoration, portability guidance, and milestone QA**

### Intended outcome

Make returning to several worlds calm and reliable without putting machine-specific state into creative folders. Keep a bounded app-local recent list, restore only safe useful navigation state, explain missing or moved projects clearly, document backup boundaries, and complete the milestone-wide regression checkpoint.

### Acceptance criteria

- [ ] Add a versioned, bounded app-local recent-project repository keyed by stable UUID for world projects and path for ordinary folders.
- [ ] Update a moved world's last-known path without duplicating its recent entry, and let the writer remove stale entries without touching project files.
- [ ] Add an accessible recent-project UI with clear unavailable-project recovery.
- [ ] Persist selected directory, expanded folders, and active file per project; restore only existing paths inside the currently opened root.
- [ ] Never attach a path-specific recovery draft to a moved file or write editor/navigation state into the project manifest.
- [ ] Add truthful in-app and written guidance for project identity, backup, moves/copies, private practice data, and recovery drafts.
- [ ] Pass repository and restoration tests, full frontend/Rust checks, dependency audit, and a packaged milestone-wide macOS walkthrough.

## Next slices

1. 0.5.1 — Define the connected-lore index and link semantics before project-wide scanning.

## Completed checkpoint

- The 0.4 format gate was approved on 2026-08-21. `docs/PROJECT_FORMAT.md` defines one visible `200-crappy-words.project.json` manifest with a local UUID, display name, and semantic folder mapping; personal practice, recovery, permissions, recent locations, and editor state remain app-local. Ordinary folders remain fully supported. Optional YAML frontmatter on newly created structured notes is limited initially to `id`, `type`, and `title`. Decision D-020 is accepted.
- The 0.4.1 foundation implements dependency-free version 1 parsing, validation, deterministic serialization, portable folder-path validation, read-only folder inspection, and namespaced UUID storage keys. Folder opening distinguishes missing, valid, malformed, invalid, unreadable, and newer manifests; every problem mode retains ordinary text editing and performs no write. Valid projects show their project name at the tree root and use stable app-local practice identity. Twenty-two focused tests bring the full suite to 141 passing tests across seventeen files; Svelte/TypeScript checks report zero warnings and the production frontend build passes.
- The 0.4.2 adoption flow explicitly previews the project name and nine independently selectable suggested folders, preflights every collision, creates only absent directories, and writes the manifest last with create-new semantics. Partial failures name the failed step and preserve every existing path. After adoption, path-keyed goal and ledger data are copied idempotently to the UUID identity while the legacy source remains intact.
- The packaged macOS walkthrough adopted a disposable ordinary folder as “A Quiet Red Planet,” omitted Research and Inbox, preserved its 5-word goal and corrected Aug 21 history, and reopened cleanly after restart. The manifest hash and modification time were unchanged by reopening. Keyboard QA covers initial name-field focus, Enter submission semantics, visible controls, and Escape cancellation from anywhere in the form. The full suite has 155 passing tests across eighteen files; Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, and Rust formatting/checks pass.
- The 0.4.3 native creation flow collects separate display and portable folder names, lets the writer tailor the suggested structure, chooses a parent through the native picker, preflights root collisions, and creates the root, selected directories, and manifest in a guarded deterministic order. Pure execution reports whether the root and which children were created if any step fails.
- The packaged macOS walkthrough created “The Glass Meridian” with eight selected directories, wrote a six-word manuscript note, set and reached a six-word goal, closed normally, moved the root externally, explained the stale remembered path on startup, and reopened the moved project through the native picker. The manuscript text, `6 / 6` practice state, display name, and UUID identity survived; the manifest hash remained unchanged. QA also covers invalid portable names, focus returning to the invalid field, live error clearing, initial focus, Escape, and selectable structure. The full suite has 164 passing tests across nineteen files; Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, and Rust formatting/checks pass.
- The 0.4.4 template engine deterministically creates character, location, faction, species, technology, spacecraft, event, scene, and chapter Markdown. JSON-compatible YAML quoting keeps frontmatter to local UUID `id`, recognized `type`, and trimmed `title`; body prompts are HTML comments that can be ignored or deleted. Filenames are portable `.md` names, template defaults follow semantic folder mappings, configured nested paths are verified segment by segment, and any real top-level project directory remains selectable.
- The packaged macOS walkthrough created and immediately opened `Inbox/iss-penumbra.md` from the Spacecraft template after overriding its Technology default. The file contained exactly three frontmatter fields plus removable prompts, existing template text was treated as a 74-word document baseline without changing the existing `6 / 6` daily credit, and a same-name retry reported the collision without changing the file hash. Keyboard QA covers initial focus, validation focus, select menus, automatic filename and role changes, alternate destination, Escape, and form-error cleanup. The full suite has 174 passing tests across twenty-one files; Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, and Rust formatting/checks pass.
- Milestone 0.3 passed its full disposable-project macOS walkthrough on 2026-08-21 using Computer Use against a freshly packaged build. The run covered baseline protection, per-project goals, live and persisted daily totals, quiet one-time completion, truthful goal changes, populated history, two restarts, correction validation, append-only audit display, deletion semantics, keyboard traversal, visible focus, and accessible labels.
- QA exposed two issues before the final pass. The correction editor now receives focus when opened so Enter and Escape work immediately. New ledger revisions now preserve prior correction entries, including through correction, later writing, deletion, and restart. The lifecycle regression test covers the audit across that transition.
- The frontend suite contains 119 passing tests across fifteen files. Svelte/TypeScript checks report zero errors and zero warnings, the production frontend and macOS application builds pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.
- Milestone 0.2 passed its disposable-file macOS walkthrough on 2026-08-19, including autosave, conflicts, missing and unwritable sources, interruption recovery, selected-folder restoration, window behavior, and keyboard access.

## Blockers and decision gates

No blocker. Recent locations and navigation are explicitly app-local under the approved format decision. Restoration must validate every path against the currently opened root and must not weaken recovery-draft path isolation.

## Handoff protocol

At the end of every slice, replace stale details above with:

- what changed;
- what was verified and the exact results;
- any unresolved risk or decision gate; and
- the single next executable slice.
