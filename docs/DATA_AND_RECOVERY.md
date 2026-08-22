# Data and recovery

200 Crappy Words is designed as a local-first application. Its core writing workflow does not require an account or network connection.

## Writing files

The application reads and writes the text files in the folder the writer chooses. The folder remains an ordinary filesystem folder and can be backed up or opened with other tools.

If the folder contains a valid approved `200-crappy-words.project.json` manifest, the app recognizes its portable identity and preferred folder roles without changing the folder merely because it was opened. Missing, invalid, or newer manifests leave ordinary text editing available. The format is documented in [`PROJECT_FORMAT.md`](PROJECT_FORMAT.md).

## Settings

The last opened folder is stored in `settings.json` in Tauri's app-data directory for the application.

`workspace.json` stores at most twelve recent-project shortcuts plus useful navigation state for each retained project: selected directory, expanded directories, and active file. World projects use the manifest's stable project ID; ordinary folders use their absolute path. Every remembered navigation path is project-relative and is accepted on restoration only if it still resolves to an existing non-symbolic-link item inside the currently opened root. Removing a recent shortcut removes only this app-local record and never a project file.

The same directory can contain `.persisted-scope`, which records filesystem access for folders the writer explicitly chose in the native picker. This lets the last folder reopen without granting static access to the rest of the computer. Permission details and limitations are documented in [`SECURITY_AND_PERMISSIONS.md`](SECURITY_AND_PERMISSIONS.md).

The connected-lore index is not another settings file. Version 1 derives Markdown titles, aliases, headings, links, backlink context, search text, and unlinked-mention suggestions in application memory and discards them when the app process ends or the project index is replaced. Contained filesystem events update affected records in that same ephemeral index; they do not create a persistent cache. Quick-opener queries are held only while its dialog is open and are cleared on close; no query or result history is written. A side reference likewise holds only its current verified source in memory and is cleared when closed or when its project context is replaced. Connected-lore Back/Forward history is bounded to fifty editor/reference contexts, retains only project-relative paths, source fingerprints, and selections in memory, and clears on project replacement or process exit. Unlinked-mention dismissals and lore-rename previews are also session-only and are not written to app data. A confirmed rename changes only the previewed project Markdown paths and exact link targets; it does not create a private rename log. The app does not persist creative text or derived lore data in Tauri app data. Only ordinary recovery behavior may temporarily persist an unsaved active draft as described below.

An opted-in project may contain `200-crappy-words.manuscripts.json`, a visible writer-owned structure file that stores portable book, chapter, and scene order plus compact planning metadata and project-relative Markdown bindings. It belongs in normal project backups and may contain creative titles, synopses, and notes. The read-only in-app outline is derived from that file and verified Markdown sources in memory; it has no app-local cache and opening or refreshing it does not rewrite either the structure or prose. Initial creation is explicit and previewed, writes only this previously absent file with create-new protection, and can import existing Markdown bindings without changing any Markdown byte. The format and its source limits are documented in [`MANUSCRIPT_FORMAT.md`](MANUSCRIPT_FORMAT.md).

## Recovery drafts

While a document has unsaved changes, the application maintains a second local copy in `recovery.json` in Tauri's app-data directory. Tauri resolves that directory according to the operating system and the application identifier `com.pat.two-hundred-crappy-words`.

A recovery record contains:

- the absolute path of the source file;
- the recovery draft text;
- a local revision number;
- the time the recovery record was updated; and
- a compact fingerprint of the last persisted content, used only to notice possible external edits.

Recovery text is not stored in the writing project, transmitted, or used for telemetry. A record is removed after its revision is confirmed saved, when it already exactly matches the file, or when the writer explicitly chooses to keep the file instead.

If the app finds a recovery draft that differs from the source file, it asks whether to recover the draft, keep the source file, or cancel opening it. If the source also appears to have changed since recovery began, the prompt says so rather than choosing one version automatically.

Recovery is a last line of defense, not a backup system. Writers should still back up their project folders normally.

## Daily progress

The app-data directory also contains `daily-progress.json`. It stores versioned word-credit counters by selected project identity and local calendar date, without manuscript text. Valid world projects use their stable manifest UUID, so a move does not split their local history; ordinary folders remain path-identified. Its schema, privacy boundaries, and date behavior are documented in [`DAILY_PROGRESS.md`](DAILY_PROGRESS.md).

## Backup boundary

Backing up an entire world-project folder protects the creative files, project manifest, optional manuscript structure, structured-note metadata, and writer-owned assets in that folder. It does not include `settings.json`, `workspace.json`, `.persisted-scope`, `daily-progress.json`, or `recovery.json`. In particular, recovery drafts are temporary local safety copies and must not be treated as version history or the only copy of writing.

See [`BACKUP_AND_PORTABILITY.md`](BACKUP_AND_PORTABILITY.md) for move, copy, and restore guidance.
