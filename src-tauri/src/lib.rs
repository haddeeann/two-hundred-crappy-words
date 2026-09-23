use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Component, Path};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::Emitter;
use tauri_plugin_fs::FsExt;

mod manuscript_merge;
mod manuscript_split;

const MANUSCRIPT_STRUCTURE_FILE: &str = "200-crappy-words.manuscripts.json";
const TIMELINE_PROJECT_FILE: &str = "200-crappy-words.timeline.json";
const WORLD_PROJECT_MANIFEST_FILE: &str = "200-crappy-words.project.json";
const MAX_MANUSCRIPT_STRUCTURE_BYTES: usize = 10 * 1024 * 1024;
const MENU_NEW_FILE_ID: &str = "file-new";
const MENU_OPEN_FOLDER_ID: &str = "file-open-folder";
const MENU_NEW_FILE_EVENT: &str = "menu-new-file";
const MENU_OPEN_FOLDER_EVENT: &str = "menu-open-folder";

fn app_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::default(app)?;
    let file_menu = menu
        .items()?
        .into_iter()
        .find_map(|item| {
            let submenu = item.as_submenu()?;
            (submenu.text().ok()?.as_str() == "File").then(|| submenu.clone())
        })
        .ok_or_else(|| tauri::Error::AssetNotFound("the default File menu".into()))?;

    let new_file = MenuItem::with_id(
        app,
        MENU_NEW_FILE_ID,
        "New File…",
        true,
        Some("CmdOrCtrl+N"),
    )?;
    let open_folder = MenuItem::with_id(
        app,
        MENU_OPEN_FOLDER_ID,
        "Open Folder…",
        true,
        Some("CmdOrCtrl+O"),
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    file_menu.prepend_items(&[&new_file, &open_folder, &separator])?;

    Ok(menu)
}

#[tauri::command]
fn rename_lore_file_no_clobber(
    app: tauri::AppHandle,
    root_path: String,
    source_relative: String,
    target_relative: String,
) -> Result<(), String> {
    let canonical_root = fs::canonicalize(&root_path)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let source_path = canonical_root.join(&source_relative);
    let target_path = canonical_root.join(&target_relative);
    let scope = app.fs_scope();
    if !scope.is_allowed(&canonical_root)
        || !scope.is_allowed(&source_path)
        || !scope.is_allowed(&target_path)
    {
        return Err("The rename paths are outside the filesystem scope granted by the native folder picker.".into());
    }
    rename_lore_file_no_clobber_impl(
        &canonical_root,
        Path::new(&source_relative),
        Path::new(&target_relative),
    )
}

fn rename_lore_file_no_clobber_impl(
    root_path: &Path,
    source_relative: &Path,
    target_relative: &Path,
) -> Result<(), String> {
    validate_relative_markdown_path(source_relative)?;
    validate_relative_markdown_path(target_relative)?;
    rename_regular_file_no_clobber_impl(root_path, source_relative, target_relative)
}

#[tauri::command]
fn rename_project_file_no_clobber(
    app: tauri::AppHandle,
    root_path: String,
    source_relative: String,
    target_name: String,
) -> Result<(), String> {
    let source_relative = Path::new(&source_relative);
    validate_relative_file_path(source_relative)?;
    reject_generic_markdown_source(source_relative)?;
    validate_portable_file_name(&target_name)?;
    let target_relative = source_relative
        .parent()
        .unwrap_or_else(|| Path::new(""))
        .join(&target_name);
    reject_protected_project_file(source_relative)?;
    reject_protected_project_file(&target_relative)?;

    let canonical_root = fs::canonicalize(&root_path)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let source_path = canonical_root.join(source_relative);
    let target_path = canonical_root.join(&target_relative);
    let scope = app.fs_scope();
    if !scope.is_allowed(&canonical_root)
        || !scope.is_allowed(&source_path)
        || !scope.is_allowed(&target_path)
    {
        return Err("The rename paths are outside the filesystem scope granted by the native folder picker.".into());
    }
    rename_regular_file_no_clobber_impl(&canonical_root, source_relative, &target_relative)
}

#[tauri::command]
fn trash_project_file(
    app: tauri::AppHandle,
    root_path: String,
    source_relative: String,
) -> Result<(), String> {
    let canonical_root = fs::canonicalize(&root_path)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let source_relative = Path::new(&source_relative);
    let source_path = canonical_root.join(source_relative);
    let scope = app.fs_scope();
    if !scope.is_allowed(&canonical_root) || !scope.is_allowed(&source_path) {
        return Err(
            "The file is outside the filesystem scope granted by the native folder picker.".into(),
        );
    }
    trash_project_file_impl(&canonical_root, source_relative, |path| {
        trash::delete(path).map_err(|error| {
            format!("The operating system could not move the file to Trash: {error}")
        })
    })
}

fn trash_project_file_impl<F>(
    root_path: &Path,
    source_relative: &Path,
    move_to_trash: F,
) -> Result<(), String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    validate_relative_file_path(source_relative)?;
    reject_protected_project_file(source_relative)?;
    let canonical_root = fs::canonicalize(root_path)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let source_path = canonical_root.join(source_relative);
    let source_metadata = fs::symlink_metadata(&source_path)
        .map_err(|error| format!("The source file is unavailable: {error}"))?;
    if source_metadata.file_type().is_symlink() || !source_metadata.is_file() {
        return Err("Only a regular non-symbolic file can be moved to Trash.".into());
    }
    let canonical_source = fs::canonicalize(&source_path)
        .map_err(|error| format!("The source file could not be verified: {error}"))?;
    canonical_source
        .strip_prefix(&canonical_root)
        .map_err(|_| "The source file resolves outside the selected project.".to_string())?;

    move_to_trash(&canonical_source)?;
    match fs::symlink_metadata(&source_path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Ok(_) => Err("The Trash operation returned without removing the project path; check the file before trying again.".into()),
        Err(error) => Err(format!(
            "The Trash operation finished, but the original path could not be verified: {error}"
        )),
    }
}

fn rename_regular_file_no_clobber_impl(
    root_path: &Path,
    source_relative: &Path,
    target_relative: &Path,
) -> Result<(), String> {
    validate_relative_file_path(source_relative)?;
    validate_relative_file_path(target_relative)?;
    if source_relative == target_relative {
        return Err("The source and destination paths are the same.".into());
    }
    let canonical_root = fs::canonicalize(root_path)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let source_path = canonical_root.join(source_relative);
    let source_metadata = fs::symlink_metadata(&source_path)
        .map_err(|error| format!("The source file is unavailable: {error}"))?;
    if source_metadata.file_type().is_symlink() || !source_metadata.is_file() {
        return Err("The source is not a regular non-symbolic file.".into());
    }
    let canonical_source = fs::canonicalize(&source_path)
        .map_err(|error| format!("The source file could not be verified: {error}"))?;
    canonical_source
        .strip_prefix(&canonical_root)
        .map_err(|_| "The source file resolves outside the selected project.".to_string())?;

    let target_path = canonical_root.join(target_relative);
    let target_parent = target_path
        .parent()
        .ok_or_else(|| "The destination has no containing folder.".to_string())?;
    let canonical_parent = fs::canonicalize(target_parent)
        .map_err(|error| format!("The destination folder is unavailable: {error}"))?;
    canonical_parent
        .strip_prefix(&canonical_root)
        .map_err(|_| "The destination folder resolves outside the selected project.".to_string())?;
    let target_name = target_path
        .file_name()
        .ok_or_else(|| "The destination filename is missing.".to_string())?;
    let verified_target = canonical_parent.join(target_name);

    match fs::symlink_metadata(&verified_target) {
        Ok(_) => return Err("The destination already exists; nothing was changed.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "The destination could not be checked safely: {error}"
            ))
        }
    }

    fs::hard_link(&canonical_source, &verified_target).map_err(|error| {
        format!("The destination could not be created without overwriting: {error}")
    })?;
    if let Err(error) = verify_same_file(&canonical_source, &verified_target) {
        let rollback = fs::remove_file(&verified_target);
        return Err(match rollback {
            Ok(()) => format!("The source changed during rename; the destination was removed: {error}"),
            Err(rollback_error) => format!(
                "The source changed during rename, and the new destination could not be removed. Both paths require review: {error}; rollback: {rollback_error}"
            ),
        });
    }

    if let Err(error) = fs::remove_file(&canonical_source) {
        let rollback = fs::remove_file(&verified_target);
        return Err(match rollback {
            Ok(()) => format!("The old name could not be removed, so the new name was rolled back: {error}"),
            Err(rollback_error) => format!(
                "The old name could not be removed, and the new name could not be rolled back. Both paths now reference the file and require review: {error}; rollback: {rollback_error}"
            ),
        });
    }
    Ok(())
}

#[tauri::command]
fn replace_manuscript_structure_atomic(
    app: tauri::AppHandle,
    root_path: String,
    expected_text: String,
    new_text: String,
) -> Result<(), String> {
    let canonical_root = fs::canonicalize(&root_path)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let structure_path = canonical_root.join(MANUSCRIPT_STRUCTURE_FILE);
    let scope = app.fs_scope();
    if !scope.is_allowed(&canonical_root) || !scope.is_allowed(&structure_path) {
        return Err("The manuscript structure is outside the filesystem scope granted by the native folder picker.".into());
    }
    replace_manuscript_structure_atomic_impl(&canonical_root, &expected_text, &new_text)
}

#[cfg(unix)]
fn replace_manuscript_structure_atomic_impl(
    root_path: &Path,
    expected_text: &str,
    new_text: &str,
) -> Result<(), String> {
    if expected_text.len() > MAX_MANUSCRIPT_STRUCTURE_BYTES
        || new_text.len() > MAX_MANUSCRIPT_STRUCTURE_BYTES
    {
        return Err("The manuscript structure exceeds the 10 MiB mutation limit.".into());
    }
    validate_new_manuscript_structure(new_text)?;

    let canonical_root = fs::canonicalize(root_path)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let structure_path = canonical_root.join(MANUSCRIPT_STRUCTURE_FILE);
    let metadata = fs::symlink_metadata(&structure_path)
        .map_err(|error| format!("The manuscript structure is unavailable: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("The manuscript structure is not a regular non-symbolic file.".into());
    }
    let canonical_structure = fs::canonicalize(&structure_path)
        .map_err(|error| format!("The manuscript structure could not be verified: {error}"))?;
    canonical_structure
        .strip_prefix(&canonical_root)
        .map_err(|_| {
            "The manuscript structure resolves outside the selected project.".to_string()
        })?;

    let current = fs::read_to_string(&canonical_structure)
        .map_err(|error| format!("The manuscript structure could not be read: {error}"))?;
    if current != expected_text {
        return Err(
            "The manuscript structure changed after the preview; nothing was written.".into(),
        );
    }

    let (temporary_path, mut temporary) = create_structure_temporary(&canonical_root)?;
    let mut replaced = false;
    let result = (|| {
        temporary
            .write_all(new_text.as_bytes())
            .map_err(|error| format!("The replacement could not be staged: {error}"))?;
        temporary.sync_all().map_err(|error| {
            format!("The staged replacement could not be synchronized: {error}")
        })?;
        fs::set_permissions(&temporary_path, metadata.permissions()).map_err(|error| {
            format!("The staged replacement permissions could not be retained: {error}")
        })?;
        temporary.sync_all().map_err(|error| {
            format!("The staged replacement metadata could not be synchronized: {error}")
        })?;
        drop(temporary);

        let staged = fs::read_to_string(&temporary_path)
            .map_err(|error| format!("The staged replacement could not be verified: {error}"))?;
        if staged != new_text {
            return Err("The staged replacement did not match the validated structure.".into());
        }
        let rechecked = fs::read_to_string(&canonical_structure)
            .map_err(|error| format!("The manuscript structure could not be rechecked: {error}"))?;
        if rechecked != expected_text {
            return Err("The manuscript structure changed while the replacement was staged; nothing was written.".into());
        }

        fs::rename(&temporary_path, &canonical_structure)
            .map_err(|error| format!("The atomic manuscript replacement failed: {error}"))?;
        replaced = true;
        if let Ok(directory) = fs::File::open(&canonical_root) {
            let _ = directory.sync_all();
        }
        let written = fs::read_to_string(&canonical_structure).map_err(|error| {
            format!("The structure was replaced, but the result could not be reread and needs review: {error}")
        })?;
        if written != new_text {
            return Err(
                "The structure was replaced, but its reread did not match and needs review.".into(),
            );
        }
        Ok(())
    })();
    if !replaced {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

#[cfg(not(unix))]
fn replace_manuscript_structure_atomic_impl(
    _root_path: &Path,
    _expected_text: &str,
    _new_text: &str,
) -> Result<(), String> {
    Err("Atomic manuscript replacement is not yet available on this operating system.".into())
}

#[cfg(unix)]
fn create_structure_temporary(root_path: &Path) -> Result<(std::path::PathBuf, fs::File), String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "The system clock could not produce a temporary filename.".to_string())?
        .as_nanos();
    for attempt in 0..16 {
        let path = root_path.join(format!(
            ".{MANUSCRIPT_STRUCTURE_FILE}.tmp-{}-{nonce}-{attempt}",
            std::process::id()
        ));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "A temporary replacement could not be created: {error}"
                ))
            }
        }
    }
    Err("A unique temporary replacement path could not be created.".into())
}

fn validate_new_manuscript_structure(text: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(text)
        .map_err(|error| format!("The replacement is not valid JSON: {error}"))?;
    let object = value
        .as_object()
        .ok_or_else(|| "The replacement manuscript structure must be a JSON object.".to_string())?;
    if object
        .get("formatVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(1)
    {
        return Err("The replacement manuscript structure must use format version 1.".into());
    }
    if !object
        .get("manuscripts")
        .is_some_and(serde_json::Value::is_array)
    {
        return Err(
            "The replacement manuscript structure must contain a manuscripts array.".into(),
        );
    }
    Ok(())
}

fn validate_relative_markdown_path(path: &Path) -> Result<(), String> {
    validate_relative_file_path(path)?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case("md") && !extension.eq_ignore_ascii_case("markdown") {
        return Err("Lore rename supports only .md and .markdown files.".into());
    }
    Ok(())
}

fn validate_relative_file_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err("File paths must be non-empty and project-relative.".into());
    }
    for component in path.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(
                "File paths cannot contain current, parent, root, or prefix segments.".into(),
            );
        }
    }
    Ok(())
}

fn validate_portable_file_name(name: &str) -> Result<(), String> {
    let path = Path::new(name);
    if name.is_empty()
        || path.components().count() != 1
        || !matches!(path.components().next(), Some(Component::Normal(_)))
    {
        return Err("Enter a filename, not a folder path.".into());
    }
    if name.chars().any(|character| {
        character.is_control()
            || matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\\')
    }) {
        return Err(
            "The filename contains a character that is not portable across systems.".into(),
        );
    }
    if name.ends_with([' ', '.']) {
        return Err("A filename cannot end with a space or period.".into());
    }
    let base_name = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    if matches!(base_name.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (base_name.len() == 4
            && (base_name.starts_with("COM") || base_name.starts_with("LPT"))
            && matches!(base_name.as_bytes()[3], b'1'..=b'9'))
    {
        return Err("That filename is reserved by the operating system.".into());
    }
    Ok(())
}

fn reject_protected_project_file(path: &Path) -> Result<(), String> {
    if path.components().count() == 1 {
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if name.eq_ignore_ascii_case(WORLD_PROJECT_MANIFEST_FILE)
            || name.eq_ignore_ascii_case(MANUSCRIPT_STRUCTURE_FILE)
            || name.eq_ignore_ascii_case(TIMELINE_PROJECT_FILE)
        {
            return Err(
                "The app's project metadata files cannot be changed from the file tree.".into(),
            );
        }
    }
    Ok(())
}

fn reject_generic_markdown_source(path: &Path) -> Result<(), String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown") {
        return Err(
            "Markdown files must use the previewed lore rename so links can be checked.".into(),
        );
    }
    Ok(())
}

#[cfg(unix)]
fn verify_same_file(source: &Path, target: &Path) -> Result<(), String> {
    use std::os::unix::fs::MetadataExt;
    let source_metadata = fs::symlink_metadata(source)
        .map_err(|error| format!("The source could not be rechecked: {error}"))?;
    let target_metadata = fs::symlink_metadata(target)
        .map_err(|error| format!("The destination could not be rechecked: {error}"))?;
    if source_metadata.file_type().is_symlink()
        || target_metadata.file_type().is_symlink()
        || source_metadata.dev() != target_metadata.dev()
        || source_metadata.ino() != target_metadata.ino()
    {
        return Err("The two paths do not identify the same regular file.".into());
    }
    Ok(())
}

#[cfg(not(unix))]
fn verify_same_file(source: &Path, target: &Path) -> Result<(), String> {
    let source_metadata = fs::symlink_metadata(source)
        .map_err(|error| format!("The source could not be rechecked: {error}"))?;
    let target_metadata = fs::symlink_metadata(target)
        .map_err(|error| format!("The destination could not be rechecked: {error}"))?;
    if source_metadata.file_type().is_symlink()
        || target_metadata.file_type().is_symlink()
        || !source_metadata.is_file()
        || source_metadata.len() != target_metadata.len()
    {
        return Err("The two paths could not be verified as the same regular file.".into());
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(app_menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_NEW_FILE_ID => {
                let _ = app.emit(MENU_NEW_FILE_EVENT, ());
            }
            MENU_OPEN_FOLDER_ID => {
                let _ = app.emit(MENU_OPEN_FOLDER_EVENT, ());
            }
            _ => {}
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // The dialog grants recursive access only to folders the writer
        // selects. Register after fs so those runtime scopes can be restored.
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            rename_lore_file_no_clobber,
            rename_project_file_no_clobber,
            trash_project_file,
            replace_manuscript_structure_atomic,
            manuscript_merge::merge_manuscript_scenes_atomic,
            manuscript_merge::undo_manuscript_scene_merge_atomic,
            manuscript_split::split_manuscript_scene_atomic,
            manuscript_split::undo_manuscript_scene_split_atomic
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        reject_generic_markdown_source, reject_protected_project_file,
        rename_lore_file_no_clobber_impl, rename_regular_file_no_clobber_impl,
        replace_manuscript_structure_atomic_impl, trash_project_file_impl,
        validate_portable_file_name,
    };
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "two-hundred-crappy-words-rename-{}-{nonce}-{}",
                std::process::id(),
                FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).expect("unique fixture root");
            fs::create_dir(path.join("Lore")).expect("fixture folders");
            Self(path)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn renames_without_changing_file_contents() {
        let fixture = Fixture::new();
        fs::write(fixture.0.join("old.md"), "# Old\n").expect("source");

        rename_lore_file_no_clobber_impl(
            &fixture.0,
            PathBuf::from("old.md").as_path(),
            PathBuf::from("Lore/new.md").as_path(),
        )
        .expect("rename");

        assert!(!fixture.0.join("old.md").exists());
        assert_eq!(
            fs::read_to_string(fixture.0.join("Lore/new.md")).expect("target"),
            "# Old\n"
        );
    }

    #[test]
    fn refuses_existing_and_out_of_project_destinations() {
        let fixture = Fixture::new();
        fs::write(fixture.0.join("old.md"), "old").expect("source");
        fs::write(fixture.0.join("Lore/new.md"), "keep").expect("target");

        let collision = rename_lore_file_no_clobber_impl(
            &fixture.0,
            PathBuf::from("old.md").as_path(),
            PathBuf::from("Lore/new.md").as_path(),
        )
        .expect_err("collision");
        assert!(collision.contains("already exists"));
        assert_eq!(fs::read_to_string(fixture.0.join("old.md")).unwrap(), "old");
        assert_eq!(
            fs::read_to_string(fixture.0.join("Lore/new.md")).unwrap(),
            "keep"
        );

        let traversal = rename_lore_file_no_clobber_impl(
            &fixture.0,
            PathBuf::from("old.md").as_path(),
            PathBuf::from("../outside.md").as_path(),
        )
        .expect_err("traversal");
        assert!(traversal.contains("cannot contain"));
    }

    #[test]
    fn renames_an_ordinary_file_without_changing_its_bytes_or_clobbering() {
        let fixture = Fixture::new();
        fs::write(fixture.0.join("draft.txt"), "writer-owned bytes\n").expect("source");

        rename_regular_file_no_clobber_impl(
            &fixture.0,
            Path::new("draft.txt"),
            Path::new("chapter-one.txt"),
        )
        .expect("rename");

        assert!(!fixture.0.join("draft.txt").exists());
        assert_eq!(
            fs::read_to_string(fixture.0.join("chapter-one.txt")).unwrap(),
            "writer-owned bytes\n"
        );

        fs::write(fixture.0.join("second.txt"), "second").expect("second source");
        fs::write(fixture.0.join("occupied.txt"), "keep").expect("occupied target");
        let collision = rename_regular_file_no_clobber_impl(
            &fixture.0,
            Path::new("second.txt"),
            Path::new("occupied.txt"),
        )
        .expect_err("collision");
        assert!(collision.contains("already exists"));
        assert_eq!(
            fs::read_to_string(fixture.0.join("second.txt")).unwrap(),
            "second"
        );
        assert_eq!(
            fs::read_to_string(fixture.0.join("occupied.txt")).unwrap(),
            "keep"
        );
    }

    #[test]
    fn validates_portable_names_and_protects_root_metadata() {
        for invalid in [
            "",
            "../draft.txt",
            "folder/draft.txt",
            "folder\\draft.txt",
            "bad?.txt",
            "trail.",
            "CON.txt",
        ] {
            assert!(validate_portable_file_name(invalid).is_err(), "{invalid}");
        }
        validate_portable_file_name("chapter 01.rtf").expect("portable filename");
        assert!(
            reject_protected_project_file(Path::new(super::WORLD_PROJECT_MANIFEST_FILE)).is_err()
        );
        assert!(
            reject_protected_project_file(Path::new(super::MANUSCRIPT_STRUCTURE_FILE)).is_err()
        );
        assert!(reject_protected_project_file(Path::new(super::TIMELINE_PROJECT_FILE)).is_err());
        assert!(
            reject_protected_project_file(Path::new("200-CRAPPY-WORDS.MANUSCRIPTS.JSON")).is_err()
        );
        reject_protected_project_file(Path::new("Notes/200-crappy-words.project.json"))
            .expect("nested ordinary file");
        assert!(reject_generic_markdown_source(Path::new("draft.MD")).is_err());
        reject_generic_markdown_source(Path::new("draft.txt")).expect("ordinary file");
    }

    #[test]
    fn trashes_only_a_verified_regular_unprotected_file() {
        let fixture = Fixture::new();
        let source = fixture.0.join("discard.txt");
        let mock_trash = fixture.0.join("discarded-copy");
        fs::write(&source, "recoverable bytes\n").expect("source");

        trash_project_file_impl(&fixture.0, Path::new("discard.txt"), |path| {
            fs::rename(path, &mock_trash).map_err(|error| error.to_string())
        })
        .expect("trash");

        assert!(!source.exists());
        assert_eq!(
            fs::read_to_string(&mock_trash).expect("mock trashed file"),
            "recoverable bytes\n"
        );

        fs::write(
            fixture.0.join(super::MANUSCRIPT_STRUCTURE_FILE),
            "protected",
        )
        .expect("protected source");
        let protected = trash_project_file_impl(
            &fixture.0,
            Path::new(super::MANUSCRIPT_STRUCTURE_FILE),
            |_| panic!("protected metadata must not reach Trash"),
        )
        .expect_err("protected metadata");
        assert!(protected.contains("metadata"));
    }

    #[cfg(unix)]
    #[test]
    fn atomically_replaces_only_the_expected_manuscript_structure() {
        let fixture = Fixture::new();
        let original = "{\"formatVersion\":1,\"manuscripts\":[]}\n";
        let updated =
            "{\n  \"formatVersion\": 1,\n  \"manuscripts\": [],\n  \"marker\": \"updated\"\n}\n";
        let path = fixture.0.join(super::MANUSCRIPT_STRUCTURE_FILE);
        fs::write(&path, original).expect("structure");
        let permissions = fs::metadata(&path).unwrap().permissions();

        replace_manuscript_structure_atomic_impl(&fixture.0, original, updated)
            .expect("atomic replacement");

        assert_eq!(fs::read_to_string(&path).unwrap(), updated);
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().readonly(),
            permissions.readonly()
        );
        assert!(fs::read_dir(&fixture.0).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .contains(".tmp-")));
    }

    #[cfg(unix)]
    #[test]
    fn refuses_changed_invalid_and_symbolic_manuscript_replacements() {
        let fixture = Fixture::new();
        let original = "{\"formatVersion\":1,\"manuscripts\":[]}\n";
        let updated = "{\"formatVersion\":1,\"manuscripts\":[],\"safe\":true}\n";
        let path = fixture.0.join(super::MANUSCRIPT_STRUCTURE_FILE);
        fs::write(&path, original).expect("structure");

        let changed = replace_manuscript_structure_atomic_impl(&fixture.0, "different", updated)
            .expect_err("changed source");
        assert!(changed.contains("changed after the preview"));
        assert_eq!(fs::read_to_string(&path).unwrap(), original);

        let invalid = replace_manuscript_structure_atomic_impl(&fixture.0, original, "{}")
            .expect_err("invalid replacement");
        assert!(invalid.contains("format version 1"));
        assert_eq!(fs::read_to_string(&path).unwrap(), original);

        fs::remove_file(&path).unwrap();
        std::os::unix::fs::symlink(fixture.0.join("Lore/target.json"), &path).expect("symlink");
        fs::write(fixture.0.join("Lore/target.json"), original).expect("target");
        let symbolic = replace_manuscript_structure_atomic_impl(&fixture.0, original, updated)
            .expect_err("symbolic structure");
        assert!(symbolic.contains("non-symbolic"));
        assert_eq!(
            fs::read_to_string(fixture.0.join("Lore/target.json")).unwrap(),
            original
        );
    }
}
