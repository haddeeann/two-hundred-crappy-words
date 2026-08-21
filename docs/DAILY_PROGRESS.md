# Daily progress data

Daily writing progress is local, project-scoped, and separate from manuscript files. The app does not need an account or network connection to count or restore today's words.

## Storage

Tauri stores `daily-progress.json` in the app-data directory for application identifier `com.pat.two-hundred-crappy-words`. The store is versioned and contains, for each explicitly selected project folder and local calendar date:

- the absolute project-folder path used as the current local project identity;
- a local `YYYY-MM-DD` date key;
- credited words for that project and date;
- an update timestamp; and
- a monotonic revision used to reject stale writes.

It does **not** contain manuscript text, recovery drafts, individual keystrokes, or telemetry. Creative files remain ordinary files in the selected project folder.

The absolute folder path is a deliberately local identity until milestone 0.4 introduces an optional portable world-project format. Renaming or moving a folder therefore starts a new local progress identity; the old history remains in the ledger and is not silently reassigned.

## Date and clock behavior

The app derives the active key from the computer's current local calendar components rather than slicing a UTC timestamp. It checks the date while editing and periodically while open.

At local midnight, new edits accrue to the new date. If the system clock or time zone changes to a date already present in the ledger, that date's existing total is restored. Entries are never retroactively moved between dates merely because the time zone changed. Later milestone work will add an explicit, audit-friendly correction path.

## Credit and restart behavior

The word-credit rules are documented in [`WORD_COUNTING.md`](WORD_COUNTING.md). Opening, switching, restarting, or recovering a document establishes a word-count baseline and does not re-credit existing prose. Only positive changes from active editor input add to today's total.

Progress writes are debounced briefly, serialized by project and date, and flushed during safe navigation and normal window closing. A persistence failure never blocks manuscript saving; the app displays a separate warning that the writing is safe but progress could not be stored.

Records are retained for future history and streak views. No automatic pruning or remote synchronization occurs in this milestone. Schema migration and user-facing correction/export behavior must be defined before the ledger format changes incompatibly.
