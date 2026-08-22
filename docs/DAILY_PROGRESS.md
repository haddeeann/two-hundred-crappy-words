# Daily progress data

Daily writing progress is local, project-scoped, and separate from manuscript files. The app does not need an account or network connection to count or restore today's words.

## Storage

Tauri stores `daily-progress.json` in the app-data directory for application identifier `com.pat.two-hundred-crappy-words`. The store is versioned and contains, for each explicitly selected project folder and local calendar date:

- the project identity: an absolute folder path for an ordinary folder or a namespaced stable UUID for a valid world project;
- a local `YYYY-MM-DD` date key;
- credited words for that project and date;
- an update timestamp; and
- a monotonic revision used to reject stale writes;
- an optional completion timestamp so the quiet completion status occurs only once for that date; and
- the daily goal at the time of the most recent update, when available; and
- for completed days, the goal that was actually reached, so a later goal change does not produce a contradictory history row.

A corrected record also contains an append-only list of its previous total, corrected total, and correction timestamp. Correction history contains counters and timestamps only; it does not contain creative text.

The same file stores an optional whole-number goal for each selected project. The default remains 200 words. Goals must be from 1 through 100,000 words; the upper bound prevents accidental or corrupted values while leaving ample room for unusual practices.

It does **not** contain manuscript text, recovery drafts, individual keystrokes, or telemetry. Creative files remain ordinary files in the selected project folder.

An ordinary folder continues to use its absolute path as a deliberately local identity. Renaming or moving an ordinary folder therefore starts a new local progress identity; the old history remains in the ledger and is not silently reassigned.

A folder with a valid approved world-project manifest uses `project:<projectId>` as its app-local storage key. The UUID travels in the manifest, while daily history remains private in app data. After explicit adoption safely creates the manifest, the app copies existing path-keyed practice data to the stable identity and retains the legacy records as a rollback fallback rather than deleting the only copy. The copy is safe to retry and does not replace records already present under the stable identity.

## Date and clock behavior

The app derives the active key from the computer's current local calendar components rather than slicing a UTC timestamp. It checks the date while editing and periodically while open.

At local midnight, new edits accrue to the new date. If the system clock or time zone changes to a date already present in the ledger, that date's existing total is restored. Entries are never retroactively moved between dates merely because the time zone changed. Later milestone work will add an explicit, audit-friendly correction path.

## Credit and restart behavior

The word-credit rules are documented in [`WORD_COUNTING.md`](WORD_COUNTING.md). Opening, switching, restarting, or recovering a document establishes a word-count baseline and does not re-credit existing prose. Only positive changes from active editor input add to today's total.

Progress writes are debounced briefly, serialized by project and date, and flushed during safe navigation and normal window closing. A persistence failure never blocks manuscript saving; the app displays a separate warning that the writing is safe but progress could not be stored.

Records are retained for history and streak views. History shows recorded dates rather than manufacturing zero-word entries for missing dates. A completion remains earned after a later target change; consecutive completed local dates form a rhythm, and yesterday's rhythm remains current while today is still open. No automatic pruning or remote synchronization occurs in this milestone. Schema migration and user-facing correction/export behavior must be defined before the ledger format changes incompatibly.

## Corrections

The history panel allows a recorded total to be replaced with a non-negative whole number. The original and corrected values remain in the local audit list. A correction below the goal removes that date's completion; a correction to or above the goal records completion without replaying the inline celebration. Correcting today's total also establishes the new in-session baseline, so the open document is not counted again.
