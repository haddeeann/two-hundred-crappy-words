# 200 Crappy Words

200 Crappy Words is an early-stage desktop writing app for working with plain-text files in a folder. It provides a deliberately small, dark interface: choose a folder, pick a file, and write.

The app now counts words and stores progress toward its default 200-word target by selected project and local calendar date. Daily-practice persistence, goals, history, corrections, and restart behavior have passed their desktop checkpoint. A writer can also explicitly turn an existing folder into a portable named world project without changing its existing material.

## Current features

- Open a folder from the native folder picker
- Remember and reopen the last selected folder
- Browse naturally sorted files and lazily expand subfolders in a sidebar
- Open and edit plain-text files
- Select a folder and create a file there without overwriting an existing path
- Add a `.txt` extension when a new filename has no extension
- Autosave shortly after typing pauses
- Save the active file with `Command+S` on macOS or `Ctrl+S` elsewhere
- Show dirty, saving, saved, and failed save states
- Resolve pending edits before switching files, switching folders, or closing
- Detect external edits, moves, deletion, and unreadable sources before writing
- Require an explicit choice before overwriting or recreating a conflicted path
- Keep private app-local recovery drafts and offer them after an interruption
- Provide accessible macOS-style close and minimize controls
- Limit filesystem access to folders explicitly chosen in the native picker
- Block remote scripts and network origins in the packaged webview
- Display filesystem errors in the interface
- Show the active document's live word count
- Track and locally persist gross-positive writing progress toward 200 words by project and date
- Change a project's daily goal while keeping 200 as the default
- Acknowledge the first goal completion of the day without interrupting typing
- Review recorded writing days and gentle current/best rhythm information
- Correct a mistaken daily total while retaining a private local audit
- Recognize an approved world-project manifest without modifying the folder on open
- Use a valid world project's stable UUID for app-local goals and progress
- Explicitly adopt an ordinary folder as a named world project
- Choose which suggested manuscript and worldbuilding folders to create during adoption
- Preserve existing app-local goals and writing history when adopting a folder
- Create a brand-new named world project inside a location chosen with the native folder picker
- Move or rename a valid world-project folder and retain its app-local goal and writing history after reopening
- Create ordinary Markdown notes from optional character, location, faction, species, technology, spacecraft, event, scene, and chapter templates
- Choose a verified project folder for a template note and protect existing files with create-new writes
- Return through a bounded app-local recent-project list and remove shortcuts without deleting files
- Restore the selected folder, expanded tree branches, and active file when those paths still exist safely inside the project
- Reconnect a moved world by stable ID and make an intentional folder copy independent through a guarded manifest update
- Safely index contained Markdown titles, aliases, headings, and wiki links in memory
- Resolve `[[Note]]`, labeled, rooted-path, and heading links without guessing through collisions
- Show broken links, malformed metadata, excluded paths, symlinks, and scan limits in a refreshable lore-index status
- Reflect the active unsaved Markdown buffer in the derived index without changing save or daily-credit behavior
- Refresh affected lore records automatically after contained external creates, edits, moves, and removals
- Keep the last known index available with an explicit refresh fallback when a filesystem change cannot be reconciled safely
- Complete note names and uniquely resolved headings from the keyboard while typing an open wiki link
- Insert collision-safe rooted paths when a title or alias would resolve ambiguously
- Inspect resolved, broken, and ambiguous outgoing links plus source-context backlinks for the active Markdown note
- Follow a resolved connection to its exact heading or source link through the existing safe-navigation flow

## Current limitations

- Correction audit export is not available yet
- Ordinary folders still use their absolute path as local progress identity until explicitly adopted
- Cursor position and editor scroll position are not restored yet
- Files and folders cannot be renamed, moved, or deleted in the app
- The editor is intended for text files and does not provide rich-text or Markdown preview features
- Project search, quick opening, unlinked mentions, and a side-by-side reference pane are not yet available
- The frameless window does not yet provide maximize/full-screen controls
- Distribution signing, notarization, and a finished installer are deferred to release readiness

## Tech stack

- [Tauri 2](https://v2.tauri.app/) for the desktop application shell and native filesystem access
- [SvelteKit](https://svelte.dev/docs/kit/introduction) and [Svelte 5](https://svelte.dev/) for the interface
- [TypeScript](https://www.typescriptlang.org/) and [Vite](https://vite.dev/) for frontend development
- Rust for the Tauri application layer

## Development setup

You will need:

- [Node.js](https://nodejs.org/) and npm
- [Rust](https://www.rust-lang.org/tools/install)
- The [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system

On macOS, the Tauri prerequisites include Apple's command-line development tools:

```sh
xcode-select --install
```

Install the JavaScript dependencies:

```sh
npm install
```

Run the desktop app in development mode:

```sh
npm run tauri dev
```

## Useful commands

```sh
# Run Svelte and TypeScript checks
npm run check

# Build the frontend
npm run build

# Build the unsigned macOS application bundle
npm run tauri build -- --bundles app
```

## Project structure

```text
src/routes/+page.svelte   Main interface and application behavior
src-tauri/                Tauri configuration and Rust application shell
static/                   Static images and icons
```

## Status

This is a functional prototype. Its trustworthy-editor, daily-practice, and world-project milestones have passed automated and hands-on macOS QA. The active connected-lore milestone now has approved link semantics, a bounded incrementally refreshed memory-only index, keyboard completion, and outgoing/backlink navigation; project search and a quick opener come next.

Development follows the repository-backed [product roadmap](ROADMAP.md). The current milestone and exact next slice are recorded in [`docs/CURRENT.md`](docs/CURRENT.md), while consequential product and architecture choices are preserved in [`docs/DECISIONS.md`](docs/DECISIONS.md).

Local settings and draft-recovery behavior are documented in [`docs/DATA_AND_RECOVERY.md`](docs/DATA_AND_RECOVERY.md). Backup, move, and copy boundaries are summarized in [`docs/BACKUP_AND_PORTABILITY.md`](docs/BACKUP_AND_PORTABILITY.md).

The deterministic word-count and daily-credit rules being implemented for milestone 0.3 are documented in [`docs/WORD_COUNTING.md`](docs/WORD_COUNTING.md).

The daily ledger's schema, privacy boundaries, and local-date behavior are documented in [`docs/DAILY_PROGRESS.md`](docs/DAILY_PROGRESS.md).

The approved portable manifest and optional Markdown metadata are documented in [`docs/PROJECT_FORMAT.md`](docs/PROJECT_FORMAT.md).

The approved wiki-link semantics, indexing limits, and privacy boundary are documented in [`docs/CONNECTED_LORE_FORMAT.md`](docs/CONNECTED_LORE_FORMAT.md).

The current native capability and selected-folder access model is documented in [`docs/SECURITY_AND_PERMISSIONS.md`](docs/SECURITY_AND_PERMISSIONS.md).

The milestone's disposable-file desktop checks are in [`docs/MANUAL_QA.md`](docs/MANUAL_QA.md).
