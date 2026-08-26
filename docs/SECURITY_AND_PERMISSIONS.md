# Security and permissions

200 Crappy Words is a local-first desktop application. Its current writing workflow makes no network requests and has no telemetry, account, cloud-sync, or URL-opening capability.

## Webview content policy

The production webview uses a restrictive Content Security Policy: bundled application resources are the default, IPC is limited to Tauri's local transport, images are local or inline data, frames/objects/forms are disabled, and inline styles remain enabled only because the current Svelte interface uses dynamic indentation styles. Development adds only the local Vite HTTP/WebSocket origin needed for hot reload. Remote scripts and remote network connections are not allowed.

## Writing-folder access

The frontend is permitted to call only the general filesystem-plugin operations it currently uses: list or watch a directory, inspect file metadata, read a text file, write a text file, and create a directory. Metadata inspection lets the lore index enforce its per-file byte limit and detect a file that changes while being read. Recursive watching lets the in-memory lore index reconcile affected paths after external filesystem changes. Neither operation grants a new path: both remain inside the runtime scope established by the native picker. Directory creation is used only after the writer explicitly confirms world-project creation or adoption. Missing-note creation revalidates one unambiguous contained Markdown destination after confirmation and uses create-new writes so an existing path cannot be overwritten. The application grants no general filesystem-plugin delete or rename permission, no shell permission, and no static whole-filesystem (`**`) scope.

One custom native command supports the narrower confirmed lore-note rename transaction. It accepts only project-relative `.md` or `.markdown` source and destination paths, requires the supplied root plus both paths to be allowed by Tauri's live native-picker filesystem scope, canonicalizes the root and both containing locations, rejects symbolic or non-regular sources and any existing destination, and never follows a destination symbolic link. It creates the new name as a hard link, verifies both names identify the same file, and only then removes the old name. If the old name cannot be removed it attempts to remove the new name; any failure that can leave two names is reported explicitly. The frontend separately requires a stable unique note ID, stable-reads every previewed source, applies exact guarded link edits before the move, and rolls those edits back if the move fails. This command cannot rename folders or arbitrary non-Markdown files and does not broaden the picker scope.

Tauri's native folder dialog adds a folder explicitly selected by the writer to the runtime filesystem scope. The official persisted-scope plugin stores those runtime grants in `.persisted-scope` inside the application's local data directory so the remembered project can reopen after an app restart. The filesystem plugin is registered before persisted-scope, as required by the plugin.

The persisted scope can contain access to more than one folder if the writer has explicitly selected several over time. Tauri does not currently expose a safe removal operation for an individual allowed pattern; adding permanent deny patterns would make later re-selection unreliable. Retaining only writer-selected folder grants is the narrowest reliable model used here, and is materially narrower than the prototype's former access to every path.

After upgrading from a version without persisted scopes, the writer may need to choose the remembered folder once more. Future restarts can then restore that explicit grant.

The official filesystem plugin's `watch` feature is enabled only to observe the selected project. A watcher is disposed before the app changes projects and when its window is destroyed. Events are coalesced and their paths are revalidated for containment, exclusions, symbolic links, size limits, and stable reads before they can replace a known-good lore record. If monitoring or reconciliation fails, the app marks the memory-only index stale and keeps writing plus explicit refresh available.

## App-local data

Manuscript source-path repair, descriptive metadata editing, and sibling reordering use one dedicated native structure-replacement command rather than granting a general rename or replace permission. It accepts only the fixed root `200-crappy-words.manuscripts.json` inside the live picker scope, requires a regular non-symbolic file and exact expected text, validates the complete version-one replacement within the 10 MiB limit, stages a create-new sibling file with retained permissions, rechecks the source, atomically renames, and rereads the exact result. It cannot move or rewrite a Markdown source.

The default filesystem permission also permits Tauri's application-specific data directories. Settings, draft recovery, and persisted scope metadata live there. See [`DATA_AND_RECOVERY.md`](DATA_AND_RECOVERY.md) for the content and cleanup behavior of settings and draft records.

## Native capabilities

The main window has only the native window permissions needed for its current interface: dragging the frameless title bar, minimizing, requesting a close, and completing a close after the safe-save handler approves it. The unused template greeting command and opener plugin have been removed.

Any future network access, external URL opening, shell execution, or broader filesystem operation requires an explicit capability review rather than inheriting permission from this milestone.

References: [Tauri Content Security Policy guidance](https://v2.tauri.app/security/csp/), [Tauri dialog scope behavior](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/dialog/guest-js/index.ts), [official persisted-scope plugin](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/persisted-scope).
