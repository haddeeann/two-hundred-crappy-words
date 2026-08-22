# Proposed portable manuscript structure

Status: **approved on 2026-08-22; parsing, reconciliation, read-only outline, and guarded initial creation/import are implemented**

This document proposes the smallest portable model that can order chapters and scenes, hold planning metadata, and compile a long manuscript without turning prose into an app-owned format. Existing projects, manifests, and Markdown files must remain byte-for-byte unchanged until the writer explicitly opts in after this proposal is approved.

## Recommendation

Use one visible project-root file named `200-crappy-words.manuscripts.json` as the source of truth for manuscript order and compact outline metadata. Keep prose in ordinary project-relative Markdown scene files. A chapter may correspond to a normal folder containing an optional `chapter.md` overview plus its scene files.

Do not store order numbers or parent IDs in every Markdown file. Reordering should normally change one small structure file, not rewrite a run of scenes. Do not add manuscript order to `200-crappy-words.project.json`; project identity and folder roles should not churn whenever a scene moves.

The structure file may describe more than one book in a shared world project. Creating it is an explicit opt-in action with a full preview and create-new protection. Opening a folder never creates or repairs it.

## Why this boundary

| Option | Benefit | Cost | Recommendation |
| --- | --- | --- | --- |
| One visible structure file | One obvious order, small reorder diffs, prose remains untouched, multiple books can share a world | The file can conflict if two tools reorder it at once | Use this as the source of truth |
| Order in scene/chapter frontmatter | Structure travels with each file | Reordering rewrites many creative files, creates noisy version-control diffs, and can leave duplicate or gapped positions | Do not use for order |
| Filename or folder sorting | Works in every file browser | Renames become structural edits, numbering leaks into titles, and nested alternatives become brittle | Import hint only, never source of truth |
| App-local database | Fast and private | Does not travel with the project or survive restoring only the writing folder | Do not use for portable structure |

## Proposed version-one shape

```json
{
  "formatVersion": 1,
  "manuscripts": [
    {
      "id": "7339b0ee-5f87-493d-bcad-e56636d7cb26",
      "title": "The Patient Comet",
      "items": [
        {
          "id": "422b34ce-2d0f-4916-a557-553fc95db31b",
          "kind": "chapter",
          "title": "Signals in the Dust",
          "synopsis": "Mara receives the first impossible transmission.",
          "status": "draft",
          "targetWords": 2400,
          "folder": "Manuscript/01 Signals in the Dust",
          "overview": {
            "path": "Manuscript/01 Signals in the Dust/chapter.md",
            "noteId": "2792befd-5380-4815-9a25-e2659aa9c79f"
          },
          "children": [
            {
              "id": "6eea7c60-8e12-4b9a-9716-f31cd3450eb3",
              "kind": "scene",
              "title": "The buried antenna",
              "pov": "Mara Venn",
              "location": "Aster Vale",
              "storyDate": "Orbit 41, ash season",
              "labels": ["opening", "mystery"],
              "notes": "Keep the sender uncertain.",
              "source": {
                "path": "Manuscript/01 Signals in the Dust/01 buried-antenna.md",
                "noteId": "b94fc398-9156-46d2-a48b-93e3c40ee638"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### File-level fields

- `formatVersion`: required positive integer; version 1 is the only version this milestone may write.
- `manuscripts`: required array, bounded to 32 entries.
- Unknown fields in a supported version are preserved by guarded edits. They are never assigned behavior accidentally.

### Manuscript fields

- `id`: required canonical lowercase UUID v4 generated locally.
- `title`: required trimmed display string, at most 120 Unicode code points and free of control characters.
- `items`: required ordered array of chapter or loose-scene items.

### Outline item fields

- `id`: required canonical lowercase UUID v4 for the outline item. It remains stable across reorder and source repair.
- `kind`: required `chapter` or `scene`.
- `title`: required display title. It belongs to the outline and may differ from a filename or Markdown heading.
- `folder`: optional normalized project-relative chapter directory. It makes the writer's filesystem organization visible but does not determine scene order.
- `overview`: optional contained Markdown file, conventionally `chapter.md`, for the chapter's synopsis, freeform notes, reminders, or any other writer-owned overview. It is not manuscript prose and is excluded from compile by default.
- `source`: required contained Markdown prose source for a scene. A one-file chapter may use `source` only when it has no child scenes.
- `children`: optional ordered scene array on a chapter. Version 1 forbids children on scenes and nested chapters.
- `synopsis`, `pov`, `location`, `storyDate`, `status`, and `notes`: optional bounded display strings. Version 1 does not interpret them as dates, lore relationships, or workflow rules.
- `labels`: optional ordered set of at most 32 non-empty display strings.
- `targetWords`: optional whole number from 1 through 10,000,000. It is a structural target, separate from the app-local daily-practice goal.
- `includeInCompile`: optional boolean, defaulting to `true`.

The whole file is bounded to 10,000 outline items and 10 MiB, with at most 32 manuscripts. Titles contain at most 120 Unicode code points; POV, location, story date, and status contain at most 240. Synopsis and notes fields contain at most 10,000 code points. Each item has at most 32 distinct labels of at most 120 code points each, and a structural word target is a whole number from 1 through 10,000,000. Validation reports at most 100 specific issues plus one bounded omission notice. Duplicate manuscript IDs, duplicate item IDs, repeated source paths or note IDs, unsupported nesting, invalid strings, or limit overflow disable structural mutation and compile, but ordinary file editing remains available.

## Markdown ownership and identity

The JSON file owns order, grouping, outline titles, and compact fields the outline needs to sort, filter, and summarize. Markdown scene files own prose. An optional chapter overview file owns the writer's freeform chapter notes.

No new Markdown frontmatter key is required for version 1. Existing structured notes may keep the already approved `id`, `type`, `title`, and `aliases` fields. A source binding contains:

- `path`: required normalized project-relative `.md` path;
- `noteId`: optional stable note UUID copied from valid structured frontmatter.

For a path-only source, the path is the binding. If it moves externally, the item becomes missing until the writer chooses a replacement; the app must not guess by filename or content.

When `noteId` is present, the unique contained Markdown note with that ID establishes identity. If its recorded path changes, the app may offer an exact path repair preview. A missing or duplicate ID is an explicit conflict. The app never silently edits the JSON or the Markdown merely because a likely match exists.

This allows an existing ordinary Markdown file to join an outline without being rewritten. Newly created scene and chapter-overview files may use the existing structured-note ID so later in-app renames remain repairable.

## Multiple books and loose scenes

A shared world may contain multiple manuscript records. Their IDs and item orders are independent.

A top-level scene is allowed as a loose or unassigned scene. Moving it into a chapter changes only the ordered JSON tree; moving the physical file is a separate, explicit operation. A chapter may be:

- a folder-backed container with an optional `chapter.md` overview and ordered scene children;
- a logical container with scene children but no matching filesystem folder or overview; or
- a conventional one-file chapter with a prose `source` and no child scenes.

Version 1 forbids a chapter from having both its own prose `source` and child-scene prose. Converting a one-file chapter into scenes is an explicit, previewed operation that preserves the original prose as a scene before the chapter becomes a container. A `chapter.md` overview remains notes rather than hidden manuscript prose; if material should appear in the novel, the writer makes it a scene.

The recommended on-disk experience is ordinary and optional:

```text
Manuscript/
└── 01 Signals in the Dust/
    ├── chapter.md                 # optional overview and quick notes
    ├── 01 buried-antenna.md       # scene prose
    ├── 02 the-signal-answers.md   # scene prose
    └── 03 abandon-the-relay.md    # scene prose
```

The app may offer this layout when creating a chapter, but it never requires an existing writer to reorganize files into it. The central structure, not alphabetical filenames, remains the authority for chapter and scene order.

## Loading and failure behavior

| State | Required behavior |
| --- | --- |
| File absent | Keep every existing editor feature; show an explicit **Create manuscript structure** action only where appropriate. |
| Valid version 1 | Load the outline and revalidate every source within the selected root. |
| Malformed JSON or invalid required field | Keep ordinary editing available, explain the exact structural error, and do not rewrite the file. |
| Newer version | Keep ordinary editing available, show read-only format information, and do not downgrade or normalize it. |
| Missing path-only source | Keep the item visible as missing and require an explicit replacement or removal. |
| Unique `noteId` at a new path | Offer a previewed path repair; never repair on open. |
| Missing or duplicate `noteId` | Mark the source ambiguous or unavailable and disable operations that would need its prose. |
| Symbolic link, escaped path, non-file, or non-Markdown source | Refuse it as a manuscript source without broadening picker-granted access. |
| Externally changed structure file | Preserve the writer's pending intent, reload only after confirmation, and never overwrite the external version automatically. |

Invalid structure must not disable the safe editor, daily practice, recovery, file tree, or connected lore. The last known derived outline may remain visible only if it is clearly marked stale and cannot be mutated or compiled as though current.

## Safe creation and mutation

Creating `200-crappy-words.manuscripts.json` requires:

1. an explicit action;
2. a preview of the chosen manuscript title and imported source order;
3. a final stable read of every imported source;
4. atomic create-new behavior for the structure file; and
5. no Markdown rewrite.

Every later structural mutation must:

1. parse and validate the last known structure;
2. retain its exact source fingerprint;
3. preview the semantic change in human terms;
4. reread and compare before writing;
5. preserve unknown supported-version fields and unaffected ordering;
6. write a complete validated replacement atomically; and
7. reread the result before reporting success.

A reorder changes only the structure file. After a successful in-session reorder, Undo may write the exact inverse only if the file still matches the app's just-written fingerprint. Undo is not persisted and is not a substitute for project backup or version control.

Split and merge are later multi-file transactions. They must preview new and changed paths, use create-new writes for destinations, guard every existing source, update structure only after prose writes succeed, and exactly roll back completed steps on failure. If the implementation cannot prove that boundary on a filesystem, it must refuse the operation rather than risk partial loss.

## Deterministic compile contract

Compile order is a pre-order traversal of the selected manuscript's visible JSON order:

1. visit each top-level item in array order;
2. for an included one-file chapter, emit its prose source;
3. for an included chapter container, emit its generated chapter heading but not its optional overview notes;
4. visit that chapter's child scene sources in array order; and
5. omit an item only when `includeInCompile` is explicitly `false`.

Before export, the app stable-reads the structure and every included source. A missing, changed, ambiguous, symbolic-link, oversized, or unreadable source blocks export by default and appears in a complete report. A later UI may let the writer explicitly export with named omissions, but it must never skip material silently.

Source reconciliation reads at most 10 MiB from one overview or prose file and 100 MiB across one complete refresh. Both limits are local read-safety boundaries rather than manuscript-format restrictions: an oversized source remains an ordinary editable file but is visibly unavailable to structural counts and compile until the writer reduces it or a later reviewed limit changes. Every accepted source retains a content fingerprint; changing during either of two read attempts produces an explicit unstable state.

The first output adapters are Markdown and plain text. They write only to a writer-chosen destination, use create-new protection unless overwrite is separately confirmed, and never modify source files or structure. Markdown compilation removes only a valid leading structured-note frontmatter block, preserves each remaining Markdown body, and inserts deterministic separators. Plain-text rendering follows the same traversal and must receive its own tested Markdown-to-text rules before implementation. DOCX and PDF remain later adapters behind their separate layout decision gate; neither becomes a prose store.

## Privacy, backup, and compatibility

- The structure file contains writer-authored titles, synopses, notes, and project-relative paths, so it is creative project data and travels with project backups.
- It contains no absolute path, username, device state, daily history, recovery text, account, telemetry, or permission grant.
- The app creates no app-local manuscript cache containing prose. Derived outline state remains in memory.
- No network access is introduced.
- Version-one `200-crappy-words.project.json` remains unchanged; the new file has its own version and migration policy.
- Ordinary folders and projects without the structure file retain all current behavior.

## Approved decision

The user approved these choices on 2026-08-22:

1. Use one visible `200-crappy-words.manuscripts.json` file as the source of order and compact outline metadata.
2. Keep prose in Markdown and avoid new required frontmatter; bind existing files by path with an optional stable note ID.
3. Treat a chapter primarily as a folder or logical container with an optional `chapter.md` overview and separate scene files; allow one-file chapters only when they have no child scenes.
4. Treat POV, location, story date, status, and labels as display metadata for now rather than pretending they already have continuity semantics.
5. Make structural edits previewed, compare-before-write, atomic, and undoable only while the just-written structure remains unchanged.
6. Compile in deterministic pre-order, block on unresolved sources by default, and treat Markdown/plain text as output adapters rather than source formats.
