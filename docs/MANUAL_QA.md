# Manual desktop QA

This checklist uses disposable files and is the human checkpoint for milestone 0.2. Automated tests cover the underlying state and race behavior; these steps confirm the macOS window, native dialogs, focus, and filesystem integration.

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
