# Decision log

This is a lightweight record of product and architectural decisions that future work should not have to rediscover. Newer decisions may supersede older ones but should not erase their history.

## D-001 — Local-first core

- Date: 2026-08-19
- Status: accepted

The core writing, project, goal, search, and worldbuilding workflows must function without an account or network connection. Creative content is not sent elsewhere as part of ordinary operation.

Why: unpublished fiction is sensitive, reliable offline access matters, and local ownership is a defining product value.

## D-002 — Portable creative files

- Date: 2026-08-19
- Status: accepted

Creative writing and lore should use ordinary Markdown or plain-text files wherever possible. App-specific metadata must be human-readable, documented, versioned, and kept minimal.

Why: writers should be able to inspect, back up, search, and edit their work without this application.

## D-003 — Two hundred is the opinionated default

- Date: 2026-08-19
- Status: accepted

The default daily target is 200 words. A later milestone may make the target configurable, but product language and default design should retain the identity of 200 Crappy Words.

Why: a small concrete floor reduces the emotional cost of starting and gives the product a memorable promise.

## D-004 — Humane progress

- Date: 2026-08-19
- Status: accepted

Progress and streak features must encourage returning without punishment, public competition, shame, or the destruction of earned history after a missed day.

Why: the product exists to sustain creative practice rather than optimize an engagement metric.

## D-005 — Initial daily-credit semantics

- Date: 2026-08-19
- Status: accepted, subject to usability testing

Daily credit will initially use gross positive word-count changes made during active editing sessions. Deletions do not remove already-earned daily credit. Paste behavior counts initially because this is a private aid, not a competitive score.

Why: revision and rewriting are real work, while comparing only end-of-day document sizes would punish deletion and restructuring. The behavior will be clearly documented and tested before storage is made permanent.

## D-006 — No required generative AI

- Date: 2026-08-19
- Status: accepted

Generative AI is not required for the core product. Deterministic, source-linked continuity checks come first. Any later AI integration must be optional, disclose what leaves the computer, and pass a separate product/privacy decision gate.

Why: the product should remain private, dependable, and useful without an external provider.

## D-007 — Repository-backed continuity

- Date: 2026-08-19
- Status: accepted

`ROADMAP.md`, `docs/CURRENT.md`, milestone specifications, and this decision log are the durable project memory. `AGENTS.md` requires Codex to read and maintain them.

Why: chat context is temporary; project intent and execution state must survive new tasks, compaction, and time away.

## D-008 — Autonomy and checkpoints

- Date: 2026-08-19
- Status: accepted

Codex may make ordinary, reversible, in-repository implementation decisions and continue across planned slices. It pauses at the decision gates in `AGENTS.md`. Verified local commits may be used as recoverable checkpoints, but publishing, pushing, deploying, and releasing require explicit approval.

Why: the project should keep moving without making the user remember or supervise every technical detail, while respecting privacy and consequential boundaries.

## D-009 — TypeScript and focused Vitest tests

- Date: 2026-08-19
- Status: accepted

New frontend application logic is written in TypeScript. Pure state and domain behavior is tested with Vitest; component or browser-level tools will be added only when a slice requires them.

Why: the prototype's unchecked JavaScript hid baseline errors, while the save and recovery work needs deterministic race-condition coverage. Vitest uses the existing Vite pipeline and supports the installed Node and Vite versions.

## D-010 — Private app-local recovery drafts

- Date: 2026-08-19
- Status: accepted

Dirty text is mirrored quickly to a versioned record in Tauri's application-data directory. A record stores the source path, draft, update time, revision, and a non-security fingerprint of the last persisted content. It is never transmitted and is removed only after covered content is persisted or the writer explicitly dismisses it.

Why: an app or machine interruption should not erase the current writing burst, while source-file conflicts must remain visible and under the writer's control.

## D-011 — Portable, non-destructive file creation

- Date: 2026-08-19
- Status: accepted

The app rejects path separators, control characters, cross-platform-invalid characters, trailing spaces or periods, and reserved device names in its file-creation field. A missing extension still becomes `.txt`, and creation uses the filesystem's atomic create-new mode.

Why: projects are intended to remain portable ordinary folders, and a stale sidebar must never let file creation truncate an existing document.

## D-012 — Persist only explicitly selected folder scopes

- Date: 2026-08-19
- Status: accepted

Filesystem commands are enabled without a static external-path grant. Tauri's native dialog supplies a recursive runtime scope for each folder the writer explicitly selects, and the official persisted-scope plugin restores those grants across restarts. Previously selected folders can remain in that local scope because Tauri exposes forbidding—not safely removing—an individual allowed pattern.

Why: this preserves the useful last-folder behavior while removing the prototype's `**` access to every path. It also keeps the native picker as the authorization boundary instead of accepting arbitrary paths from frontend code.

## D-013 — Compare before every source write

- Date: 2026-08-19
- Status: accepted

Before a normal autosave, the app rereads the source and requires it to exactly match the last content known to have persisted. A changed, missing, moved, or unreadable source is not overwritten or recreated. A native dialog can authorize a force write for only the current path and revision after showing an appropriate warning and, for conflicts, bounded previews.

Why: ordinary files can be edited by other tools. Local-first ownership is not meaningful if autosave silently destroys an external revision.

## D-014 — Restrictive production webview policy

- Date: 2026-08-19
- Status: accepted

The packaged webview allows bundled resources and Tauri's local IPC transport, with no remote scripts or remote network origins. Objects, frames, forms, and base-URL changes are disabled. Development adds only Vite's local HTTP and WebSocket origins; inline styles remain allowed for current dynamic tree indentation.

Why: native command permissions are only a useful boundary if untrusted remote code cannot be loaded into the privileged webview. The starter template's `csp: null` did not enable Tauri's CSP protection.

## D-015 — Deterministic word tokens and edit-based credit

- Date: 2026-08-19
- Status: accepted, subject to usability testing

Document words use an app-owned Unicode rule: letter/number runs form tokens, combining marks remain attached, internal apostrophes remain within words, numeric periods and commas remain within numbers, and hyphens or dashes split tokens. The rule does not use operating-system dictionary segmentation. Daily credit adds only positive document-count changes from active text edits; loading, switching, recovery, save events, and external reloads establish state without earning credit.

Why: the same text should count consistently across supported machines, daily history must not depend on save timing, and existing or recovered prose must not be counted again merely because it was opened. The transparent rule and its known limitation for unspaced scripts are documented in `docs/WORD_COUNTING.md`.

## D-016 — App-local daily ledger keyed by folder and local date

- Date: 2026-08-21
- Status: accepted for the pre-project-format milestone

Daily credit is stored in a versioned `daily-progress.json` file in Tauri's app-data directory. Records are keyed by the explicitly selected folder's absolute path and a date derived from the computer's local calendar. They contain counters, timestamps, and monotonic revisions but no manuscript text. A folder move or rename creates a new identity until the portable project format in milestone 0.4 supplies a safer durable identifier.

Why: progress should survive restart without placing machine-specific habit data inside ordinary writing folders or changing their format prematurely. Local date keys match a writer's lived day, while retaining independent entries makes midnight, backward clock changes, and time-zone changes deterministic and recoverable.

## D-017 — Per-project goals and a quiet once-daily completion

- Date: 2026-08-21
- Status: accepted, subject to visual usability testing

The daily target defaults to 200 and can be changed per explicitly selected project to a whole number from 1 through 100,000. Reaching the target records one completion timestamp for that project and local date. The interface acknowledges it with a short inline status and a polite screen-reader announcement, without a modal, sound, animation, focus change, or interruption to typing.

Why: 200 remains the product's opinionated identity while writers with different practices retain agency. Persisting a single daily completion state prevents repeated celebration after restart, deletion, file switching, or later target changes, and the motion-free inline treatment follows the calm, non-punitive product direction.

## D-018 — Humane history records practice without inventing failure

- Date: 2026-08-21
- Status: accepted, subject to visual usability testing

History lists only dates that have a local progress record, newest first, with the credited words and applicable goal. Completed days retain the goal that was actually acknowledged, while incomplete days show the most recently recorded goal. A completed day is determined by its persisted completion timestamp rather than recalculating it against a later goal. Streak calculations use consecutive completed local calendar dates. The current rhythm may end yesterday while today is still open; after a longer gap the interface says a fresh start is available and preserves the best rhythm instead of displaying a broken or zeroed streak.

Why: absent ledger entries do not prove that a writer failed, and a new day should not make yesterday's accomplishment disappear before the writer has had a chance to begin. Storing the current and completed goals keeps past progress understandable after target changes, while the completion timestamp preserves what the app actually acknowledged at the time.

## D-019 — Explicit corrections preserve an append-only local audit

- Date: 2026-08-21
- Status: accepted, subject to desktop usability testing

A writer may replace the credited-word total for a recorded date with a non-negative whole number. Each change appends the previous total, corrected total, and correction timestamp to that day's app-local record before advancing its revision. Correcting below that day's recorded goal removes its completion; correcting to or above the goal records completion without replaying the celebratory status. Correcting the active day resets the editing baseline to the corrected total, so existing document text is not recounted.

Why: automatic counting can be misunderstood or affected by an unusual workflow, so private habit data must remain under the writer's control. Keeping prior values makes the change recoverable and understandable without placing app metadata in the manuscript folder. Recalculating completion makes history truthful when the correction specifically says the old total was mistaken.

## D-020 — Proposed portable world-project identity and note metadata

- Date: 2026-08-21
- Status: accepted

The proposed format uses one visible `200-crappy-words.project.json` file containing a version discriminator, locally generated UUID, display name, and optional portable folder-role mappings. Personal practice data, recovery drafts, recent locations, permissions, and editor state remain app-local. Ordinary folders remain fully supported and are never adopted merely by opening them. Newly created structured Markdown notes may opt into safe-subset YAML frontmatter limited initially to `id`, `type`, and `title`.

Why: a small portable identity lets a world project survive a folder move without turning private habit or machine state into creative-project churn. A visible JSON manifest is inspectable and unambiguous, while minimal optional frontmatter prepares rename-safe notes without modifying existing Markdown. The complete format and failure behavior are documented in [`PROJECT_FORMAT.md`](PROJECT_FORMAT.md). The user approved the format gate on 2026-08-21.

## D-021 — App-local workspace state and explicit copy resolution

- Date: 2026-08-22
- Status: accepted

The app keeps at most twelve recent projects plus selected directory, expanded directories, and active file in versioned `workspace.json` app data. World-project entries use the stable manifest UUID and ordinary folders use their absolute path. Navigation paths are stored relative to the project and restored only when each path still resolves to an existing non-symbolic-link item inside the opened root. Creative text, recovery drafts, cursor state, and scroll state are not stored there.

When the same world UUID is opened at a second accessible path, the writer chooses whether it is the same project, an independent copy, or an ordinary folder. Only the independent choice rewrites anything portable: it assigns a new UUID through a compare-before-write update that preserves unknown version-one manifest fields. Moving a world whose previous path is inaccessible updates only app-local location data, and recovery drafts remain absolute-path-specific.

Why: returning to work should restore useful mental context without creating machine-specific churn in creative folders. Stable-key deduplication makes moves calm, while an explicit copy choice prevents two filesystem copies from silently sharing or unexpectedly splitting private practice identity.

## D-022 — Connected-lore names and wiki links

- Date: 2026-08-22
- Status: accepted

The recommended first connected-lore format indexes regular project Markdown locally, derives titles without modifying ordinary files, adds an optional safe `aliases` string sequence to structured-note frontmatter, and gives `[[Note]]`, labeled links, heading links, rooted path disambiguation, escaping, normalization, and ambiguity explicit portable semantics. The creative-text index remains in memory in version 1 rather than creating another persistent manuscript copy.

Why: backlinks, search, rename safety, and missing-note creation must agree on what a note and target mean. Choosing these rules before implementation avoids silently changing writer-authored links later. The full approved format, limits, fixtures, and decision points are in [`CONNECTED_LORE_FORMAT.md`](CONNECTED_LORE_FORMAT.md). The user approved this format gate on 2026-08-22.

## D-023 — Stable-ID lore rename uses previewed repair and a no-clobber native move

- Date: 2026-08-22
- Status: accepted

Only an indexed Markdown note with one unique valid stable ID may enter the rename flow. The writer supplies a project-relative Markdown destination and reviews the move, every exact path-dependent wiki-link replacement, and the count of resolved links deliberately left unchanged. Confirmation rechecks the current index and every source file. Link edits use compare-before-write guards and are rolled back if a later edit or move fails. The move itself uses a picker-scope-bound native command that creates a non-overwriting hard-link destination, verifies file identity, and removes the old name only afterward; unsupported filesystems or ambiguous cleanup fail visibly rather than falling back to an overwriting rename.

Why: the filesystem plugin's ordinary rename operation may replace an existing destination, while copy-then-delete can silently lose metadata or strand a partially copied note. Stable IDs establish which note is moving, simulation distinguishes links that need repair from those that remain valid, and hard-link-then-unlink supplies a recoverable same-filesystem no-clobber boundary without granting the webview general rename or delete authority.

## D-024 — Central manuscript order with chapter folders and scene prose

- Date: 2026-08-22
- Status: accepted

Portable manuscript order and compact outline metadata live in one visible project-root `200-crappy-words.manuscripts.json` file. Prose remains in ordinary Markdown scene files. A chapter is primarily a folder or logical container with an optional `chapter.md` overview for freeform notes; that overview is not compiled by default. A conventional one-file chapter is supported only when it has no child scenes, preventing chapter prose and scene prose from being included ambiguously. The central structure, rather than filename sorting or distributed order fields, remains authoritative. Existing files can bind by contained project-relative path without being rewritten, while an optional unique structured-note ID supports explicit move repair.

Why: the user's established workflow keeps every scene in its own file and treats the chapter folder plus optional overview as the natural planning unit. Central order makes reordering a small inspectable change instead of rewriting many Markdown files, while optional folders and overviews preserve ordinary filesystem usability without forcing existing writers to reorganize. Keeping overview notes out of compile and forbidding mixed chapter/child prose avoids accidental duplication. The complete format, failure behavior, mutation safeguards, and compile boundary are documented in [`MANUSCRIPT_FORMAT.md`](MANUSCRIPT_FORMAT.md). The user approved the revised format on 2026-08-22.

## D-025 — Frozen manuscript previews and one guarded inverse

- Date: 2026-08-25
- Status: accepted

A manuscript structure mutation freezes the exact writer-reviewed plan until it is cancelled or confirmed. Confirmation freshly scans any identity-bearing Markdown, rereads and compares the structure and relevant sources, derives the same complete validated replacement again, and writes only through the fixed-file native atomic replacement. A successful operation may retain one exact inverse in memory, but that Undo becomes unavailable immediately if the current structure text or fingerprint no longer matches the just-written result. Neither the preview nor Undo is persisted.

Why: filesystem watchers should update awareness without silently changing what the writer consented to. Reusing one narrow replacement boundary for source repair, metadata editing, and later reorder keeps external edits from being overwritten and makes the recoverable promise precise. The first implementation repairs only a uniquely resolved moved stable-ID binding and never moves or rewrites its Markdown source.

## D-026 — Initial reorder is an explicit adjacent-sibling swap

- Date: 2026-08-25
- Status: accepted

The first reorder action moves a top-level chapter or loose scene one position within its manuscript's `items` array, or a scene one position within its chapter's `children` array. It exposes named Earlier and Later controls wherever the adjacent destination exists, requires a preview that identifies both items and the exact array, and uses the frozen atomic replacement plus one guarded inverse from D-025. Drag-and-drop is not required. A scene transfer between chapters is deferred as a separately previewed move because it changes both parentage and order.

Why: an adjacent swap has exact keyboard semantics, a small understandable diff, and no hidden position system. Keeping cross-chapter transfer separate prevents a simple reorder control from silently changing story hierarchy and leaves room to preview that more consequential move clearly.

## D-027 — Proposed corkboard uses stacked chapter sections

- Date: 2026-08-25
- Status: accepted

The recommended first corkboard is a dedicated main-pane planning workspace. Chapters appear as vertically stacked sections containing ordered scene cards, with a comparable loose-scenes section when present. Cards foreground title and synopsis, add only metadata that exists, retain source-health warnings, and keep long planning notes behind expansion. Opening Corkboard temporarily replaces the editor pane without discarding its existing safe draft state; opening a scene returns to that scene in the editor. The visible card order remains the central manuscript order, and no freeform coordinates or second order are persisted.

Why: stacked sections keep the complete chapter hierarchy legible on a laptop, avoid nested horizontal scrolling, adapt to narrow widths, and provide a natural linear keyboard traversal. Chapter columns provide stronger at-a-glance spatial comparison but become wide quickly; a freeform canvas is harder to navigate accessibly and would require new portable position metadata before it could be trustworthy.

The user approved the recommended layout and main-pane behavior on 2026-08-25.
