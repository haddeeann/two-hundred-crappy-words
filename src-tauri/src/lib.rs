use std::fs;
use std::path::{Component, Path};
use tauri_plugin_fs::FsExt;

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
    if source_relative == target_relative {
        return Err("The source and destination paths are the same.".into());
    }

    let canonical_root = fs::canonicalize(root_path)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let source_path = canonical_root.join(source_relative);
    let source_metadata = fs::symlink_metadata(&source_path)
        .map_err(|error| format!("The source note is unavailable: {error}"))?;
    if source_metadata.file_type().is_symlink() || !source_metadata.is_file() {
        return Err("The source note is not a regular non-symbolic file.".into());
    }
    let canonical_source = fs::canonicalize(&source_path)
        .map_err(|error| format!("The source note could not be verified: {error}"))?;
    canonical_source
        .strip_prefix(&canonical_root)
        .map_err(|_| "The source note resolves outside the selected project.".to_string())?;

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
                "The old name could not be removed, and the new name could not be rolled back. Both paths now reference the note and require review: {error}; rollback: {rollback_error}"
            ),
        });
    }
    Ok(())
}

fn validate_relative_markdown_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err("Lore paths must be non-empty and project-relative.".into());
    }
    for component in path.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(
                "Lore paths cannot contain current, parent, root, or prefix segments.".into(),
            );
        }
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case("md") && !extension.eq_ignore_ascii_case("markdown") {
        return Err("Lore rename supports only .md and .markdown files.".into());
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // The dialog grants recursive access only to folders the writer
        // selects. Register after fs so those runtime scopes can be restored.
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![rename_lore_file_no_clobber])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::rename_lore_file_no_clobber_impl;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "two-hundred-crappy-words-rename-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(path.join("Lore")).expect("fixture folders");
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
}
