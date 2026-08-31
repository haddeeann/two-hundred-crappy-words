# Backup and portability

200 Crappy Words keeps creative projects as ordinary folders. A backup tool can copy that folder without understanding the app, and another text editor can open the writing directly.

## What to back up

Back up the entire project folder, not only the manuscript subfolder. For a world project this includes:

- `200-crappy-words.project.json`, which carries the world's stable ID, name, format version, and preferred folder roles;
- Markdown and plain-text manuscript and lore files;
- the three-field frontmatter on app-created structured notes; and
- images, maps, research files, and other assets the writer placed in the project.

The manifest contains no prose, account credential, absolute path, daily history, or recovery text. It is still part of the project and should travel with it.

## What stays on one Mac

The app's data directory contains personal or machine-specific state that is deliberately absent from project backups:

- daily goals, credited totals, completion records, rhythms, and correction audits;
- recent locations, the last opened folder, selected directory, expanded folders, and active file;
- native-picker permission scopes; and
- temporary unsaved recovery drafts and source fingerprints.

Those records are private and are not transmitted by the app. A project-folder backup therefore protects the creative work but not the writing-practice history or an unsaved recovery draft. Recovery is a last line of defense, not a backup or version-control system.

## Moving a world project

Move the whole folder, then choose **File → Open Folder…** and select its new location. The UUID in the manifest reconnects app-local goals, history, recent-project identity, and safe project-relative navigation. The recent list updates its last-known location rather than adding a duplicate.

Recovery drafts are intentionally keyed to the old absolute source path. A moved file never inherits a draft merely because its relative name matches; this avoids applying old unsaved text to the wrong disk revision.

An ordinary folder has no portable UUID. Moving it changes its app-local identity, so previous daily history may not appear until the folder is adopted as a world project.

## Copying a world project

A raw filesystem copy initially contains the same project ID as its source. If the app can still access the previous location, opening the copy asks for one of three explicit choices:

- **Same project** treats both locations as one world and updates the app-local last-known path.
- **Make independent** assigns the opened copy a fresh local UUID through a compare-before-write manifest update. The original is untouched, unknown version-one manifest fields are preserved, and the copy starts independent app-local practice history.
- **Open as folder** leaves the manifest untouched and edits the copy as an ordinary path-identified folder without merging project history.

If the prior location is gone or inaccessible, the new location is treated as a move and the manifest is not rewritten.

Do not open and actively edit two locations that intentionally represent the same world at once. 200 Crappy Words is local-first but does not yet provide synchronization, merge, or conflict resolution between project copies.

## Restoring a backup

Restore the complete folder anywhere accessible, then select it with **Open Folder**. Creative files and world identity travel with the backup. App-local daily history and recovery drafts return only if the corresponding app-data directory was also backed up and restored by the operating system or another backup tool.
