# Ministry of Elsewhere privacy statement

Effective: 2026-10-12

Ministry of Elsewhere is a local-first writing application. Its core writing,
worldbuilding, search, continuity, planning, and export features run on the Mac. The
application does not require an account and does not send manuscript text, lore,
usage analytics, crash reports, or diagnostic files to Yellow Umbrella, 13 Squirrels
Studio, OpenAI, or another service.

## What the app reads and writes

The app reads and writes only folders and save locations the writer chooses through
native macOS dialogs. Project folders contain ordinary writing files and any visible,
documented Ministry project metadata. The writer controls those folders and their
backups.

The app also keeps private state in macOS Application Support. This can include the
last opened folder, recent locations, view state, daily goals and credited totals,
an optional writing challenge, temporary unsaved recovery drafts, and persisted
access to folders previously chosen by the writer. The exact current location is:

`~/Library/Application Support/com.pat.two-hundred-crappy-words/`

The historical identifier is intentionally retained during development so an update
does not hide existing local data. It must be migrated before a public publisher
identifier replaces it.

## Network, analytics, and crash reporting

The packaged application's content security policy blocks remote application scripts
and origins. The core app has no analytics SDK, advertising SDK, account service,
automatic updater, cloud sync, or automatic crash uploader. macOS itself, a download
host, a backup provider, or another tool the writer chooses may have separate privacy
practices outside Ministry's control.

## Diagnostics and support

**Help → Export Content-Free Diagnostics…** creates a reviewable local JSON file only
after the writer asks. It contains app/runtime versions and coarse state labels. It
excludes creative text, filenames, paths, project names and IDs, practice totals,
recovery text, permission scopes, and logs. The app never uploads that file. A writer
may choose to attach it to a support request after reviewing it.

## Deletion and retention

Project files remain until the writer moves or deletes them. Removing Ministry of
Elsewhere does not remove project folders. App-local state remains until the writer
removes the Application Support directory; temporary recovery records are also
removed automatically after the corresponding revision is confirmed saved or
discarded through the recovery flow. Ministry has no server-side account or stored
copy to delete.

## Future changes

Optional AI, cloud sync, automatic updates, analytics, or crash upload would create a
new network and consent boundary. None is enabled now. Any future addition must be
documented and presented as an explicit choice before data is transmitted.

Implementation details and backup boundaries are documented in
[`docs/DATA_AND_RECOVERY.md`](docs/DATA_AND_RECOVERY.md) and
[`docs/SECURITY_AND_PERMISSIONS.md`](docs/SECURITY_AND_PERMISSIONS.md).
