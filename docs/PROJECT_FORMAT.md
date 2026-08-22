# World project format

Status: **APPROVED** on 2026-08-21

This document defines the approved first portable project format for 200 Crappy Words. The app validates and recognizes this format without writing on folder open, and creates it only through an explicit confirmed project-creation or adoption action.

## Design goals

The format should:

- leave prose and lore as ordinary Markdown or plain-text files;
- let an opted-in project keep its identity after the folder moves;
- remain understandable and editable without 200 Crappy Words;
- add only metadata that genuinely needs to travel with the creative work;
- keep machine-specific, private, or temporary state out of the project;
- never be created during an ordinary **Open Folder** flow;
- never overwrite an existing path during creation or adoption; and
- fail open for creative files: a manifest problem must not prevent ordinary text editing.

## Current behavior that must remain true

The existing app establishes these compatibility constraints:

- A folder chosen through the native picker receives recursive runtime filesystem scope; the app has no static whole-filesystem grant.
- Any folder can be opened and edited without project metadata.
- The last folder and persisted permission scopes live in Tauri's app-data directory.
- Daily goals, progress, completion records, and correction audits are app-local and currently keyed by an absolute folder path.
- Recovery drafts are app-local and keyed by the absolute source-file path because they protect a particular disk revision.
- Tree expansion, selected directory, and active document are remembered app-locally as safe project-relative paths. Cursor and scroll state remain in memory only.
- File creation validates portable names and uses create-new semantics so a stale view cannot truncate an existing file.
- Source writes compare against the last known disk content and require an explicit choice before replacing an external change or recreating a missing path.

An optional world project must build on these rules rather than weakening them.

## Proposed manifest

### File name

`200-crappy-words.project.json`

The file is visible, product-specific, portable across the supported desktop filesystems, and clearly metadata rather than prose. A single root file is easier to inspect and back up than a hidden application directory.

### Version 1 example

```json
{
  "format": "200-crappy-words/world-project",
  "formatVersion": 1,
  "projectId": "7848b5c8-4b08-4bc2-912e-c74c7ec8b001",
  "name": "A Quiet Red Planet",
  "folders": {
    "manuscript": "Manuscript",
    "characters": "Characters",
    "locations": "Locations",
    "factions": "Factions",
    "species": "Species",
    "technology": "Technology",
    "timeline": "Timeline",
    "research": "Research",
    "inbox": "Inbox"
  }
}
```

### Fields

- `format`: Required exact discriminator. It prevents an unrelated JSON file with a similar name from being mistaken for an app-owned manifest.
- `formatVersion`: Required positive integer. Version 1 is the only version this milestone would write.
- `projectId`: Required canonical lowercase UUID v4. It is an opaque local identifier, not a secret, account identifier, or tracking token. The app generates it locally.
- `name`: Required display name after trimming. It may contain Unicode, but not control characters, and should be limited to 120 Unicode code points. Renaming it does not rename the folder or change project identity.
- `folders`: Required object that maps recognized semantic roles to portable project-relative directory paths. It may be empty. An omitted role means the project has no preferred folder for that role; it does not make content elsewhere invalid.

Version 1 recognizes these folder roles:

- `manuscript`
- `characters`
- `locations`
- `factions`
- `species`
- `technology`
- `timeline`
- `research`
- `inbox`

Folder values use `/` as the manifest separator. They must be relative, non-empty, remain inside the project root after normalization, contain no `.` or `..` segment, and use segments accepted by the existing portable-name validation. A role target must be a real directory rather than a symbolic link when the app creates content through that role.

The app may tolerate and preserve unknown fields in a supported manifest version, but it must not assign behavior to them without a later format decision. The app must never silently rewrite a manifest merely to reorder or normalize it.

### Deliberately absent fields

Version 1 does not store timestamps, absolute paths, usernames, device names, recent files, cursor positions, daily history, recovery text, indexes, caches, or telemetry.

It also does not store the daily goal. The goal is a personal practice preference and remains beside daily history in private app-local data. This avoids changing a version-controlled creative project every time a writer adjusts their current routine.

## Portable and app-local boundaries

| Travels with the folder | Remains in app-local data |
| --- | --- |
| Project ID and display name | Last-known absolute project location |
| Project format version | Native-picker persisted permission scope |
| Preferred semantic folder mapping | Recent projects and last-opened project |
| Markdown files and their opted-in frontmatter | Active file, selection, expansion, cursor, and scroll state |
| Writer-owned images and other project assets | Daily goal, totals, completion, streak, and correction audit |
| Future explicitly approved portable project settings | Recovery drafts and source fingerprints |
| | Search index, thumbnails, caches, and derived continuity data |

Backing up the project folder therefore protects the creative work, manifest, and note metadata. It does not currently back up private daily-practice history or unsaved recovery drafts; product documentation must say this plainly.

## Ordinary folders and adoption

**Open Folder** keeps its current meaning. If the manifest is absent, the folder opens as an ordinary folder and nothing is written merely because it was opened.

Adoption is a separate explicit action with a preview. It may create the manifest only after confirmation and must use create-new semantics. If `200-crappy-words.project.json` already exists, adoption must never replace it.

Suggested folders are also opt-in. For each selected folder role:

- an absent directory may be created;
- an existing directory is reused without changing its contents;
- an existing non-directory at that path is a visible conflict; and
- one conflict must not cause unrelated existing material to be deleted or overwritten.

The safest implementation is a preflight that identifies every collision before the first write. If a later write still fails, the app reports exactly what it created and leaves all pre-existing material unchanged.

## Opening and validation behavior

| Manifest state | Required behavior |
| --- | --- |
| Absent | Open as an ordinary folder with all existing editor features. |
| Valid version 1 | Open as a world project and use its stable project ID and folder roles. |
| Malformed JSON or invalid required fields | Keep ordinary file editing available, disable structured project features, explain the manifest error, and do not rewrite it. |
| Version newer than supported | Keep ordinary file editing available, explain that the project was created by a newer app, and do not rewrite it. |
| Older supported version in a future release | Offer an explicit migration; never migrate merely by opening. |
| Missing mapped directory | Warn and let the writer repair the mapping or create the directory; do not recreate it silently on open. |
| Mapped symlink or path escaping the root | Reject that role for app-created content while leaving ordinary reading subject to the existing selected-folder scope. |

Manifest creation, settings changes, and future migrations are guarded metadata writes. They must compare against the last read version, write a validated replacement atomically, and preserve the prior valid manifest if the operation fails.

## Stable identity, moves, and copies

For an ordinary folder, app-local practice data continues to use the absolute path as its identity.

For a valid world project, app-local stores use a namespaced key derived from `projectId`, not the folder path. A local registry remembers the last-known path separately.

When a folder is first adopted, existing path-keyed daily goal and progress data should be copied to the project-ID key after the manifest is safely created. The legacy path-keyed records remain temporarily available for rollback; migration must not delete the only copy.

When the same project ID appears at a new path, the implemented opening flow follows these rules:

- if the previous path no longer exists or is inaccessible, treat it as a move and update only the app-local last-known path;
- if the previous path still exists, treat it as a possible copy and ask whether this is the same project or an independent project;
- choosing an independent project creates a new ID only after explicit confirmation and a guarded manifest write; and
- declining the choice still permits ordinary file editing without merging local state.

The independent-copy update changes only `projectId`, preserves unknown version-one JSON fields, compares the source against the version just read before writing, and rereads the result as a valid supported manifest. No copy decision is made merely because a project is opened at its already remembered path.

Recovery drafts remain path-specific. The app must not blindly attach a draft from an old absolute file path to a similarly named file after a project move.

## Future manifest migration policy

The version number governs the whole manifest. A future migration must:

1. parse and validate the old supported version without modifying it;
2. explain material changes and request confirmation;
3. preserve unknown data that remains valid;
4. create a recoverable copy of the prior manifest;
5. write and reread the replacement atomically; and
6. leave the project usable as ordinary files if migration is declined or fails.

Changing the meaning of existing fields, generating a new project ID, or adding required frontmatter is another permanent-format decision gate—not a routine migration.

## Structured Markdown frontmatter

Markdown remains valid without frontmatter. Adoption never inserts metadata into existing notes. App-created structured notes may opt in to a deliberately small YAML 1.2 frontmatter block:

```markdown
---
id: "c6d5ba63-e70e-4618-9da8-6da077839f22"
type: "character"
title: "Mara Venn"
---

# Mara Venn
```

Version 1 reserves three scalar keys for app-created structured notes:

- `id`: Canonical lowercase UUID v4 generated locally. It gives a note stable identity across an in-app rename or move.
- `type`: Lowercase kebab-case note kind. Initial templates use `character`, `location`, `faction`, `species`, `technology`, `spacecraft`, `event`, `scene`, or `chapter`. Unknown values do not make the Markdown uneditable.
- `title`: Human-facing title. It does not have to equal the filename.

No field is required for ordinary Markdown. Missing, invalid, duplicated, or unsupported structured metadata produces a non-destructive warning and disables only the feature that needs it. The app does not repair or normalize frontmatter on open.

The supported subset forbids executable/custom YAML tags and aliases. Later structured editors must preserve unknown keys and the Markdown body, use the same guarded-write protections as prose, and never rewrite frontmatter merely because a file was viewed.

Canon status, dates, relationships, scene metadata, and other typed properties are intentionally deferred until the milestone that uses them can define their semantics. Template prompts belong in the Markdown body and remain easy to delete.

## Security and privacy review

- All IDs are generated locally and are not transmitted.
- The manifest grants no filesystem access; the native picker remains the authorization boundary.
- Relative folder mappings are validated before joining and cannot expand the selected scope.
- No creative text is copied into app-local indexes by this format proposal.
- No network, account, telemetry, shell, or external-URL capability is introduced.
- JSON and safe-subset YAML are data only. They must never be evaluated as code.

## Approved decision

The milestone 0.4 decision gate approved this combination on 2026-08-21:

1. one visible root manifest named `200-crappy-words.project.json`;
2. JSON version 1 containing a local UUID, display name, and optional semantic folder roles;
3. personal practice and machine state remaining app-local;
4. ordinary folders remaining fully supported and never auto-adopted; and
5. optional YAML frontmatter limited initially to `id`, `type`, and `title` on newly created structured Markdown notes.

Version 1 manifest handling, explicit project creation/adoption, the nine initial structured-note templates, app-local recent/navigation state, and explicit copy resolution implement this decision. Template creation writes a new `.md` file atomically, includes only the three approved fields, and leaves all prompts in removable Markdown-body comments. Existing Markdown is never given frontmatter merely because it was opened.
