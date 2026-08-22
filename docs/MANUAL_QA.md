# Manual desktop QA

This checklist uses disposable files and is the human checkpoint for milestone 0.2. Automated tests cover the underlying state and race behavior; these steps confirm the macOS window, native dialogs, focus, and filesystem integration.

## Latest result

Completed successfully on macOS on 2026-08-19. The run covered nested creation and editing, autosave during navigation, external-change protection and explicit overwrite, moved and read-only files, safe close after write failure, forced-interruption recovery, stale-recovery cleanup, selected-folder restoration, whole-folder removal, native window behavior, keyboard traversal, focus visibility, and visual legibility.

The run found that the native picker initially granted only one directory level. Commit `1c20728` requests recursive scope for the explicitly selected project folder and adds a regression test; nested files were reopened successfully after the fix. No known ordinary interaction in this walkthrough silently lost text.

## Milestone 0.3 combined checkpoint

Completed successfully on macOS on 2026-08-21 using Computer Use against a freshly packaged build and a disposable project. The run proved baseline protection, configurable goals, one-time completion, populated history, goal-change truthfulness, two restarts, no duplicate credit, validation, audited correction, non-decrementing daily credit, keyboard traversal, visible focus, and understandable accessibility labels.

QA found and fixed two issues before the final pass: keyboard activation of **Correct** did not move focus into its input, and a correction audit was dropped when later writing created the next ledger revision. The final rebuilt app passed Enter/Escape behavior and retained both `5 / 5` and `Corrected once` after restart.

Create a fresh project identity in Terminal so no earlier daily ledger can affect the result:

```sh
daily_qa_dir="$(mktemp -d /tmp/two-hundred-crappy-words-daily-qa.XXXXXX)"
printf 'Existing words are only a baseline.\n' > "$daily_qa_dir/practice.txt"
echo "$daily_qa_dir"
```

Open that folder in the development app, open `practice.txt`, and complete these steps:

1. Confirm the existing sentence appears but **Today** begins at `0 / 200`.
2. Choose **Goal**, enter `5`, and press Enter. Confirm the footer becomes `Today · 0 / 5` and the progress bar remains empty.
3. Append `Persistence crosses the silent dark.` Confirm the document count rises by five, Today becomes `5 / 5`, and `Daily goal reached. Nicely done.` appears without a modal, motion, sound, or focus change.
4. Expand **Writing history**. Confirm today shows `5 / 5` with a check and the rhythm says `One day underway`. No missing dates should be invented.
5. Change the goal to `8`. Confirm the footer becomes `5 / 8`, the completion message clears, and history still truthfully shows the completed `5 / 5` goal. Change the goal back to `5`; the completion message must not replay.
6. Close the app normally, rerun `npm run tauri dev`, and confirm the folder, `Today · 5 / 5`, and the five-word goal restore. Reopening `practice.txt` must not add credit, and the completion message must not replay.
7. In Writing history choose **Correct** for today. Try `-1` first and confirm the inline validation refuses it without changing the total. Then save `3`. Confirm Today becomes `3 / 5`, the history check is removed, and `Corrected once` appears.
8. Append `Still listening.` Confirm those two active-edit words bring Today to `5 / 5` and the completion status appears. Delete those two words again; the document count should fall but Today must remain at five.
9. Close and relaunch once more. Confirm Today and goal restore, existing prose is not recounted, the completion message does not replay, and history retains both `5 / 5` and `Corrected once`.
10. Use Tab and Shift+Tab through the history disclosure, Correct, correction input, Save, and Cancel. Confirm focus is visible; Enter saves and Escape cancels. With VoiceOver if convenient, confirm the progress meter and reached check have understandable labels.

This checkpoint passed in full. Its steps remain below as a repeatable regression walkthrough.

## Milestone 0.4.2 existing-folder adoption checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against a freshly packaged build and a disposable ordinary folder. The form opened with its project name selected, exposed all nine suggested folders, supported Escape cancellation throughout the form, and allowed Research and Inbox to be omitted. Creation produced only the seven selected directories and a version 1 manifest, then immediately reloaded the folder under its display name and stable UUID identity. The existing file was unchanged; its 5-word goal and corrected Aug 21 history survived adoption and restart. A SHA-256 and modification-time comparison confirmed that reopening did not rewrite the manifest.

## Milestone 0.4.3 native project-creation checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against a freshly packaged build and a disposable parent folder. The accessible form collected separate display and portable folder names, rejected `../bad` before opening a picker, returned focus to the invalid field, cleared the error during correction, supported Escape, and allowed Research to be omitted. The native picker created and immediately opened “The Glass Meridian” with exactly eight selected folders and a valid version 1 manifest.

The run then created `Manuscript/chapter-one.md`, saved `Signals cross the glass meridian tonight.`, and recorded a `6 / 6` goal. After a normal close, the root folder was moved externally. Startup explained the missing remembered path without losing usability; selecting the moved folder restored the display name, manuscript, goal, and daily progress through the manifest UUID. The manifest SHA-256 remained unchanged across close, move, and reopen.

## Milestone 0.4.4 structured-note checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against a freshly packaged build and the moved “The Glass Meridian” project. The form exposed all nine template kinds, focused its title field, changed the suggested filename and semantic destination with the selected type, allowed Inbox to replace Spacecraft's Technology default, and created `Inbox/iss-penumbra.md` with create-new semantics. The note opened immediately with exactly `id`, `type`, and `title` frontmatter plus removable Markdown-body comments.

Opening the generated 74-word template did not add daily credit; the existing project remained `6 / 6`. Repeating creation with the same destination and filename produced a clear error, left the editor usable, and preserved the file's SHA-256. Validation returned focus to the title, Escape canceled from the form, and note-specific errors disappeared with the form rather than becoming stale global warnings.

## Milestone 0.4.5 recent-project and portability checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against a freshly packaged build and disposable “The Patient Comet” folders. The app showed a bounded recent-project disclosure with separate open and remove-shortcut controls, removed a stale shortcut without touching its files, and exposed concise in-app backup/privacy guidance. Tab and Shift+Tab reached the disclosure and its actions with visible focus.

The walkthrough expanded `Lore/Planets`, selected it, opened `velorum.md`, closed normally, and restored both branches, the selected destination, active file, content, and unchanged `0 / 200` daily baseline after restart. After the whole project root moved externally, startup marked its recent entry unavailable with clear Open Folder recovery. Reopening the new location restored the same relative navigation at the new absolute path, updated the single UUID-keyed recent entry, and did not rewrite the manifest.

Three live filesystem copies exercised every identity choice. **Same project** updated one last-known path without changing either manifest. **Make independent** generated a new UUID and a separate recent entry while preserving an unknown version-one test field and leaving the original unchanged. **Open as folder** displayed the copy as an ordinary path-identified folder, disabled structured-project behavior, kept local history separate, and left its manifest byte-for-byte unchanged. The final app-local `workspace.json` contained absolute recent locations but only project-relative navigation and no creative text. The full suite has 195 passing tests across twenty-four files; Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.

## Milestone 0.5.2 initial lore-index checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against a freshly packaged build and a disposable ordinary folder. The folder contained two eligible Markdown notes, a hidden Markdown file, a Markdown file beneath `node_modules`, a symbolic-link Markdown path, one resolved labeled link, and one broken note link. The app indexed exactly two notes, visibly explained all three exclusions, and reported `[[Missing Moon]]` at its one-based source line and column.

Editing the open chapter added `[[Mara#Unwritten history]]`. Before autosave completed, the lore status increased from four to five issues and reported the missing heading against the alias-resolved “Mara Venn” target while the editor still said Unsaved. Explicit refresh and subsequent autosave retained the correct derived state. Return expanded the disclosure and Tab moved visibly to **Refresh lore index**.

The first packaged attempt also proved the failure boundary: Tauri denied the newly used metadata call, the lore status showed per-file errors, and ordinary opening, editing, and saving remained available. The capability was narrowed to `fs:allow-stat`, whose paths remain constrained by the native picker; the rebuilt app passed. The final suite has 225 passing tests across thirty-one files, Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS app builds pass, and the measured 2,000-file/24.78 MiB fixture remained within every approved performance budget.

## Milestone 0.5.3 incremental-refresh checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against a freshly packaged build and the same disposable lore project. The first package deliberately exercised the fallback boundary: JavaScript permission was present but the Rust filesystem plugin lacked its optional watch implementation, so the app reported that automatic refresh was unavailable, retained the known-good index, and kept both editing and explicit refresh usable. Enabling the official plugin's `watch` feature corrected the package without broadening its native-picker path scope.

With monitoring active, an external heading edit plus note creation automatically changed the index from two to three notes and resolved both a broken note and broken heading. Moving the new note within the selected root retained three notes and title-based resolution; moving it outside the root returned to two notes and restored the broken-link issue. Hidden, dependency, and symbolic-link exclusions remained unchanged throughout.

The active chapter was then made read-only and edited in the app. Its unsaved `[[Overlay Survives]]` link appeared immediately in the derived index while autosave reported permission denied. A different external disk version triggered the existing guarded-write conflict, but reconciliation retained the unsaved overlay and its source issue. **Keep writing** preserved that draft; after restoring the disposable last-saved baseline, Command+S saved normally and the app closed without a prompt. No external event awarded daily credit by itself, no lore cache or metadata was written, and all external changes stayed beneath the selected disposable root.

## Milestone 0.5.4 completion and connections checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against a freshly packaged build and the disposable lore project. Replacing a broken target with the incomplete `[[Mar` opened a compact, visually inspected note popup without moving focus from the editor. The textarea exposed combobox/listbox semantics, the selected option and instructions were available through accessibility, Tab inserted `Mara Venn`, and typing `#Ear` switched to the uniquely resolved note's heading candidates. Enter inserted `Early life`; closing the writer-owned brackets immediately changed the unsaved note's connection surface to one resolved outgoing link.

The expanded surface showed the target title, heading, project-relative path, one-based source location, and bounded source context. Following it opened `Lore/mara.md` and selected the exact `Early life` heading. Its backlink surface then showed `Chapter One` plus source context; following that backlink returned to `chapter.md` and selected the exact wiki-link range. An immediate Command+Z after another completion restored `Mar`, proving accepted text remains in the native undo flow. The disposable chapter was restored byte-for-byte and saved cleanly after QA.

The completion model also has automated coverage for escaped, closed, labeled, multiline, nested, selected, heading, collision, Unicode-offset, deterministic-ranking, and exact-replacement cases. On the 2,000-note/24.78 MiB fixture, the first bounded completion query took 8.21 ms and a warm query averaged 3.13 ms against a 50 ms target. The full suite has 246 passing tests across thirty-five files, Svelte/TypeScript checks report zero errors and warnings, and frontend plus packaged macOS builds pass.

## Milestone 0.5.5 project-search checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against freshly packaged builds and the disposable lore project. Command+P opened a visually inspected modal quick opener, focused its search field, exposed dialog/combobox/listbox semantics, and showed a bounded title list with match reasons and project-relative paths. `Early` produced one explained heading result; Enter opened `Lore/mara.md` through guarded navigation and selected the exact `Early life` source range. `patient cartographer` produced the original-case prose line as context and selected the exact phrase. A no-match query showed a clear empty state, Escape restored the prior editor focus and selection, ArrowDown changed the accessible active option, Enter opened it, and every reopen began with an empty query.

The first packaged walkthrough found a focus race that HTML autofocus alone did not prevent after heading navigation: the next query briefly replaced the selected disposable heading. Command+Z immediately restored the unsaved text, Command+S confirmed the original file, and no source change was lost. The corrected component explicitly focuses its input after mount; the same reopen-and-type sequence then left prose and daily progress untouched. Final inspection confirmed the disposable Markdown remained unchanged.

Search ranking and source mapping are covered for titles, aliases, filenames, paths, headings, content, collisions, Unicode normalization, UTF-16 ranges, empty queries, query/result bounds, and stable ties. A first benchmark naively mapped every common prose match and took 3,255.16 ms, correctly failing the budget. Ranking before exact mapping reduced the same 2,000-note/24.78 MiB search to 5.94 ms cold; a warm selective search averaged 13.64 ms, both beneath 50 ms. The full suite has 250 passing tests across thirty-six files, Svelte/TypeScript checks report zero errors and warnings, and frontend plus packaged macOS builds pass.

## Milestone 0.5.6 side-reference checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against a freshly packaged build and the disposable lore project. With `protected draft` selected in `chapter.md`, Command+P plus `Early` and Shift+Enter opened `Lore/mara.md` in a visually inspected read-only split pane. The active file remained `chapter.md`; Escape closed the pane, returned focus to the editor, and accessibility inspection confirmed the exact original selection was still intact. The reference exposed its title, project-relative path, plain Markdown, close control, and explicit **Open in editor** action. That action alone replaced the active editor with the referenced note. The quick opener also cycled from search to Close and back with Tab.

An external edit appeared in the open reference automatically. Moving that source outside the selected project changed the pane to an explicit unavailable state instead of retaining stale text; restoring it recovered the verified source automatically. The QA-only line was then removed so `Lore/mara.md` returned to its baseline content.

The broken `[[Overlay Survives]]` connection offered **Create missing note…**. Its native confirmation named `Overlay Survives.md` and promised not to rewrite the source. Confirming created only a minimal `# Overlay Survives` note with create-new protection, raised the index from two to three notes, changed the connection from broken to resolved, and opened the new note beside the still-active manuscript. Direct filesystem inspection confirmed `chapter.md` was byte-for-byte unchanged. **Open in editor** then navigated explicitly to the created note and exposed the expected backlink. The disposable note was moved back outside the project afterward, returning the fixture to two notes and its original broken-link state.

Automated coverage exercises verified refresh, unavailable, symbolic-link, oversized, unreadable, and request-race states plus missing-note path planning and connection metadata. The full suite has 256 passing tests across thirty-eight files, Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.

## Milestone 0.5.7 mentions and safe-rename checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against freshly packaged builds and the disposable lore project. A plain `Mara Venn` sentence in `chapter.md` produced one **Unlinked mentions** suggestion with exact one-based source location, title-match reason, and bounded prose context. The existing `[[Lore/mara#Early life|Mara's chart]]` link did not produce another suggestion. Opening the suggestion displayed the verified Mara note beside the still-active chapter; the surface also stated that suggestions never change prose and exposed session-only dismissal.

The Mara reference's **Rename note…** action opened a keyboard-contained preview dialog, selected the current path, and initially refused the unchanged destination. Entering `Lore/mara-renamed.md` disclosed one exact edit in `chapter.md`: only `Lore/mara` would become `Lore/mara-renamed.md`; `#Early life` and `Mara's chart` remained untouched. Cancel left both files byte-stable. Confirm moved the note, updated only that wiki-link target, refreshed the expanded tree, index, connection, and open reference immediately, and left the daily total unchanged even though the mechanical path text changed the displayed document word count. Repeating the preview restored the original note and link paths through the same guarded flow.

For no-clobber failure QA, a symbolic link was placed at the previewed destination after the dialog opened. Confirmation temporarily applied the exact chapter edit, the native move refused the existing destination, and the frontend rolled the chapter back to its exact prior text while leaving the source note in place. The first package reported that failure behind the modal; the corrected package surfaced: **The note was not moved; previewed link edits were rolled back: The destination already exists; nothing was changed.** Removing the disposable collision and confirming again succeeded. A final rebuilt package repeated a rename and reverse rename after the custom command was bound to Tauri's live native-picker scope, proving that hardening retained the intended operation. All QA-created links and path changes were moved out or reversed, and the disposable chapter returned to its original broken-link baseline.

Automated coverage includes exact/noisy/ambiguous/excluded mention cases, view and per-target bounds, stable-ID and metadata refusal, path collisions and traversal, post-move resolution simulation, heading/label preservation, stable-read aborts, staged-write rollback, move-failure rollback, selection-offset mapping, native containment, native destination refusal, and byte-stable no-clobber moves. The 2,000-note/24.78 MiB fixture measured 4.97 ms cold and 1.84 ms warm for mention analysis against a 50 ms target. The full frontend suite has 267 passing tests across forty-one files, two native rename tests pass, Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.

## Start safely

Create a disposable writing folder in Terminal:

```sh
qa_dir="$(mktemp -d /tmp/two-hundred-crappy-words-qa.XXXXXX)"
mkdir "$qa_dir/Lore"
printf 'Original chapter\n' > "$qa_dir/chapter.txt"
printf 'A quiet red planet\n' > "$qa_dir/Lore/mars.txt"
echo "$qa_dir"
```

Keep that Terminal tab open for the filesystem commands below. In a second Terminal tab, start the app from the project folder:

```sh
cd ~/code/two-hundred-crappy-words
npm run tauri dev
```

Use **Open Folder** to choose the printed temporary path. No real writing files are needed for this checklist.

## Core workflow

- Expand `Lore`, select it, and create `new-world.md`. Confirm the file appears inside `Lore`, not at the root.
- Open a file, type rapidly, and confirm the status progresses through Unsaved/Saving/Saved without interrupting typing.
- Press `Command+S`, switch files immediately, and confirm text lands in the correct file.
- Tab through Open Folder, New File, the project tree, window controls, and editor. Confirm focus is visible and labels make sense with VoiceOver if available.
- Confirm the red close control closes safely and the yellow control minimizes. Confirm the blank title-bar area still drags the window.

## External-change protection

Open `chapter.txt` in the app. In Terminal, replace it externally:

```sh
printf 'Changed outside the app\n' > "$qa_dir/chapter.txt"
```

Type in the app and pause. Confirm an error says the external version was not overwritten. Press `Command+S`; confirm the dialog previews both versions and offers Overwrite file, Discard my changes, and Keep writing. Choose Keep writing first and verify the Terminal version remains unchanged. Repeat and choose Overwrite file only when ready to confirm that explicit path.

## Missing and unwritable sources

- Open `Lore/mars.txt`, rename it in Terminal, then type in the app. Confirm the old path is not silently recreated and `Command+S` asks before writing it.
- Restore the name, make the file read-only with `chmod 444 "$qa_dir/Lore/mars.txt"`, edit, and confirm save failure leaves the writing open. Restore it with `chmod 644 "$qa_dir/Lore/mars.txt"`, press `Command+S`, and confirm Retry succeeds.
- Rename the disposable project folder while it is open and try expanding or creating a file. Confirm an explicit error appears and the app remains usable. Rename it back before continuing.

## Recovery and remembered scope

- With a source made read-only, type a distinctive sentence and wait for the save-failure message. Force quit **200 Crappy Words**, restore write permission, and restart the app.
- Confirm the chosen folder reopens without granting access again. Open the affected file and confirm the recovery dialog previews both copies. Exercise Cancel, then reopen and choose Recover draft.
- After the recovered text saves, restart once more and confirm the stale recovery prompt is gone.

## Finish

Close the development command with `Ctrl+C`. The temporary QA directory may be deleted when its contents are no longer useful.

Record any mismatch in `docs/CURRENT.md` before marking milestone 0.2 complete.
