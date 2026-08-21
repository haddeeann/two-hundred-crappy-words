# 200 Crappy Words

200 Crappy Words is an early-stage desktop writing app for working with plain-text files in a folder. It provides a deliberately small, dark interface: choose a folder, pick a file, and write.

The app now counts words and stores progress toward its default 200-word target by selected project and local calendar date. The current persistence slice is awaiting its final restart-level desktop check.

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

## Current limitations

- Daily history, correction controls, and configurable targets are not available yet
- Moving or renaming a project folder currently starts a new local progress identity
- Files and folders cannot be renamed, moved, or deleted in the app
- The editor is intended for text files and does not provide rich-text or Markdown preview features
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

This is a functional prototype. Its trustworthy-editor milestone has passed automated and hands-on macOS QA. The product-specific daily-practice milestone now has deterministic word counting, a verified live progress footer, and app-local daily persistence awaiting its final restart demonstration.

Development follows the repository-backed [product roadmap](ROADMAP.md). The current milestone and exact next slice are recorded in [`docs/CURRENT.md`](docs/CURRENT.md), while consequential product and architecture choices are preserved in [`docs/DECISIONS.md`](docs/DECISIONS.md).

Local settings and draft-recovery behavior are documented in [`docs/DATA_AND_RECOVERY.md`](docs/DATA_AND_RECOVERY.md).

The deterministic word-count and daily-credit rules being implemented for milestone 0.3 are documented in [`docs/WORD_COUNTING.md`](docs/WORD_COUNTING.md).

The daily ledger's schema, privacy boundaries, and local-date behavior are documented in [`docs/DAILY_PROGRESS.md`](docs/DAILY_PROGRESS.md).

The current native capability and selected-folder access model is documented in [`docs/SECURITY_AND_PERMISSIONS.md`](docs/SECURITY_AND_PERMISSIONS.md).

The milestone's disposable-file desktop checks are in [`docs/MANUAL_QA.md`](docs/MANUAL_QA.md).
