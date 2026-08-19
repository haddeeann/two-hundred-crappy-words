# 200 Crappy Words

200 Crappy Words is an early-stage desktop writing app for working with plain-text files in a folder. It provides a deliberately small, dark interface: choose a folder, pick a file, and write.

The name describes the direction of the project, but the app does not count words or enforce a 200-word target yet.

## Current features

- Open a folder from the native folder picker
- Remember and reopen the last selected folder
- Browse files and lazily expand subfolders in a sidebar
- Open and edit plain-text files
- Create files in the root of the selected folder
- Add a `.txt` extension when a new filename has no extension
- Save the active file with `Command+S` on macOS or `Ctrl+S` elsewhere
- Indicate when the active file has unsaved changes
- Display filesystem errors in the interface

## Current limitations

- There is no word counter or 200-word goal behavior yet
- New files can only be created in the root of the open folder
- Files and folders cannot be renamed, moved, or deleted in the app
- There is no protection against losing unsaved edits when opening another file or folder
- The editor is intended for text files and does not provide rich-text or Markdown preview features
- The custom frameless window is still a work in progress

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

# Build the packaged desktop app
npm run tauri build
```

## Project structure

```text
src/routes/+page.svelte   Main interface and application behavior
src-tauri/                Tauri configuration and Rust application shell
static/                   Static images and icons
```

## Status

This is a functional prototype. The core folder-based editing workflow works, while the product-specific 200-word experience and several editor safeguards remain to be built.

Development follows the repository-backed [product roadmap](ROADMAP.md). The current milestone and exact next slice are recorded in [`docs/CURRENT.md`](docs/CURRENT.md), while consequential product and architecture choices are preserved in [`docs/DECISIONS.md`](docs/DECISIONS.md).
