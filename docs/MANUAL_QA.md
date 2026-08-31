# Manual desktop QA

This checklist uses disposable files and is the human checkpoint for milestone 0.2. Automated tests cover the underlying state and race behavior; these steps confirm the macOS window, native dialogs, focus, and filesystem integration.

## Latest result

Completed successfully on macOS on 2026-08-31. The latest run finished rollback-safe adjacent-scene merge QA—including exact Undo and post-preview retirement collision refusal—and verified the tree-only-left, native-File-menu, writing-tools-right navigation in the packaged app. The disposable manuscript returned to its recorded baseline hashes and Today remained `0 / 200`. Detailed current and historical checkpoints follow.

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

## Milestone 0.5.8 navigation-history and final regression checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against a freshly packaged build and the restored disposable lore project. Back and Forward began visibly disabled. With the exact phrase `protected draft` selected in `chapter.md`, Command+P plus `Early` and Shift+Enter opened the Mara side reference and enabled Back. Command+`[` closed the reference, restored the exact selection and editor focus, and enabled Forward; Command+`]` restored the verified Mara reference and its focus. **Open in editor** then navigated to `Lore/mara.md`; Back restored the prior chapter-plus-reference context. Closing that reference after going Back discarded the old forward branch, while another Back restored the reference as the new prior context.

An external edit refreshed the visible Mara reference but invalidated a previously recorded Mara-editor destination. Forward skipped that stale fingerprint, kept the current chapter and refreshed reference intact, disabled itself, and announced: `Skipped 1 changed or unavailable entry; there is nowhere else to go forward.` The disposable note was then restored byte-for-byte. Quitting and relaunching reopened the remembered project and active chapter with both history actions disabled, proving the navigation trail is process-local. Accessibility inspection confirmed named controls, understandable disabled states and notices, keyboard operation, preserved selection, and reference/editor focus behavior.

The final 2,000-note/24.78 MiB regression measured 236.33 ms for a full index, 7.49 ms for its longest cooperative work chunk, 6.40 ms for an incremental update, 0.0001 ms warm lookup, 8.07 ms cold and 3.45 ms warm completion, 6.86 ms cold and 13.79 ms warm search, and 4.55 ms cold and 1.97 ms warm mention analysis; every approved budget passed. The frontend suite has 271 passing tests across forty-two files, Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, Rust formatting/tests/checks pass, and the production dependency audit reports zero vulnerabilities. This completes milestone 0.5.

## Milestone 0.6.4 read-only manuscript-outline checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against a freshly packaged build and a disposable three-note manuscript project. A valid root `200-crappy-words.manuscripts.json` appeared as a compact disclosure summarizing one book and two scenes. Its expanded accessibility tree and visual inspection preserved the declared book, chapter, optional `chapter.md` overview, and two-scene order at the actual sidebar width. Return collapsed the disclosure, Space expanded it, and the explicit refresh retained the same hierarchy.

Opening the first scene from the outline used the existing editor and left Today at `0 / 200`. The optional chapter overview was pinned ahead of the scene list, opened through the same guarded path, and likewise added no daily credit. Moving the first scene externally changed its row automatically into a non-clickable `Moved candidate` suggestion that explicitly said the structure was not changed; restoring the path recovered the verified action automatically.

Deliberately prefixing the structure with invalid text changed the disclosure to `Manuscript structure: needs attention` and explained the JSON parse failure while the already open scene remained saved and usable. Restoring the exact JSON recovered the outline automatically. No QA operation wrote or repaired the structure, scene, or overview content. The full suite has 298 passing tests across forty-four files, Svelte/TypeScript checks report zero errors and warnings, and frontend plus packaged macOS builds pass.

## Milestone 0.6.5 manuscript creation/import checkpoint

Completed successfully on macOS on 2026-08-22 using Computer Use against freshly packaged builds and two disposable ordinary folders. With no structure present and a ready lore index, the sidebar offered **Create manuscript structure**. Its visually inspected modal focused and selected the suggested title, exposed dialog/radio/heading/list semantics, trapped keyboard interaction, closed with Escape, and clearly separated **Import existing Markdown** from **Start with an empty outline**. The empty choice previewed one book and zero items. Import automatically selected the conventional `Manuscript` folder and previewed a loose scene, a chapter container, its optional overview, and naturally ordered `2`, `5`, then `10` scene files. A nested Assets folder and non-Markdown draft remained available under a disclosure explaining exactly why both were skipped.

Escape cancellation left the fixed structure path absent. In a second attempt, an external scene was added after the four-item preview; confirmation refused with `Nothing was written` and required a fresh preview. Refresh then showed all five outline items, and confirmation created exactly one version-one structure file. The modal closed, the creation action disappeared, and the read-only outline immediately reported one book and four prose scenes. Direct JSON inspection proved the chosen title, loose-scene/chapter order, overview binding, natural child order, and reuse of the two unique structured-note IDs. SHA-256 checks proved every pre-existing Markdown and skipped file remained byte-for-byte unchanged, and Today stayed `0 / 200`.

A separate empty folder exercised the create-new race. After preview, an external version-99 structure with a distinctive marker appeared. Confirmation named the existing fixed path, promised nothing would replace or repair it, and left its SHA-256 and content unchanged; closing the modal exposed the normal newer-version attention state rather than another creation action. The final package launched cleanly after the post-QA honesty and import-budget review. The full suite has 308 passing tests across forty-five files, Svelte/TypeScript checks report zero errors and warnings, and frontend plus packaged macOS builds pass.

## Milestone 0.6.6 stable-ID manuscript source-repair checkpoint

Completed successfully on macOS on 2026-08-25 using Computer Use against a freshly packaged app bundle and a disposable manuscript project. One scene declared `Manuscript/Chapter 1/01-Arrival.md` while its uniquely ID-matched Markdown lived at `02-Arrival-Moved.md`. The expanded outline labeled the source as an uncommitted moved candidate and exposed **Review path repair…** only for that eligible row. The visually inspected modal had dialog, heading, exact JSON-field, stable-ID, old-path, new-path, safety, Cancel, and Confirm semantics. Cancel received initial focus; Tab and Shift+Tab remained contained; Escape closed the preview. Structure and both Markdown SHA-256 hashes remained unchanged after cancellation.

Confirmation immediately replaced the moved row with a verified open action and showed **Undo path repair for Arrival**. Direct JSON inspection proved only the path value changed in meaning while unknown root, book, and binding fields survived consistent formatting. Both Markdown hashes remained byte-stable and Today stayed `0 / 200`. Undo restored the exact original structure SHA-256, returned the moved suggestion, touched no Markdown, and offered no Redo. Opening another preview and adding an unrelated external structure marker caused confirmation to say the structure changed and nothing was written; the marker and old path remained intact and Confirm became disabled. Adding a second note with the same stable ID changed the row to an ambiguous-ID warning with no repair action. After another successful repair, an external marker removed the one-step Undo and announced why.

The first package exposed a reactive-proxy cloning exception before the modal could open; the JSON-only planner now clones through JSON serialization, with a proxy-backed regression test. Repeated native tests also exposed two parallel fixtures sharing a timestamp-derived directory; a process-local sequence now makes their roots unique. The final frontend suite has 315 passing tests across forty-six files, Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS app builds pass, four native tests pass repeatedly, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.

## Milestone 0.6.7 chapter and scene metadata checkpoint

Completed successfully on macOS on 2026-08-25 using Computer Use against the freshly packaged app bundle and the disposable source-repair manuscript. The expanded outline exposed **Edit details…** for both its chapter and moved-candidate scene while retaining the scene's existing synopsis. The visually inspected dialog had dialog, heading, required title, descriptive fields, compile checkbox, exact-change preview, safety explanation, Cancel, and Confirm semantics. The title received initial focus and selection; Shift+Tab reached the close action and wrapped to the final enabled action without leaving the modal. An unchanged draft could not be confirmed, `12.5` produced an exact whole-number error at the scene's `targetWords` JSON path, and Escape left the structure and both Markdown SHA-256 hashes unchanged.

A confirmed scene edit changed the title, synopsis, point of view, location, story date, status, labels, notes, and word target in one preview. Every old/new value and JSON path was visible before confirmation. The outline immediately showed the new title, synopsis, metadata chips, ordered labels, and planning notes while retaining the moved-source warning. Direct JSON inspection proved the unknown root, book, and source-binding fields survived, both Markdown hashes remained byte-stable, and Today stayed `0 / 200`. **Undo details edit for Arrival** restored the exact original structure SHA-256 with no Redo and no Markdown or daily-credit change.

Opening a chapter preview and then adding an unrelated external root field proved the consent boundary. Confirmation refused with `The manuscript structure changed after preview; nothing was written.`, disabled itself until the dialog was reopened, and preserved the external marker without adding the previewed chapter status. Removing that marker restored the exact original structure hash and the watcher-refreshed outline remained usable. The final frontend suite has 322 passing tests across forty-seven files, Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS app builds pass, four native tests pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.

## Milestone 0.6.8 accessible manuscript-reorder checkpoint

Completed successfully on macOS on 2026-08-25 using Computer Use against freshly packaged app bundles and a temporary extension of the disposable manuscript. The extension added a second chapter and a second scene without changing the existing sources. The expanded accessibility tree exposed **Later** only for the first top-level chapter and first chapter scene, and **Earlier** only for their final siblings. Visual inspection showed compact controls in the narrow sidebar. The reorder modal initially focused Cancel, contained Shift+Tab in both directions, closed with Escape, and named the manuscript, selected item, parent container, exact `items` or `children` JSON path, old/new one-based positions, neighbor, and before/after relationship. Escape left the extended structure and all three Markdown SHA-256 hashes unchanged.

Confirming **Echo earlier** immediately reversed the two scene rows, reversed their available boundary controls, focused the moved Echo row, showed **Undo move for Echo**, and left Today at `0 / 200`. Direct JSON inspection proved the full selected scene object, unknown root/scene/chapter fields, and every source binding survived while all Markdown hashes remained byte-stable. Undo restored the exact extended baseline structure SHA-256 with no Redo. A separate confirmed **Chapter 2 earlier** changed only top-level chapter order and its Undo again restored the exact baseline.

Opening another scene preview and adding an unrelated external root marker caused confirmation to refuse with `The manuscript structure changed after preview; nothing was written.` The previewed order did not change, the marker survived, and Confirm remained disabled until the dialog closed. Removing the marker restored the extended baseline hash. The temporary sibling and its Markdown source were then removed, restoring the original disposable structure and source hashes exactly. The final package launched against that one-chapter/one-scene project with no impossible reorder controls. The full frontend suite has 328 passing tests across forty-eight files, Svelte/TypeScript checks report zero errors and warnings, frontend and final packaged macOS app builds pass, four native tests pass, Rust formatting/checks pass, and the production dependency audit reports zero vulnerabilities.

## Milestone 0.6.9a read-only corkboard checkpoint

Completed successfully on macOS on 2026-08-25 using Computer Use against a freshly packaged app bundle and a temporary mixed-hierarchy extension of the disposable manuscript. The exact top-level order was loose Cold Open, Chapter 1 with Arrival and Echo, loose Intermission, then empty Chapter 2. **Open corkboard** replaced the main editor pane with four stacked sections in that same sequence; the two non-contiguous loose scenes remained separate **Outside chapters** sections rather than being regrouped. Visual inspection at the packaged laptop window width showed a calm single-column board, responsive cards, clear chapter boundaries, synopsis emphasis, compact metadata chips, visible compile exclusion, a moved-source warning without an unsafe open action, and a deliberate empty-chapter message.

Accessibility inspection exposed one level-one manuscript heading, level-two section headings, level-three scene headings, native planning-note disclosures, verified source actions, and the Return action in logical order. Board entry focused the workspace; Tab reached Return and then the first card's notes; Return expanded the multiline note. Opening verified Echo closed the board, loaded the exact Markdown through the guarded path, focused the editor, and left Today at `0 / 200`. The structure SHA-256 remained unchanged throughout read-only navigation.

Echo was then made deliberately unwritable and edited to force an unsaved draft plus visible save failure. Opening Corkboard retained the active file's `Save failed` state, and Return restored the exact unsaved sentence while focusing **Open corkboard** in the sidebar. Restoring write access and pressing Command+S saved that sentence normally, proving the visual workspace does not discard the editor's existing save/recovery state. The temporary structure and all added sources were then removed, restoring the original structure and pre-existing Markdown hashes exactly. The frontend suite remains at 328 passing tests across forty-eight files, Svelte/TypeScript checks report zero errors and warnings, and frontend plus packaged macOS app builds pass.

## Milestone 0.6.9b corkboard planning-actions checkpoint

Completed successfully on macOS on 2026-08-25 using Computer Use against a freshly packaged app bundle and a temporary extension of the disposable manuscript. The board contained two ordered chapters and two ordered scenes in Chapter 1. Accessibility inspection exposed **Edit details…** on every card and chapter, plus only the valid named **Earlier** or **Later** sibling actions at each boundary. Visual inspection showed the compact action bars fitting the approved responsive stacked-section layout.

Editing Echo from its corkboard card opened the existing exact metadata planner. Changing its location and status previewed the same JSON paths and old/new values as the outline action; confirmation refreshed the card immediately, returned focus to Echo on the board, left all Markdown byte-stable, and left Today at `14 / 200`. The shared sidebar Undo restored the exact extended-baseline structure SHA-256.

Moving Echo earlier from its card opened the existing reorder preview with the exact chapter `children` array, positions, neighbor, and before/after relationship. Confirmation reordered the board immediately, reversed the available boundary controls, returned focus to Echo, and again left Today at `14 / 200`. **Undo move for Echo** restored Arrival then Echo and the exact extended-baseline structure SHA-256. The temporary scene and chapter were removed afterward, restoring the original structure and existing Markdown hashes exactly. The full frontend suite has 328 passing tests across forty-eight files, Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, four native tests pass, Rust formatting passes, and the compatible dependency refresh leaves no known moderate/high advisories.

## Milestone 0.6.10 verified manuscript-count checkpoint

Completed successfully on macOS on 2026-08-26 using Computer Use against the freshly packaged app bundle and a temporary extension of the disposable repair manuscript. The chapter received a twenty-word target and contained its existing moved/unavailable Arrival, a verified six-word Echo with a ten-word target, and a verified four-word Cutaway excluded from compile. The expanded outline and main-pane corkboard both reported `6+ verified included words · 1 source unavailable · 4 excluded` for the manuscript, `6+ verified / 20 target words · 1 source unavailable · 4 excluded` for the chapter, unavailable for Arrival, `6 / 10 words` for Echo, and `4 words · Excluded from compile` for Cutaway. The valid structured chapter overview remained openable but contributed no prose count.

Accessibility inspection exposed each count as ordinary text next to its book, chapter, or scene, and visual inspection at the packaged laptop window size showed readable wrapping in the narrow outline and calm green count treatment on the corkboard. Adding three words externally to Echo automatically changed both views to nine-word scene, chapter, and manuscript values; restoring the source automatically returned all values to six. Today remained `0 / 200`, and no structure or app-local count file was written. The app closed cleanly, the temporary scenes were removed, and SHA-256 checks proved the original structure, moved Arrival source, and chapter overview were restored exactly. The frontend suite has 333 passing tests across forty-nine files, Svelte/TypeScript checks report zero errors and warnings, frontend and packaged macOS builds pass, four native tests and Rust formatting pass, and no known moderate/high dependency advisory remains.

## Milestone 0.6.11 manuscript-reference and Focus checkpoint

Completed successfully on macOS on 2026-08-26 using Computer Use against fresh packaged builds and a temporary ready scene plus separate active draft in the disposable repair project. With the word `draft` selected, the expanded outline exposed separate open and named read-only Reference actions for the ready chapter overview and scene. Opening **Reference Signal** kept Draft.md and its exact selection in place, focused a clearly labeled read-only pane, showed the verified path and prose, retained Open in editor/close behavior, and left Today at `0 / 200`. Visual inspection showed a balanced laptop split. The Corkboard action closed the board into the same split and preserved the same selection; Escape closed the reference and returned the exact selected word. QA found and corrected a duplicated `Open Open scene` accessible label before the final package.

Entering **Focus** hid the sidebar, divider, connected-lore history controls, and connections while keeping Draft.md, Saved/Save failed state, document words, daily progress, the optional read-only reference, and a visible pressed **Exit focus** control. The selected word survived the layout transition and a same-count replacement plus native Undo saved normally without daily credit. An external reference edit refreshed in place; removing the source replaced all stale prose with an unavailable message and Try again, and restoring it recovered automatically. Restarting from Focus restored the ordinary layout rather than persisting it.

The corrected final package then exercised an unwritable Draft.md: three added words produced Save failed and Today `3 / 200`; Focus entry and exit retained the complete unsaved text and failure state. After write access returned, Command+S saved normally. The app closed cleanly, and the temporary structure, source, and draft were removed, restoring the original structure and pre-existing Markdown SHA-256 hashes exactly. The frontend suite has 335 passing tests across fifty files, Svelte/TypeScript checks report zero errors and warnings, frontend and final packaged macOS builds pass, four native tests and Rust formatting pass, and no known moderate/high dependency advisory remains.

## Milestone 0.6.12a cross-container scene-relocation checkpoint

Completed successfully on macOS on 2026-08-27 using Computer Use against corrected fresh packaged app bundles and a disposable three-scene manuscript. Both the expanded outline and main-pane corkboard exposed **Move to…** only for scenes with another legal container. The visually inspected modal initially focused Destination, contained Tab and Shift+Tab, named the manuscript and complete scene, offered only the manuscript top level and legal same-manuscript chapters, and previewed both exact JSON arrays, one-based positions, and the chosen before/after placement. Its safety text explicitly promised not to infer or move folders or Markdown files. Escape changed no files. The first package returned focus to the document after Escape; `d7ce4d9` waits until modal unmount completes, and the corrected package returned focus to the exact invoking outline or corkboard button.

Confirmed moves covered Arrival from Signals to Landfall, loose Interlude into Landfall, and Arrival from Signals to an exact top-level position after Signals. Outline and corkboard refreshed immediately, scene/chapter/manuscript word counts followed the new hierarchy, and focus followed the moved row or card. Direct JSON inspection proved stable IDs, source paths, an unknown scene object, and an unknown root field survived. The shared one-step Undo restored the exact original structure SHA-256. All three Markdown SHA-256 hashes remained byte-stable and Today stayed `0 / 200`.

For stale-preview QA, Reply's move dialog remained open while an external root value changed. Confirmation refused with `The manuscript structure changed after preview; nothing was written.`, disabled itself, retained Reply in Signals, and preserved the external value. Closing the dialog returned focus to Reply's corkboard action and external restoration refreshed both views automatically. The temporary structure and all Markdown files then matched their exact original SHA-256 hashes. The full frontend suite has 342 passing tests across fifty-one files, Svelte/TypeScript checks report zero errors and warnings, four native tests pass, the packaged macOS app builds, and the moderate-threshold dependency audit passes with three low compatible-line advisories remaining.

## Milestone 0.6.12b rollback-safe scene-split checkpoint

Completed successfully on macOS on 2026-08-27 using Computer Use against the freshly built production `.app` and a new disposable one-chapter manuscript. A collapsed caret before the second paragraph opened **Split scene…** with initial focus on the new title, a non-colliding sibling Markdown suggestion, the exact left and right prose bytes, the original/new identity relationship, all three affected files, compile-exclusion behavior, and the no-daily-credit promise. Confirmation immediately showed two files and two ordered outline scenes. Direct JSON inspection proved the original UUID, synopsis, exclusion, and unknown nested field remained on the left; the right received a fresh UUID, minimal source/title identity, and inherited only explicit compile exclusion. The editor contained the exact left half, both scene totals were eight words, and Today remained `0 / 200`.

**Undo split of Arrival** restored the complete original prose and exact original structure SHA-256 and removed only the unchanged app-created right source. A second split followed by an external edit to the right source refreshed its word count from eight to fifteen, removed Undo automatically, and announced that a scene or structure change made it unsafe. Both scene files, the edited external sentence, and the split structure remained intact.

The full frontend suite has 353 passing tests across fifty-three files, including a final action-visibility regression; Svelte/TypeScript reports zero errors and warnings. Eight Rust tests cover normal apply/Undo, stale or colliding sources, non-reconstructing halves, exact rollback at each simulated commit phase, changed-file Undo refusal, and interrupted Undo rollback. Rust formatting and Clippy with warnings denied pass. The production `.app` bundle built and ran; the optional DMG wrapper stalled in Finder automation after producing the valid app bundle, so it was stopped without affecting packaged-app QA.

## Milestone 0.6.12c rollback-safe adjacent-scene merge checkpoint

Completed successfully on macOS on 2026-08-31 using Computer Use against the production `.app` and a disposable three-scene chapter. Only the first scene exposed **Merge with next…** in outline and corkboard; the second scene correctly withheld it because its right neighbor carried descriptive metadata. The keyboard-contained preview showed both titles and UUIDs, the complete left/right/retired/structure paths, exact JSON array position, metadata disposition, source excerpts, and exact inserted bytes for both preserve and one-blank-line boundary choices. Cancel began focused, Shift+Tab stayed contained, and Escape returned to the exact invoking outline or corkboard action.

Confirmation merged the expected prose, retained the complete left object including an unknown nested field, removed only the minimal right object, renamed the byte-identical right source to visible `right.md.retired`, refreshed outline/files/counts immediately, and left Today at `0 / 200`. **Undo merge** restored the structure, left source, right source, and unrelated final source to their exact baseline SHA-256 hashes and removed the retired path. A second frozen preview followed by externally creating `right.md.retired` refused with `The retired-source destination now exists; nothing was written.` All four baseline hashes remained unchanged and the collision file remained untouched.

The project-tree navigation refinement was then exercised in fresh packages. At launch the left rail contained only **Project files** and the lazy tree. The native **File** menu retained normal Close actions and exposed **New File…** and **Open Folder…**; Command+N focused a destination-labeled filename field above the tree, Escape canceled it, and Command+O opened the native folder picker. **Writing tools** was collapsed; opening it produced a labeled right dock with initially collapsed Recent projects, Project & backup info, Lore index, Manuscript outline, and Writing history, plus project and structured-note actions. The close button received focus, Escape closed the dock and returned focus to the toggle, and the narrow default window used an overlay rather than compressing the editor. No disposable project file changed during navigation or layout QA.

The full frontend suite has 362 passing tests across fifty-five files. Svelte/TypeScript reports zero errors and warnings; the frontend build passes. Twelve Rust tests, formatting, and Clippy with warnings denied pass. The unsigned production macOS `.app` bundle builds and runs.

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

Use **File → Open Folder…** to choose the printed temporary path. No real writing files are needed for this checklist.

## Core workflow

- Expand `Lore`, select it, and create `new-world.md`. Confirm the file appears inside `Lore`, not at the root.
- Open a file, type rapidly, and confirm the status progresses through Unsaved/Saving/Saved without interrupting typing.
- Press `Command+S`, switch files immediately, and confirm text lands in the correct file.
- Tab through the project tree, window controls, and editor. Confirm focus is visible and labels make sense with VoiceOver if available. Open the native **File** menu and confirm **New File…** and **Open Folder…** have Command/Ctrl+N and Command/Ctrl+O shortcuts.
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
