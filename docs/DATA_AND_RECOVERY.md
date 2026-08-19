# Data and recovery

200 Crappy Words is designed as a local-first application. Its core writing workflow does not require an account or network connection.

## Writing files

The application reads and writes the text files in the folder the writer chooses. The folder remains an ordinary filesystem folder and can be backed up or opened with other tools.

## Settings

The last opened folder is stored in `settings.json` in Tauri's app-data directory for the application.

The same directory can contain `.persisted-scope`, which records filesystem access for folders the writer explicitly chose in the native picker. This lets the last folder reopen without granting static access to the rest of the computer. Permission details and limitations are documented in [`SECURITY_AND_PERMISSIONS.md`](SECURITY_AND_PERMISSIONS.md).

## Recovery drafts

While a document has unsaved changes, the application maintains a second local copy in `recovery.json` in Tauri's app-data directory. Tauri resolves that directory according to the operating system and the application identifier `com.pat.two-hundred-crappy-words`.

A recovery record contains:

- the absolute path of the source file;
- the recovery draft text;
- a local revision number;
- the time the recovery record was updated; and
- a compact fingerprint of the last persisted content, used only to notice possible external edits.

Recovery text is not stored in the writing project, transmitted, or used for telemetry. A record is removed after its revision is confirmed saved, when it already exactly matches the file, or when the writer explicitly chooses to keep the file instead.

If the app finds a recovery draft that differs from the source file, it asks whether to recover the draft, keep the source file, or cancel opening it. If the source also appears to have changed since recovery began, the prompt says so rather than choosing one version automatically.

Recovery is a last line of defense, not a backup system. Writers should still back up their project folders normally.
