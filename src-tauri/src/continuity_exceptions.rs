use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri_plugin_fs::FsExt;

const CONTINUITY_REVIEW_FILE: &str = "200-crappy-words.continuity-review.json";
const MAX_CONTINUITY_REVIEW_BYTES: usize = 5 * 1024 * 1024;

#[tauri::command]
pub(crate) fn create_continuity_review_file_new(
    app: tauri::AppHandle,
    root_path: String,
    new_text: String,
) -> Result<(), String> {
    let root = scoped_root(&app, &root_path)?;
    let path = root.join(CONTINUITY_REVIEW_FILE);
    if !app.fs_scope().is_allowed(&path) {
        return Err("The continuity-review file is outside the filesystem scope granted by the native folder picker.".into());
    }
    create_continuity_review_file_new_impl(&root, &new_text)
}

#[tauri::command]
pub(crate) fn replace_continuity_review_file_atomic(
    app: tauri::AppHandle,
    root_path: String,
    expected_text: String,
    new_text: String,
) -> Result<(), String> {
    let root = scoped_root(&app, &root_path)?;
    let path = root.join(CONTINUITY_REVIEW_FILE);
    if !app.fs_scope().is_allowed(&path) {
        return Err("The continuity-review file is outside the filesystem scope granted by the native folder picker.".into());
    }
    replace_continuity_review_file_atomic_impl(&root, &expected_text, &new_text)
}

#[tauri::command]
pub(crate) fn remove_continuity_review_file_if_exact(
    app: tauri::AppHandle,
    root_path: String,
    expected_text: String,
) -> Result<(), String> {
    let root = scoped_root(&app, &root_path)?;
    let path = root.join(CONTINUITY_REVIEW_FILE);
    if !app.fs_scope().is_allowed(&path) {
        return Err("The continuity-review file is outside the filesystem scope granted by the native folder picker.".into());
    }
    remove_continuity_review_file_if_exact_impl(&root, &expected_text)
}

fn scoped_root(app: &tauri::AppHandle, root_path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root_path)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    if !app.fs_scope().is_allowed(&root) {
        return Err(
            "The project root is outside the filesystem scope granted by the native folder picker."
                .into(),
        );
    }
    Ok(root)
}

fn create_continuity_review_file_new_impl(root: &Path, new_text: &str) -> Result<(), String> {
    validate_continuity_review_text(new_text)?;
    let root = fs::canonicalize(root)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let path = root.join(CONTINUITY_REVIEW_FILE);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                "The continuity-review file already exists; nothing was overwritten.".to_string()
            } else {
                format!("The continuity-review file could not be created: {error}")
            }
        })?;
    let result = (|| {
        file.write_all(new_text.as_bytes())
            .map_err(|error| format!("The continuity-review file could not be written: {error}"))?;
        file.sync_all().map_err(|error| {
            format!("The continuity-review file could not be synchronized: {error}")
        })?;
        drop(file);
        let written = fs::read_to_string(&path).map_err(|error| {
            format!("The new continuity-review file could not be reread: {error}")
        })?;
        if written != new_text {
            return Err("The new continuity-review file did not match the reviewed text.".into());
        }
        sync_directory(&root);
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&path);
        sync_directory(&root);
    }
    result
}

#[cfg(unix)]
fn replace_continuity_review_file_atomic_impl(
    root: &Path,
    expected_text: &str,
    new_text: &str,
) -> Result<(), String> {
    validate_expected_text(expected_text)?;
    validate_continuity_review_text(new_text)?;
    let root = fs::canonicalize(root)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let path = root.join(CONTINUITY_REVIEW_FILE);
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("The continuity-review file is unavailable: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("The continuity-review file is not a regular non-symbolic file.".into());
    }
    let canonical_path = fs::canonicalize(&path)
        .map_err(|error| format!("The continuity-review file could not be verified: {error}"))?;
    canonical_path.strip_prefix(&root).map_err(|_| {
        "The continuity-review file resolves outside the selected project.".to_string()
    })?;
    let current = fs::read_to_string(&canonical_path)
        .map_err(|error| format!("The continuity-review file could not be read: {error}"))?;
    if current != expected_text {
        return Err(
            "The continuity-review file changed after preview; nothing was written.".into(),
        );
    }

    let (temporary_path, mut temporary) = create_temporary(&root)?;
    let mut replaced = false;
    let result = (|| {
        temporary
            .write_all(new_text.as_bytes())
            .map_err(|error| format!("The replacement could not be staged: {error}"))?;
        temporary.sync_all().map_err(|error| {
            format!("The staged replacement could not be synchronized: {error}")
        })?;
        fs::set_permissions(&temporary_path, metadata.permissions()).map_err(|error| {
            format!("The continuity-review file permissions could not be retained: {error}")
        })?;
        drop(temporary);
        let staged = fs::read_to_string(&temporary_path).map_err(|error| {
            format!("The staged continuity-review file could not be verified: {error}")
        })?;
        if staged != new_text {
            return Err(
                "The staged continuity-review file did not match the reviewed text.".into(),
            );
        }
        let rechecked = fs::read_to_string(&canonical_path).map_err(|error| {
            format!("The continuity-review file could not be rechecked: {error}")
        })?;
        if rechecked != expected_text {
            return Err("The continuity-review file changed while replacement was staged; nothing was written.".into());
        }
        fs::rename(&temporary_path, &canonical_path).map_err(|error| {
            format!("The atomic continuity-review file replacement failed: {error}")
        })?;
        replaced = true;
        sync_directory(&root);
        let written = fs::read_to_string(&canonical_path).map_err(|error| {
            format!("The continuity-review file was replaced but could not be reread: {error}")
        })?;
        if written != new_text {
            return Err(
                "The continuity-review file was replaced, but its reread did not match.".into(),
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
fn replace_continuity_review_file_atomic_impl(
    _root: &Path,
    _expected_text: &str,
    _new_text: &str,
) -> Result<(), String> {
    Err(
        "Atomic continuity-review file replacement is not yet available on this operating system."
            .into(),
    )
}

fn remove_continuity_review_file_if_exact_impl(
    root: &Path,
    expected_text: &str,
) -> Result<(), String> {
    validate_expected_text(expected_text)?;
    let root = fs::canonicalize(root)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let path = root.join(CONTINUITY_REVIEW_FILE);
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("The continuity-review file is unavailable: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("The continuity-review file is not a regular non-symbolic file.".into());
    }
    let canonical_path = fs::canonicalize(&path)
        .map_err(|error| format!("The continuity-review file could not be verified: {error}"))?;
    canonical_path.strip_prefix(&root).map_err(|_| {
        "The continuity-review file resolves outside the selected project.".to_string()
    })?;
    let current = fs::read_to_string(&canonical_path)
        .map_err(|error| format!("The continuity-review file could not be read: {error}"))?;
    if current != expected_text {
        return Err(
            "The continuity-review file changed after creation, so Undo will not remove it.".into(),
        );
    }
    fs::remove_file(&canonical_path)
        .map_err(|error| format!("The continuity-review file could not be removed: {error}"))?;
    sync_directory(&root);
    Ok(())
}

fn validate_expected_text(text: &str) -> Result<(), String> {
    if text.len() > MAX_CONTINUITY_REVIEW_BYTES {
        Err("The expected continuity-review source exceeds the 5 MiB mutation limit.".into())
    } else {
        Ok(())
    }
}

fn validate_continuity_review_text(text: &str) -> Result<(), String> {
    if text.len() > MAX_CONTINUITY_REVIEW_BYTES {
        return Err("The continuity-review file exceeds the 5 MiB mutation limit.".into());
    }
    let value: serde_json::Value = serde_json::from_str(text).map_err(|error| {
        format!("The proposed continuity-review file is not valid JSON: {error}")
    })?;
    let object = value
        .as_object()
        .ok_or_else(|| "The proposed continuity-review file must be a JSON object.".to_string())?;
    if object.get("format").and_then(serde_json::Value::as_str)
        != Some("200-crappy-words/continuity-review")
    {
        return Err(
            "The proposed continuity-review file has the wrong format discriminator.".into(),
        );
    }
    if object
        .get("formatVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(1)
    {
        return Err("The proposed continuity-review file must use format version 1.".into());
    }
    if !object
        .get("projectId")
        .is_some_and(serde_json::Value::is_string)
    {
        return Err("The proposed continuity-review file must identify its world project.".into());
    }
    if !object
        .get("exceptions")
        .is_some_and(serde_json::Value::is_array)
    {
        return Err("The proposed continuity-review file must contain an exceptions array.".into());
    }
    Ok(())
}

#[cfg(unix)]
fn create_temporary(root: &Path) -> Result<(PathBuf, fs::File), String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "The system clock could not produce a temporary filename.".to_string())?
        .as_nanos();
    for attempt in 0..16 {
        let path = root.join(format!(
            ".{CONTINUITY_REVIEW_FILE}.tmp-{}-{nonce}-{attempt}",
            std::process::id()
        ));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "A temporary continuity-review file could not be created: {error}"
                ))
            }
        }
    }
    Err("A unique temporary continuity-review file path could not be created.".into())
}

fn sync_directory(path: &Path) {
    if let Ok(directory) = fs::File::open(path) {
        let _ = directory.sync_all();
    }
}

#[cfg(test)]
mod tests {
    use super::{
        create_continuity_review_file_new_impl, remove_continuity_review_file_if_exact_impl,
        replace_continuity_review_file_atomic_impl, CONTINUITY_REVIEW_FILE,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static SEQUENCE: AtomicU64 = AtomicU64::new(0);

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "ministry-of-elsewhere-continuity-review-{}-{nonce}-{}",
                std::process::id(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).expect("fixture root");
            Self(path)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn text(marker: &str) -> String {
        format!(
            "{}\n",
            format_args!(
                r#"{{"format":"200-crappy-words/continuity-review","formatVersion":1,"projectId":"7848b5c8-4b08-4bc2-912e-c74c7ec8b001","exceptions":[],"marker":"{marker}"}}"#
            )
        )
    }

    #[test]
    fn creates_once_without_clobbering() {
        let fixture = Fixture::new();
        let first = text("first");
        create_continuity_review_file_new_impl(&fixture.0, &first).expect("create");
        let collision = create_continuity_review_file_new_impl(&fixture.0, &text("second"))
            .expect_err("collision");
        assert!(collision.contains("already exists"));
        assert_eq!(
            fs::read_to_string(fixture.0.join(CONTINUITY_REVIEW_FILE)).unwrap(),
            first
        );
    }

    #[test]
    fn replaces_only_the_exact_expected_source() {
        let fixture = Fixture::new();
        let first = text("first");
        let second = text("second");
        fs::write(fixture.0.join(CONTINUITY_REVIEW_FILE), &first).expect("source");
        replace_continuity_review_file_atomic_impl(&fixture.0, &first, &second).expect("replace");
        assert_eq!(
            fs::read_to_string(fixture.0.join(CONTINUITY_REVIEW_FILE)).unwrap(),
            second
        );
        let stale = replace_continuity_review_file_atomic_impl(&fixture.0, &first, &text("third"))
            .expect_err("stale");
        assert!(stale.contains("changed after preview"));
    }

    #[test]
    fn removes_only_the_exact_created_source() {
        let fixture = Fixture::new();
        let first = text("first");
        fs::write(fixture.0.join(CONTINUITY_REVIEW_FILE), &first).expect("source");
        let stale = remove_continuity_review_file_if_exact_impl(&fixture.0, &text("other"))
            .expect_err("stale");
        assert!(stale.contains("will not remove"));
        assert!(fixture.0.join(CONTINUITY_REVIEW_FILE).exists());
        remove_continuity_review_file_if_exact_impl(&fixture.0, &first).expect("remove");
        assert!(!fixture.0.join(CONTINUITY_REVIEW_FILE).exists());
    }

    #[test]
    fn validates_the_narrow_json_envelope() {
        let fixture = Fixture::new();
        let invalid =
            create_continuity_review_file_new_impl(&fixture.0, "{}").expect_err("invalid envelope");
        assert!(invalid.contains("format discriminator"));
        assert!(!fixture.0.join(CONTINUITY_REVIEW_FILE).exists());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symbolic_sources() {
        use std::os::unix::fs::symlink;

        let fixture = Fixture::new();
        let target = fixture.0.join("target.json");
        let first = text("first");
        fs::write(&target, &first).expect("target");
        symlink(&target, fixture.0.join(CONTINUITY_REVIEW_FILE)).expect("symlink");
        let error = replace_continuity_review_file_atomic_impl(&fixture.0, &first, &text("second"))
            .expect_err("symbolic");
        assert!(error.contains("regular non-symbolic"));
        assert_eq!(fs::read_to_string(target).unwrap(), first);
    }
}
