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
