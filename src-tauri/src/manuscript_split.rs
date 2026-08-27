use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_fs::FsExt;

const MANUSCRIPT_STRUCTURE_FILE: &str = "200-crappy-words.manuscripts.json";
const MAX_MANUSCRIPT_FILE_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SceneSplitTransactionOutcome {
    cleanup_warnings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SceneSplitRequest {
    root_path: String,
    source_relative: String,
    destination_relative: String,
    expected_source_text: String,
    left_source_text: String,
    right_source_text: String,
    expected_structure_text: String,
    new_structure_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SceneSplitUndoRequest {
    root_path: String,
    source_relative: String,
    destination_relative: String,
    expected_left_source_text: String,
    expected_right_source_text: String,
    restored_source_text: String,
    expected_structure_text: String,
    restored_structure_text: String,
}

#[tauri::command]
pub(crate) fn split_manuscript_scene_atomic(
    app: tauri::AppHandle,
    request: SceneSplitRequest,
) -> Result<SceneSplitTransactionOutcome, String> {
    let canonical_root = scoped_root(
        &app,
        &request.root_path,
        &request.source_relative,
        &request.destination_relative,
    )?;
    split_manuscript_scene_atomic_impl(
        &canonical_root,
        &SceneSplitOperation {
            source_relative: Path::new(&request.source_relative),
            destination_relative: Path::new(&request.destination_relative),
            expected_source_text: &request.expected_source_text,
            left_source_text: &request.left_source_text,
            right_source_text: &request.right_source_text,
            expected_structure_text: &request.expected_structure_text,
            new_structure_text: &request.new_structure_text,
        },
        SplitFailpoint::None,
    )
}

#[tauri::command]
pub(crate) fn undo_manuscript_scene_split_atomic(
    app: tauri::AppHandle,
    request: SceneSplitUndoRequest,
) -> Result<SceneSplitTransactionOutcome, String> {
    let canonical_root = scoped_root(
        &app,
        &request.root_path,
        &request.source_relative,
        &request.destination_relative,
    )?;
    undo_manuscript_scene_split_atomic_impl(
        &canonical_root,
        &SceneSplitUndoOperation {
            source_relative: Path::new(&request.source_relative),
            destination_relative: Path::new(&request.destination_relative),
            expected_left_source_text: &request.expected_left_source_text,
            expected_right_source_text: &request.expected_right_source_text,
            restored_source_text: &request.restored_source_text,
            expected_structure_text: &request.expected_structure_text,
            restored_structure_text: &request.restored_structure_text,
        },
        SplitFailpoint::None,
    )
}

fn scoped_root(
    app: &tauri::AppHandle,
    root_path: &str,
    source_relative: &str,
    destination_relative: &str,
) -> Result<PathBuf, String> {
    let canonical_root = fs::canonicalize(root_path)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let source_path = canonical_root.join(source_relative);
    let destination_path = canonical_root.join(destination_relative);
    let structure_path = canonical_root.join(MANUSCRIPT_STRUCTURE_FILE);
    let scope = app.fs_scope();
    if !scope.is_allowed(&canonical_root)
        || !scope.is_allowed(&source_path)
        || !scope.is_allowed(&destination_path)
        || !scope.is_allowed(&structure_path)
    {
        return Err("The scene-split paths are outside the filesystem scope granted by the native folder picker.".into());
    }
    Ok(canonical_root)
}

struct SceneSplitOperation<'a> {
    source_relative: &'a Path,
    destination_relative: &'a Path,
    expected_source_text: &'a str,
    left_source_text: &'a str,
    right_source_text: &'a str,
    expected_structure_text: &'a str,
    new_structure_text: &'a str,
}

struct SceneSplitUndoOperation<'a> {
    source_relative: &'a Path,
    destination_relative: &'a Path,
    expected_left_source_text: &'a str,
    expected_right_source_text: &'a str,
    restored_source_text: &'a str,
    expected_structure_text: &'a str,
    restored_structure_text: &'a str,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SplitFailpoint {
    None,
    AfterDestination,
    AfterSource,
    AfterStructure,
}

#[cfg(unix)]
fn split_manuscript_scene_atomic_impl(
    root_path: &Path,
    operation: &SceneSplitOperation<'_>,
    failpoint: SplitFailpoint,
) -> Result<SceneSplitTransactionOutcome, String> {
    validate_relative_markdown_path(operation.source_relative)?;
    validate_relative_markdown_path(operation.destination_relative)?;
    if operation.source_relative == operation.destination_relative {
        return Err("The original and new scene paths must be different.".into());
    }
    validate_text_limit(operation.expected_source_text, "original scene")?;
    validate_text_limit(operation.left_source_text, "left scene")?;
    validate_text_limit(operation.right_source_text, "right scene")?;
    if format!(
        "{}{}",
        operation.left_source_text, operation.right_source_text
    ) != operation.expected_source_text
    {
        return Err(
            "The proposed scene halves do not exactly reconstruct the original source.".into(),
        );
    }
    if operation.left_source_text.trim().is_empty() || operation.right_source_text.trim().is_empty()
    {
        return Err("Both split scene files must contain non-whitespace prose.".into());
    }
    validate_structure_replacement(
        operation.expected_structure_text,
        operation.new_structure_text,
    )?;

    let canonical_root = canonical_project_root(root_path)?;
    let source_path = verified_regular_relative_file(
        &canonical_root,
        operation.source_relative,
        "The original scene",
    )?;
    let structure_path = verified_structure_file(&canonical_root)?;
    let destination_path =
        verified_absent_destination(&canonical_root, operation.destination_relative)?;
    require_exact_text(
        &source_path,
        operation.expected_source_text,
        "The original scene changed after preview; nothing was written.",
    )?;
    require_exact_text(
        &structure_path,
        operation.expected_structure_text,
        "The manuscript structure changed after preview; nothing was written.",
    )?;

    let staged_source = stage_replacement(&source_path, operation.left_source_text, "scene-left")?;
    let staged_structure = stage_replacement(
        &structure_path,
        operation.new_structure_text,
        "scene-structure",
    )?;
    let mut source_backup = create_backup_link(&source_path, "scene-source-backup")?;
    let mut structure_backup = create_backup_link(&structure_path, "scene-structure-backup")?;

    create_new_file_like(&destination_path, operation.right_source_text, &source_path)?;
    let mut source_replaced = false;
    let mut structure_replaced = false;

    let commit = (|| -> Result<(), String> {
        fail_if(failpoint, SplitFailpoint::AfterDestination)?;
        fs::rename(staged_source.path(), &source_path).map_err(|error| {
            format!("The left scene could not be atomically installed: {error}")
        })?;
        source_replaced = true;
        fail_if(failpoint, SplitFailpoint::AfterSource)?;
        fs::rename(staged_structure.path(), &structure_path).map_err(|error| {
            format!("The manuscript structure could not be atomically installed: {error}")
        })?;
        structure_replaced = true;
        fail_if(failpoint, SplitFailpoint::AfterStructure)?;
        require_exact_text(
            &source_path,
            operation.left_source_text,
            "The installed left scene did not match the approved split.",
        )?;
        require_exact_text(
            &destination_path,
            operation.right_source_text,
            "The installed right scene did not match the approved split.",
        )?;
        require_exact_text(
            &structure_path,
            operation.new_structure_text,
            "The installed manuscript structure did not match the approved split.",
        )?;
        Ok(())
    })();

    if let Err(primary) = commit {
        let rollback = rollback_split(
            &source_path,
            &structure_path,
            &destination_path,
            source_replaced,
            structure_replaced,
            &mut source_backup,
            &mut structure_backup,
        );
        return Err(format_transaction_failure(
            primary,
            rollback,
            destination_path.exists(),
        ));
    }

    sync_parent(&source_path);
    sync_parent(&structure_path);
    let cleanup_warnings = cleanup_backups(&mut source_backup, &mut structure_backup);
    Ok(SceneSplitTransactionOutcome { cleanup_warnings })
}

#[cfg(not(unix))]
fn split_manuscript_scene_atomic_impl(
    _root_path: &Path,
    _operation: &SceneSplitOperation<'_>,
    _failpoint: SplitFailpoint,
) -> Result<SceneSplitTransactionOutcome, String> {
    Err("Atomic scene splitting is not yet available on this operating system.".into())
}

#[cfg(unix)]
fn undo_manuscript_scene_split_atomic_impl(
    root_path: &Path,
    operation: &SceneSplitUndoOperation<'_>,
    failpoint: SplitFailpoint,
) -> Result<SceneSplitTransactionOutcome, String> {
    validate_relative_markdown_path(operation.source_relative)?;
    validate_relative_markdown_path(operation.destination_relative)?;
    if operation.source_relative == operation.destination_relative {
        return Err("The split scene paths must be different.".into());
    }
    validate_text_limit(operation.expected_left_source_text, "left scene")?;
    validate_text_limit(operation.expected_right_source_text, "right scene")?;
    validate_text_limit(operation.restored_source_text, "restored scene")?;
    if format!(
        "{}{}",
        operation.expected_left_source_text, operation.expected_right_source_text
    ) != operation.restored_source_text
    {
        return Err(
            "The split scene files do not exactly reconstruct the approved original source.".into(),
        );
    }
    validate_structure_replacement(
        operation.expected_structure_text,
        operation.restored_structure_text,
    )?;

    let canonical_root = canonical_project_root(root_path)?;
    let source_path = verified_regular_relative_file(
        &canonical_root,
        operation.source_relative,
        "The left scene",
    )?;
    let destination_path = verified_regular_relative_file(
        &canonical_root,
        operation.destination_relative,
        "The right scene",
    )?;
    let structure_path = verified_structure_file(&canonical_root)?;
    require_exact_text(
        &source_path,
        operation.expected_left_source_text,
        "Undo is no longer safe because the left scene changed.",
    )?;
    require_exact_text(
        &destination_path,
        operation.expected_right_source_text,
        "Undo is no longer safe because the right scene changed.",
    )?;
    require_exact_text(
        &structure_path,
        operation.expected_structure_text,
        "Undo is no longer safe because the manuscript structure changed.",
    )?;

    let staged_source =
        stage_replacement(&source_path, operation.restored_source_text, "scene-undo")?;
    let staged_structure = stage_replacement(
        &structure_path,
        operation.restored_structure_text,
        "scene-undo-structure",
    )?;
    let mut source_backup = create_backup_link(&source_path, "scene-undo-source-backup")?;
    let mut structure_backup = create_backup_link(&structure_path, "scene-undo-structure-backup")?;
    let mut source_replaced = false;
    let mut structure_replaced = false;

    let commit = (|| -> Result<(), String> {
        fail_if(failpoint, SplitFailpoint::AfterDestination)?;
        fs::rename(staged_source.path(), &source_path).map_err(|error| {
            format!("The original scene could not be atomically restored: {error}")
        })?;
        source_replaced = true;
        fail_if(failpoint, SplitFailpoint::AfterSource)?;
        fs::rename(staged_structure.path(), &structure_path).map_err(|error| {
            format!("The original structure could not be atomically restored: {error}")
        })?;
        structure_replaced = true;
        fail_if(failpoint, SplitFailpoint::AfterStructure)?;
        require_exact_text(
            &source_path,
            operation.restored_source_text,
            "The restored scene did not match its approved original text.",
        )?;
        require_exact_text(
            &structure_path,
            operation.restored_structure_text,
            "The restored structure did not match its approved original text.",
        )?;
        fs::remove_file(&destination_path)
            .map_err(|error| format!("The unchanged right scene could not be removed: {error}"))?;
        Ok(())
    })();

    if let Err(primary) = commit {
        let rollback = rollback_undo(
            &source_path,
            &structure_path,
            source_replaced,
            structure_replaced,
            &mut source_backup,
            &mut structure_backup,
        );
        return Err(format_transaction_failure(
            primary,
            rollback,
            destination_path.exists(),
        ));
    }

    sync_parent(&source_path);
    sync_parent(&structure_path);
    let cleanup_warnings = cleanup_backups(&mut source_backup, &mut structure_backup);
    Ok(SceneSplitTransactionOutcome { cleanup_warnings })
}

#[cfg(not(unix))]
fn undo_manuscript_scene_split_atomic_impl(
    _root_path: &Path,
    _operation: &SceneSplitUndoOperation<'_>,
    _failpoint: SplitFailpoint,
) -> Result<SceneSplitTransactionOutcome, String> {
    Err("Atomic scene-split Undo is not yet available on this operating system.".into())
}

#[cfg(unix)]
fn rollback_split(
    source_path: &Path,
    structure_path: &Path,
    destination_path: &Path,
    source_replaced: bool,
    structure_replaced: bool,
    source_backup: &mut TempArtifact,
    structure_backup: &mut TempArtifact,
) -> Vec<String> {
    let mut errors = Vec::new();
    if structure_replaced {
        if let Err(error) = fs::rename(structure_backup.path(), structure_path) {
            structure_backup.preserve();
            errors.push(format!("structure rollback failed: {error}"));
        }
    }
    if source_replaced {
        if let Err(error) = fs::rename(source_backup.path(), source_path) {
            source_backup.preserve();
            errors.push(format!("source rollback failed: {error}"));
        }
    }
    if errors.is_empty() {
        if let Err(error) = fs::remove_file(destination_path) {
            errors.push(format!("new-scene cleanup failed: {error}"));
        }
    }
    errors
}

#[cfg(unix)]
fn rollback_undo(
    source_path: &Path,
    structure_path: &Path,
    source_replaced: bool,
    structure_replaced: bool,
    source_backup: &mut TempArtifact,
    structure_backup: &mut TempArtifact,
) -> Vec<String> {
    let mut errors = Vec::new();
    if structure_replaced {
        if let Err(error) = fs::rename(structure_backup.path(), structure_path) {
            structure_backup.preserve();
            errors.push(format!("structure rollback failed: {error}"));
        }
    }
    if source_replaced {
        if let Err(error) = fs::rename(source_backup.path(), source_path) {
            source_backup.preserve();
            errors.push(format!("source rollback failed: {error}"));
        }
    }
    errors
}

fn canonical_project_root(root_path: &Path) -> Result<PathBuf, String> {
    fs::canonicalize(root_path)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))
}

fn verified_structure_file(root: &Path) -> Result<PathBuf, String> {
    let path = root.join(MANUSCRIPT_STRUCTURE_FILE);
    verified_regular_file(root, &path, "The manuscript structure")
}

fn verified_regular_relative_file(
    root: &Path,
    relative: &Path,
    label: &str,
) -> Result<PathBuf, String> {
    validate_relative_markdown_path(relative)?;
    verified_regular_file(root, &root.join(relative), label)
}

fn verified_regular_file(root: &Path, path: &Path, label: &str) -> Result<PathBuf, String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|error| format!("{label} is unavailable: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!("{label} is not a regular non-symbolic file."));
    }
    let canonical = fs::canonicalize(path)
        .map_err(|error| format!("{label} could not be verified: {error}"))?;
    canonical
        .strip_prefix(root)
        .map_err(|_| format!("{label} resolves outside the selected project."))?;
    Ok(canonical)
}

fn verified_absent_destination(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    validate_relative_markdown_path(relative)?;
    let requested = root.join(relative);
    let parent = requested
        .parent()
        .ok_or_else(|| "The new scene has no containing folder.".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("The new scene folder is unavailable: {error}"))?;
    canonical_parent
        .strip_prefix(root)
        .map_err(|_| "The new scene folder resolves outside the selected project.".to_string())?;
    let filename = requested
        .file_name()
        .ok_or_else(|| "The new scene filename is missing.".to_string())?;
    let destination = canonical_parent.join(filename);
    match fs::symlink_metadata(&destination) {
        Ok(_) => Err("The new scene destination already exists; nothing was written.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(destination),
        Err(error) => Err(format!(
            "The new scene destination could not be checked safely: {error}"
        )),
    }
}

fn validate_relative_markdown_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err("Scene paths must be non-empty and project-relative.".into());
    }
    for component in path.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(
                "Scene paths cannot contain current, parent, root, or prefix segments.".into(),
            );
        }
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case("md") && !extension.eq_ignore_ascii_case("markdown") {
        return Err("Scene split supports only .md and .markdown files.".into());
    }
    Ok(())
}

fn validate_text_limit(text: &str, label: &str) -> Result<(), String> {
    if text.len() > MAX_MANUSCRIPT_FILE_BYTES {
        return Err(format!("The {label} exceeds the 10 MiB transaction limit."));
    }
    Ok(())
}

fn validate_structure_replacement(expected: &str, replacement: &str) -> Result<(), String> {
    validate_text_limit(expected, "existing manuscript structure")?;
    validate_text_limit(replacement, "replacement manuscript structure")?;
    validate_structure_json(expected)?;
    validate_structure_json(replacement)
}

fn validate_structure_json(text: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(text)
        .map_err(|error| format!("The manuscript structure is not valid JSON: {error}"))?;
    let object = value
        .as_object()
        .ok_or_else(|| "The manuscript structure must be a JSON object.".to_string())?;
    if object
        .get("formatVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(1)
    {
        return Err("The manuscript structure must use format version 1.".into());
    }
    if !object
        .get("manuscripts")
        .is_some_and(serde_json::Value::is_array)
    {
        return Err("The manuscript structure must contain a manuscripts array.".into());
    }
    Ok(())
}

fn require_exact_text(path: &Path, expected: &str, message: &str) -> Result<(), String> {
    let current =
        fs::read_to_string(path).map_err(|error| format!("{message} Read failed: {error}"))?;
    if current != expected {
        return Err(message.into());
    }
    Ok(())
}

struct TempArtifact {
    path: PathBuf,
    preserve: bool,
}

impl TempArtifact {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            preserve: false,
        }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn preserve(&mut self) {
        self.preserve = true;
    }

    fn cleanup(&mut self) -> Result<(), String> {
        match fs::remove_file(&self.path) {
            Ok(()) => {
                self.preserve = true;
                Ok(())
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                self.preserve = true;
                Ok(())
            }
            Err(error) => {
                self.preserve = true;
                Err(format!("{}: {error}", self.path.display()))
            }
        }
    }
}

impl Drop for TempArtifact {
    fn drop(&mut self) {
        if !self.preserve {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn stage_replacement(path: &Path, text: &str, label: &str) -> Result<TempArtifact, String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("The {label} path has no parent."))?;
    let permissions = fs::metadata(path)
        .map_err(|error| format!("The {label} permissions could not be read: {error}"))?
        .permissions();
    let (temp_path, mut file) = create_unique_file(parent, label)?;
    let artifact = TempArtifact::new(temp_path.clone());
    file.write_all(text.as_bytes())
        .map_err(|error| format!("The {label} replacement could not be staged: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("The {label} replacement could not be synchronized: {error}"))?;
    fs::set_permissions(&temp_path, permissions)
        .map_err(|error| format!("The {label} permissions could not be retained: {error}"))?;
    drop(file);
    require_exact_text(
        &temp_path,
        text,
        "A staged scene-split replacement did not match.",
    )?;
    Ok(artifact)
}

fn create_backup_link(path: &Path, label: &str) -> Result<TempArtifact, String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("The {label} path has no parent."))?;
    let backup_path = unique_absent_path(parent, label)?;
    fs::hard_link(path, &backup_path)
        .map_err(|error| format!("The exact {label} could not be prepared: {error}"))?;
    verify_same_file(path, &backup_path)?;
    Ok(TempArtifact::new(backup_path))
}

fn create_new_file_like(path: &Path, text: &str, source_path: &Path) -> Result<(), String> {
    let permissions = fs::metadata(source_path)
        .map_err(|error| format!("The original scene permissions could not be read: {error}"))?
        .permissions();
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| {
            format!("The new scene could not be created without overwriting: {error}")
        })?;
    if let Err(error) = (|| -> Result<(), String> {
        file.write_all(text.as_bytes())
            .map_err(|cause| format!("The new scene could not be written: {cause}"))?;
        file.sync_all()
            .map_err(|cause| format!("The new scene could not be synchronized: {cause}"))?;
        fs::set_permissions(path, permissions)
            .map_err(|cause| format!("The new scene permissions could not be retained: {cause}"))?;
        drop(file);
        require_exact_text(
            path,
            text,
            "The new scene did not match the approved right-hand prose.",
        )
    })() {
        let cleanup = fs::remove_file(path);
        return Err(match cleanup {
            Ok(()) => error,
            Err(cleanup_error) => {
                format!("{error} The incomplete destination could not be removed: {cleanup_error}")
            }
        });
    }
    Ok(())
}

fn create_unique_file(parent: &Path, label: &str) -> Result<(PathBuf, fs::File), String> {
    for attempt in 0..16 {
        let path = unique_path(parent, label, attempt)?;
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "A transaction staging file could not be created: {error}"
                ))
            }
        }
    }
    Err("A unique transaction staging path could not be created.".into())
}

fn unique_absent_path(parent: &Path, label: &str) -> Result<PathBuf, String> {
    for attempt in 0..16 {
        let path = unique_path(parent, label, attempt)?;
        match fs::symlink_metadata(&path) {
            Ok(_) => continue,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(path),
            Err(error) => {
                return Err(format!(
                    "A transaction backup path could not be checked: {error}"
                ))
            }
        }
    }
    Err("A unique transaction backup path could not be created.".into())
}

fn unique_path(parent: &Path, label: &str, attempt: u8) -> Result<PathBuf, String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "The system clock could not produce a transaction filename.".to_string())?
        .as_nanos();
    Ok(parent.join(format!(
        ".200-crappy-words-{label}-{}-{nonce}-{attempt}",
        std::process::id()
    )))
}

#[cfg(unix)]
fn verify_same_file(source: &Path, target: &Path) -> Result<(), String> {
    use std::os::unix::fs::MetadataExt;
    let source_metadata = fs::symlink_metadata(source)
        .map_err(|error| format!("A transaction source could not be rechecked: {error}"))?;
    let target_metadata = fs::symlink_metadata(target)
        .map_err(|error| format!("A transaction backup could not be rechecked: {error}"))?;
    if source_metadata.file_type().is_symlink()
        || target_metadata.file_type().is_symlink()
        || source_metadata.dev() != target_metadata.dev()
        || source_metadata.ino() != target_metadata.ino()
    {
        return Err("A transaction backup did not identify the same regular file.".into());
    }
    Ok(())
}

fn cleanup_backups(
    source_backup: &mut TempArtifact,
    structure_backup: &mut TempArtifact,
) -> Vec<String> {
    let mut warnings = Vec::new();
    if let Err(error) = source_backup.cleanup() {
        warnings.push(format!(
            "The old source backup could not be cleaned up: {error}"
        ));
    }
    if let Err(error) = structure_backup.cleanup() {
        warnings.push(format!(
            "The old structure backup could not be cleaned up: {error}"
        ));
    }
    warnings
}

fn fail_if(actual: SplitFailpoint, expected: SplitFailpoint) -> Result<(), String> {
    if actual == expected {
        Err(format!(
            "Injected transaction failure at {}.",
            failpoint_name(actual)
        ))
    } else {
        Ok(())
    }
}

fn failpoint_name(value: SplitFailpoint) -> &'static str {
    match value {
        SplitFailpoint::None => "none",
        SplitFailpoint::AfterDestination => "after destination creation",
        SplitFailpoint::AfterSource => "after source replacement",
        SplitFailpoint::AfterStructure => "after structure replacement",
    }
}

fn format_transaction_failure(
    primary: String,
    rollback: Vec<String>,
    destination_exists: bool,
) -> String {
    if rollback.is_empty() {
        return format!("The scene split was rolled back exactly after an error: {primary}");
    }
    format!(
        "The scene split failed and needs review. {primary} Rollback problems: {}. The new scene path {} present.",
        rollback.join("; "),
        if destination_exists { "is" } else { "is not" }
    )
}

fn sync_parent(path: &Path) {
    if let Some(parent) = path.parent() {
        if let Ok(directory) = fs::File::open(parent) {
            let _ = directory.sync_all();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    const ORIGINAL_SOURCE: &str = "Left half.\n\nRight half.\n";
    const LEFT_SOURCE: &str = "Left half.\n\n";
    const RIGHT_SOURCE: &str = "Right half.\n";
    const ORIGINAL_STRUCTURE: &str =
        "{\"formatVersion\":1,\"manuscripts\":[],\"state\":\"before\"}\n";
    const NEW_STRUCTURE: &str =
        "{\n  \"formatVersion\": 1,\n  \"manuscripts\": [],\n  \"state\": \"after\"\n}\n";

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "two-hundred-crappy-words-split-{}-{nonce}-{}",
                std::process::id(),
                FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            fs::create_dir(path.join("Manuscript")).unwrap();
            fs::write(path.join("Manuscript/scene.md"), ORIGINAL_SOURCE).unwrap();
            fs::write(path.join(MANUSCRIPT_STRUCTURE_FILE), ORIGINAL_STRUCTURE).unwrap();
            Self(path)
        }

        fn split_operation(&self) -> SceneSplitOperation<'static> {
            SceneSplitOperation {
                source_relative: Path::new("Manuscript/scene.md"),
                destination_relative: Path::new("Manuscript/scene-part-2.md"),
                expected_source_text: ORIGINAL_SOURCE,
                left_source_text: LEFT_SOURCE,
                right_source_text: RIGHT_SOURCE,
                expected_structure_text: ORIGINAL_STRUCTURE,
                new_structure_text: NEW_STRUCTURE,
            }
        }

        fn undo_operation(&self) -> SceneSplitUndoOperation<'static> {
            SceneSplitUndoOperation {
                source_relative: Path::new("Manuscript/scene.md"),
                destination_relative: Path::new("Manuscript/scene-part-2.md"),
                expected_left_source_text: LEFT_SOURCE,
                expected_right_source_text: RIGHT_SOURCE,
                restored_source_text: ORIGINAL_SOURCE,
                expected_structure_text: NEW_STRUCTURE,
                restored_structure_text: ORIGINAL_STRUCTURE,
            }
        }

        fn assert_original(&self) {
            assert_eq!(
                fs::read_to_string(self.0.join("Manuscript/scene.md")).unwrap(),
                ORIGINAL_SOURCE
            );
            assert!(!self.0.join("Manuscript/scene-part-2.md").exists());
            assert_eq!(
                fs::read_to_string(self.0.join(MANUSCRIPT_STRUCTURE_FILE)).unwrap(),
                ORIGINAL_STRUCTURE
            );
            assert_no_transaction_artifacts(&self.0);
        }

        fn assert_split(&self) {
            assert_eq!(
                fs::read_to_string(self.0.join("Manuscript/scene.md")).unwrap(),
                LEFT_SOURCE
            );
            assert_eq!(
                fs::read_to_string(self.0.join("Manuscript/scene-part-2.md")).unwrap(),
                RIGHT_SOURCE
            );
            assert_eq!(
                fs::read_to_string(self.0.join(MANUSCRIPT_STRUCTURE_FILE)).unwrap(),
                NEW_STRUCTURE
            );
            assert_no_transaction_artifacts(&self.0);
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn splits_and_undoes_all_three_paths_exactly() {
        let fixture = Fixture::new();
        let split = split_manuscript_scene_atomic_impl(
            &fixture.0,
            &fixture.split_operation(),
            SplitFailpoint::None,
        )
        .unwrap();
        assert!(split.cleanup_warnings.is_empty());
        fixture.assert_split();

        let undone = undo_manuscript_scene_split_atomic_impl(
            &fixture.0,
            &fixture.undo_operation(),
            SplitFailpoint::None,
        )
        .unwrap();
        assert!(undone.cleanup_warnings.is_empty());
        fixture.assert_original();
    }

    #[test]
    fn refuses_stale_source_structure_destination_and_non_reconstructing_halves() {
        let fixture = Fixture::new();
        fs::write(fixture.0.join("Manuscript/scene.md"), "changed").unwrap();
        assert!(split_manuscript_scene_atomic_impl(
            &fixture.0,
            &fixture.split_operation(),
            SplitFailpoint::None
        )
        .unwrap_err()
        .contains("original scene changed"));
        fs::write(fixture.0.join("Manuscript/scene.md"), ORIGINAL_SOURCE).unwrap();

        fs::write(fixture.0.join(MANUSCRIPT_STRUCTURE_FILE), NEW_STRUCTURE).unwrap();
        assert!(split_manuscript_scene_atomic_impl(
            &fixture.0,
            &fixture.split_operation(),
            SplitFailpoint::None
        )
        .unwrap_err()
        .contains("structure changed"));
        fs::write(
            fixture.0.join(MANUSCRIPT_STRUCTURE_FILE),
            ORIGINAL_STRUCTURE,
        )
        .unwrap();

        fs::write(fixture.0.join("Manuscript/scene-part-2.md"), "occupied").unwrap();
        assert!(split_manuscript_scene_atomic_impl(
            &fixture.0,
            &fixture.split_operation(),
            SplitFailpoint::None
        )
        .unwrap_err()
        .contains("already exists"));
        assert_eq!(
            fs::read_to_string(fixture.0.join("Manuscript/scene-part-2.md")).unwrap(),
            "occupied"
        );
        fs::remove_file(fixture.0.join("Manuscript/scene-part-2.md")).unwrap();

        let mut bad = fixture.split_operation();
        bad.left_source_text = "not the left half";
        assert!(
            split_manuscript_scene_atomic_impl(&fixture.0, &bad, SplitFailpoint::None)
                .unwrap_err()
                .contains("do not exactly reconstruct")
        );
        fixture.assert_original();
    }

    #[test]
    fn rolls_back_failures_after_every_split_commit_phase() {
        for failpoint in [
            SplitFailpoint::AfterDestination,
            SplitFailpoint::AfterSource,
            SplitFailpoint::AfterStructure,
        ] {
            let fixture = Fixture::new();
            let error = split_manuscript_scene_atomic_impl(
                &fixture.0,
                &fixture.split_operation(),
                failpoint,
            )
            .unwrap_err();
            assert!(error.contains("rolled back exactly"), "{error}");
            fixture.assert_original();
        }
    }

    #[test]
    fn refuses_changed_split_files_before_undo_and_rolls_back_interrupted_undo() {
        for changed in ["left", "right", "structure"] {
            let fixture = Fixture::new();
            split_manuscript_scene_atomic_impl(
                &fixture.0,
                &fixture.split_operation(),
                SplitFailpoint::None,
            )
            .unwrap();
            match changed {
                "left" => fs::write(fixture.0.join("Manuscript/scene.md"), "changed").unwrap(),
                "right" => {
                    fs::write(fixture.0.join("Manuscript/scene-part-2.md"), "changed").unwrap()
                }
                _ => fs::write(
                    fixture.0.join(MANUSCRIPT_STRUCTURE_FILE),
                    ORIGINAL_STRUCTURE,
                )
                .unwrap(),
            }
            assert!(undo_manuscript_scene_split_atomic_impl(
                &fixture.0,
                &fixture.undo_operation(),
                SplitFailpoint::None,
            )
            .unwrap_err()
            .contains("Undo is no longer safe"));
        }

        for failpoint in [SplitFailpoint::AfterSource, SplitFailpoint::AfterStructure] {
            let fixture = Fixture::new();
            split_manuscript_scene_atomic_impl(
                &fixture.0,
                &fixture.split_operation(),
                SplitFailpoint::None,
            )
            .unwrap();
            let error = undo_manuscript_scene_split_atomic_impl(
                &fixture.0,
                &fixture.undo_operation(),
                failpoint,
            )
            .unwrap_err();
            assert!(error.contains("rolled back exactly"), "{error}");
            fixture.assert_split();
        }
    }

    fn assert_no_transaction_artifacts(root: &Path) {
        for directory in [root.to_path_buf(), root.join("Manuscript")] {
            assert!(fs::read_dir(directory).unwrap().all(|entry| {
                !entry
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".200-crappy-words-")
            }));
        }
    }
}
