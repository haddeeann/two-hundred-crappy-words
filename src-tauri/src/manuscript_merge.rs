use crate::manuscript_split::{
    canonical_project_root, create_backup_link, require_exact_text, stage_replacement, sync_parent,
    validate_relative_markdown_path, validate_structure_replacement, validate_text_limit,
    verified_regular_file, verified_regular_relative_file, verified_structure_file,
    verify_same_file, TempArtifact, MANUSCRIPT_STRUCTURE_FILE,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri_plugin_fs::FsExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SceneMergeTransactionOutcome {
    cleanup_warnings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SceneMergeRequest {
    root_path: String,
    left_relative: String,
    right_relative: String,
    retired_relative: String,
    expected_left_text: String,
    expected_right_text: String,
    inserted_boundary: String,
    merged_left_text: String,
    expected_structure_text: String,
    new_structure_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SceneMergeUndoRequest {
    root_path: String,
    left_relative: String,
    right_relative: String,
    retired_relative: String,
    expected_merged_left_text: String,
    restored_left_text: String,
    restored_right_text: String,
    inserted_boundary: String,
    expected_structure_text: String,
    restored_structure_text: String,
}

#[tauri::command]
pub(crate) fn merge_manuscript_scenes_atomic(
    app: tauri::AppHandle,
    request: SceneMergeRequest,
) -> Result<SceneMergeTransactionOutcome, String> {
    let canonical_root = scoped_root(
        &app,
        &request.root_path,
        &[
            &request.left_relative,
            &request.right_relative,
            &request.retired_relative,
        ],
    )?;
    merge_manuscript_scenes_atomic_impl(
        &canonical_root,
        &SceneMergeOperation {
            left_relative: Path::new(&request.left_relative),
            right_relative: Path::new(&request.right_relative),
            retired_relative: Path::new(&request.retired_relative),
            expected_left_text: &request.expected_left_text,
            expected_right_text: &request.expected_right_text,
            inserted_boundary: &request.inserted_boundary,
            merged_left_text: &request.merged_left_text,
            expected_structure_text: &request.expected_structure_text,
            new_structure_text: &request.new_structure_text,
        },
        MergeFailpoint::None,
    )
}

#[tauri::command]
pub(crate) fn undo_manuscript_scene_merge_atomic(
    app: tauri::AppHandle,
    request: SceneMergeUndoRequest,
) -> Result<SceneMergeTransactionOutcome, String> {
    let canonical_root = scoped_root(
        &app,
        &request.root_path,
        &[
            &request.left_relative,
            &request.right_relative,
            &request.retired_relative,
        ],
    )?;
    undo_manuscript_scene_merge_atomic_impl(
        &canonical_root,
        &SceneMergeUndoOperation {
            left_relative: Path::new(&request.left_relative),
            right_relative: Path::new(&request.right_relative),
            retired_relative: Path::new(&request.retired_relative),
            expected_merged_left_text: &request.expected_merged_left_text,
            restored_left_text: &request.restored_left_text,
            restored_right_text: &request.restored_right_text,
            inserted_boundary: &request.inserted_boundary,
            expected_structure_text: &request.expected_structure_text,
            restored_structure_text: &request.restored_structure_text,
        },
        MergeFailpoint::None,
    )
}

fn scoped_root(
    app: &tauri::AppHandle,
    root_path: &str,
    relative_paths: &[&str],
) -> Result<PathBuf, String> {
    let canonical_root = fs::canonicalize(root_path)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let scope = app.fs_scope();
    let structure_path = canonical_root.join(MANUSCRIPT_STRUCTURE_FILE);
    if !scope.is_allowed(&canonical_root)
        || !scope.is_allowed(&structure_path)
        || relative_paths
            .iter()
            .any(|relative| !scope.is_allowed(canonical_root.join(relative)))
    {
        return Err("The scene-merge paths are outside the filesystem scope granted by the native folder picker.".into());
    }
    Ok(canonical_root)
}

struct SceneMergeOperation<'a> {
    left_relative: &'a Path,
    right_relative: &'a Path,
    retired_relative: &'a Path,
    expected_left_text: &'a str,
    expected_right_text: &'a str,
    inserted_boundary: &'a str,
    merged_left_text: &'a str,
    expected_structure_text: &'a str,
    new_structure_text: &'a str,
}

struct SceneMergeUndoOperation<'a> {
    left_relative: &'a Path,
    right_relative: &'a Path,
    retired_relative: &'a Path,
    expected_merged_left_text: &'a str,
    restored_left_text: &'a str,
    restored_right_text: &'a str,
    inserted_boundary: &'a str,
    expected_structure_text: &'a str,
    restored_structure_text: &'a str,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum MergeFailpoint {
    None,
    AfterRetirementLink,
    AfterLeft,
    AfterStructure,
}

#[cfg(unix)]
fn merge_manuscript_scenes_atomic_impl(
    root_path: &Path,
    operation: &SceneMergeOperation<'_>,
    failpoint: MergeFailpoint,
) -> Result<SceneMergeTransactionOutcome, String> {
    validate_merge_paths(
        operation.left_relative,
        operation.right_relative,
        operation.retired_relative,
    )?;
    validate_merge_texts(
        operation.expected_left_text,
        operation.expected_right_text,
        operation.inserted_boundary,
        operation.merged_left_text,
    )?;
    validate_structure_replacement(
        operation.expected_structure_text,
        operation.new_structure_text,
    )?;

    let canonical_root = canonical_project_root(root_path)?;
    let left_path = verified_regular_relative_file(
        &canonical_root,
        operation.left_relative,
        "The surviving scene",
    )?;
    let right_path = verified_regular_relative_file(
        &canonical_root,
        operation.right_relative,
        "The retiring scene",
    )?;
    let retired_path = verified_absent_retired_path(&canonical_root, operation.retired_relative)?;
    let structure_path = verified_structure_file(&canonical_root)?;
    require_exact_text(
        &left_path,
        operation.expected_left_text,
        "The surviving scene changed after preview; nothing was written.",
    )?;
    require_exact_text(
        &right_path,
        operation.expected_right_text,
        "The retiring scene changed after preview; nothing was written.",
    )?;
    require_exact_text(
        &structure_path,
        operation.expected_structure_text,
        "The manuscript structure changed after preview; nothing was written.",
    )?;

    let staged_left = stage_replacement(&left_path, operation.merged_left_text, "merge-left")?;
    let staged_structure = stage_replacement(
        &structure_path,
        operation.new_structure_text,
        "merge-structure",
    )?;
    let mut left_backup = create_backup_link(&left_path, "merge-left-backup")?;
    let mut structure_backup = create_backup_link(&structure_path, "merge-structure-backup")?;
    fs::hard_link(&right_path, &retired_path).map_err(|error| {
        format!("The retired source could not be created without overwriting: {error}")
    })?;
    if let Err(error) = verify_same_file(&right_path, &retired_path) {
        let cleanup = fs::remove_file(&retired_path);
        return Err(format_cleanup_error(error, cleanup, "retired source"));
    }

    let mut left_replaced = false;
    let mut structure_replaced = false;
    let commit = (|| -> Result<(), String> {
        fail_if(failpoint, MergeFailpoint::AfterRetirementLink)?;
        fs::rename(staged_left.path(), &left_path).map_err(|error| {
            format!("The merged scene could not be atomically installed: {error}")
        })?;
        left_replaced = true;
        fail_if(failpoint, MergeFailpoint::AfterLeft)?;
        fs::rename(staged_structure.path(), &structure_path).map_err(|error| {
            format!("The merged manuscript structure could not be atomically installed: {error}")
        })?;
        structure_replaced = true;
        fail_if(failpoint, MergeFailpoint::AfterStructure)?;
        require_exact_text(
            &left_path,
            operation.merged_left_text,
            "The installed merged scene did not match the approved prose.",
        )?;
        require_exact_text(
            &retired_path,
            operation.expected_right_text,
            "The retired source did not preserve the exact right scene.",
        )?;
        require_exact_text(
            &structure_path,
            operation.new_structure_text,
            "The installed manuscript structure did not match the approved merge.",
        )?;
        verify_same_file(&right_path, &retired_path)?;
        fs::remove_file(&right_path).map_err(|error| {
            format!("The retiring scene's original name could not be removed: {error}")
        })?;
        Ok(())
    })();

    if let Err(primary) = commit {
        let rollback = rollback_merge(
            MergePaths {
                left: &left_path,
                structure: &structure_path,
                right: &right_path,
                retired: &retired_path,
            },
            left_replaced,
            structure_replaced,
            &mut left_backup,
            &mut structure_backup,
        );
        return Err(format_transaction_failure("scene merge", primary, rollback));
    }

    sync_parent(&left_path);
    sync_parent(&structure_path);
    let cleanup_warnings = cleanup_backups(&mut left_backup, &mut structure_backup);
    Ok(SceneMergeTransactionOutcome { cleanup_warnings })
}

#[cfg(not(unix))]
fn merge_manuscript_scenes_atomic_impl(
    _root_path: &Path,
    _operation: &SceneMergeOperation<'_>,
    _failpoint: MergeFailpoint,
) -> Result<SceneMergeTransactionOutcome, String> {
    Err("Atomic scene merging is not yet available on this operating system.".into())
}

#[cfg(unix)]
fn undo_manuscript_scene_merge_atomic_impl(
    root_path: &Path,
    operation: &SceneMergeUndoOperation<'_>,
    failpoint: MergeFailpoint,
) -> Result<SceneMergeTransactionOutcome, String> {
    validate_merge_paths(
        operation.left_relative,
        operation.right_relative,
        operation.retired_relative,
    )?;
    validate_merge_texts(
        operation.restored_left_text,
        operation.restored_right_text,
        operation.inserted_boundary,
        operation.expected_merged_left_text,
    )?;
    validate_structure_replacement(
        operation.expected_structure_text,
        operation.restored_structure_text,
    )?;

    let canonical_root = canonical_project_root(root_path)?;
    let left_path = verified_regular_relative_file(
        &canonical_root,
        operation.left_relative,
        "The merged scene",
    )?;
    let retired_path = verified_regular_retired_file(
        &canonical_root,
        operation.retired_relative,
        "The retired scene source",
    )?;
    let right_path = verified_absent_markdown_path(&canonical_root, operation.right_relative)?;
    let structure_path = verified_structure_file(&canonical_root)?;
    require_exact_text(
        &left_path,
        operation.expected_merged_left_text,
        "Undo is no longer safe because the merged scene changed.",
    )?;
    require_exact_text(
        &retired_path,
        operation.restored_right_text,
        "Undo is no longer safe because the retired scene source changed.",
    )?;
    require_exact_text(
        &structure_path,
        operation.expected_structure_text,
        "Undo is no longer safe because the manuscript structure changed.",
    )?;

    let staged_left =
        stage_replacement(&left_path, operation.restored_left_text, "merge-undo-left")?;
    let staged_structure = stage_replacement(
        &structure_path,
        operation.restored_structure_text,
        "merge-undo-structure",
    )?;
    let mut left_backup = create_backup_link(&left_path, "merge-undo-left-backup")?;
    let mut structure_backup = create_backup_link(&structure_path, "merge-undo-structure-backup")?;
    fs::hard_link(&retired_path, &right_path).map_err(|error| {
        format!("The original right scene could not be restored without overwriting: {error}")
    })?;
    if let Err(error) = verify_same_file(&retired_path, &right_path) {
        let cleanup = fs::remove_file(&right_path);
        return Err(format_cleanup_error(error, cleanup, "restored right scene"));
    }

    let mut left_replaced = false;
    let mut structure_replaced = false;
    let commit = (|| -> Result<(), String> {
        fail_if(failpoint, MergeFailpoint::AfterRetirementLink)?;
        fs::rename(staged_left.path(), &left_path).map_err(|error| {
            format!("The original left scene could not be atomically restored: {error}")
        })?;
        left_replaced = true;
        fail_if(failpoint, MergeFailpoint::AfterLeft)?;
        fs::rename(staged_structure.path(), &structure_path).map_err(|error| {
            format!("The original manuscript structure could not be atomically restored: {error}")
        })?;
        structure_replaced = true;
        fail_if(failpoint, MergeFailpoint::AfterStructure)?;
        require_exact_text(
            &left_path,
            operation.restored_left_text,
            "The restored left scene did not match its approved original text.",
        )?;
        require_exact_text(
            &right_path,
            operation.restored_right_text,
            "The restored right scene did not match its approved original text.",
        )?;
        require_exact_text(
            &structure_path,
            operation.restored_structure_text,
            "The restored structure did not match its approved original text.",
        )?;
        verify_same_file(&retired_path, &right_path)?;
        fs::remove_file(&retired_path).map_err(|error| {
            format!("The unchanged retired source could not be removed: {error}")
        })?;
        Ok(())
    })();

    if let Err(primary) = commit {
        let rollback = rollback_undo(
            MergePaths {
                left: &left_path,
                structure: &structure_path,
                right: &right_path,
                retired: &retired_path,
            },
            left_replaced,
            structure_replaced,
            &mut left_backup,
            &mut structure_backup,
        );
        return Err(format_transaction_failure(
            "scene-merge Undo",
            primary,
            rollback,
        ));
    }

    sync_parent(&left_path);
    sync_parent(&structure_path);
    let cleanup_warnings = cleanup_backups(&mut left_backup, &mut structure_backup);
    Ok(SceneMergeTransactionOutcome { cleanup_warnings })
}

#[cfg(not(unix))]
fn undo_manuscript_scene_merge_atomic_impl(
    _root_path: &Path,
    _operation: &SceneMergeUndoOperation<'_>,
    _failpoint: MergeFailpoint,
) -> Result<SceneMergeTransactionOutcome, String> {
    Err("Atomic scene-merge Undo is not yet available on this operating system.".into())
}

fn validate_merge_paths(left: &Path, right: &Path, retired: &Path) -> Result<(), String> {
    validate_relative_markdown_path(left)?;
    validate_relative_markdown_path(right)?;
    validate_relative_retired_path(retired)?;
    if left == right || left == retired || right == retired {
        return Err("The surviving, retiring, and retired source paths must be different.".into());
    }
    Ok(())
}

fn validate_merge_texts(
    left: &str,
    right: &str,
    boundary: &str,
    merged: &str,
) -> Result<(), String> {
    validate_text_limit(left, "left scene")?;
    validate_text_limit(right, "right scene")?;
    validate_text_limit(merged, "merged scene")?;
    if !matches!(boundary, "" | "\n" | "\n\n" | "\r\n" | "\r\n\r\n") {
        return Err("The merge boundary is not an approved exact or blank-line boundary.".into());
    }
    if format!("{left}{boundary}{right}") != merged {
        return Err(
            "The merged source does not exactly reconstruct both scenes and the approved boundary."
                .into(),
        );
    }
    if left.trim().is_empty() || right.trim().is_empty() {
        return Err("Both merged scenes must contain non-whitespace prose.".into());
    }
    Ok(())
}

fn validate_relative_retired_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err("The retired source path must be non-empty and project-relative.".into());
    }
    if path
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(
            "The retired source path cannot contain current, parent, root, or prefix segments."
                .into(),
        );
    }
    let path_text = path.to_string_lossy();
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let numbered = filename
        .rsplit_once(".retired-")
        .is_some_and(|(_, number)| number.parse::<u32>().is_ok_and(|value| value >= 2));
    if path_text.contains('\\') || (!filename.ends_with(".retired") && !numbered) {
        return Err(
            "The retired source must use a visible .retired or .retired-N filename.".into(),
        );
    }
    Ok(())
}

fn verified_absent_retired_path(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    validate_relative_retired_path(relative)?;
    verified_absent_path(root, relative, "retired source")
}

fn verified_absent_markdown_path(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    validate_relative_markdown_path(relative)?;
    verified_absent_path(root, relative, "restored right scene")
}

fn verified_absent_path(root: &Path, relative: &Path, label: &str) -> Result<PathBuf, String> {
    let requested = root.join(relative);
    let parent = requested
        .parent()
        .ok_or_else(|| format!("The {label} has no containing folder."))?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("The {label} folder is unavailable: {error}"))?;
    canonical_parent
        .strip_prefix(root)
        .map_err(|_| format!("The {label} folder resolves outside the selected project."))?;
    let filename = requested
        .file_name()
        .ok_or_else(|| format!("The {label} filename is missing."))?;
    let destination = canonical_parent.join(filename);
    match fs::symlink_metadata(&destination) {
        Ok(_) => Err(format!(
            "The {label} destination already exists; nothing was written."
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(destination),
        Err(error) => Err(format!(
            "The {label} destination could not be checked safely: {error}"
        )),
    }
}

fn verified_regular_retired_file(
    root: &Path,
    relative: &Path,
    label: &str,
) -> Result<PathBuf, String> {
    validate_relative_retired_path(relative)?;
    verified_regular_file(root, &root.join(relative), label)
}

#[cfg(unix)]
struct MergePaths<'a> {
    left: &'a Path,
    structure: &'a Path,
    right: &'a Path,
    retired: &'a Path,
}

#[cfg(unix)]
fn rollback_merge(
    paths: MergePaths<'_>,
    left_replaced: bool,
    structure_replaced: bool,
    left_backup: &mut TempArtifact,
    structure_backup: &mut TempArtifact,
) -> Vec<String> {
    let mut errors = rollback_replacements(
        paths.left,
        paths.structure,
        left_replaced,
        structure_replaced,
        left_backup,
        structure_backup,
    );
    if paths.right.exists() && paths.retired.exists() {
        if let Err(error) = verify_same_file(paths.right, paths.retired) {
            errors.push(format!(
                "retired-source rollback identity check failed: {error}"
            ));
        } else if let Err(error) = fs::remove_file(paths.retired) {
            errors.push(format!("retired-source rollback cleanup failed: {error}"));
        }
    }
    errors
}

#[cfg(unix)]
fn rollback_undo(
    paths: MergePaths<'_>,
    left_replaced: bool,
    structure_replaced: bool,
    left_backup: &mut TempArtifact,
    structure_backup: &mut TempArtifact,
) -> Vec<String> {
    let mut errors = rollback_replacements(
        paths.left,
        paths.structure,
        left_replaced,
        structure_replaced,
        left_backup,
        structure_backup,
    );
    if paths.right.exists() && paths.retired.exists() {
        if let Err(error) = verify_same_file(paths.right, paths.retired) {
            errors.push(format!(
                "restored-right rollback identity check failed: {error}"
            ));
        } else if let Err(error) = fs::remove_file(paths.right) {
            errors.push(format!("restored-right rollback cleanup failed: {error}"));
        }
    }
    errors
}

#[cfg(unix)]
fn rollback_replacements(
    left_path: &Path,
    structure_path: &Path,
    left_replaced: bool,
    structure_replaced: bool,
    left_backup: &mut TempArtifact,
    structure_backup: &mut TempArtifact,
) -> Vec<String> {
    let mut errors = Vec::new();
    if structure_replaced {
        if let Err(error) = fs::rename(structure_backup.path(), structure_path) {
            structure_backup.preserve();
            errors.push(format!("structure rollback failed: {error}"));
        }
    }
    if left_replaced {
        if let Err(error) = fs::rename(left_backup.path(), left_path) {
            left_backup.preserve();
            errors.push(format!("left-scene rollback failed: {error}"));
        }
    }
    errors
}

fn cleanup_backups(
    left_backup: &mut TempArtifact,
    structure_backup: &mut TempArtifact,
) -> Vec<String> {
    let mut warnings = Vec::new();
    if let Err(error) = left_backup.cleanup() {
        warnings.push(format!(
            "The old left-scene backup could not be cleaned up: {error}"
        ));
    }
    if let Err(error) = structure_backup.cleanup() {
        warnings.push(format!(
            "The old structure backup could not be cleaned up: {error}"
        ));
    }
    warnings
}

fn fail_if(actual: MergeFailpoint, expected: MergeFailpoint) -> Result<(), String> {
    if actual == expected {
        Err(format!(
            "Injected transaction failure at {}.",
            failpoint_name(actual)
        ))
    } else {
        Ok(())
    }
}

fn failpoint_name(value: MergeFailpoint) -> &'static str {
    match value {
        MergeFailpoint::None => "none",
        MergeFailpoint::AfterRetirementLink => "after no-clobber link creation",
        MergeFailpoint::AfterLeft => "after left-scene replacement",
        MergeFailpoint::AfterStructure => "after structure replacement",
    }
}

fn format_transaction_failure(label: &str, primary: String, rollback: Vec<String>) -> String {
    if rollback.is_empty() {
        format!("The {label} was rolled back exactly after an error: {primary}")
    } else {
        format!(
            "The {label} failed and needs review. {primary} Rollback problems: {}.",
            rollback.join("; ")
        )
    }
}

fn format_cleanup_error(primary: String, cleanup: std::io::Result<()>, label: &str) -> String {
    match cleanup {
        Ok(()) => format!("The {label} identity check failed and its new name was removed: {primary}"),
        Err(error) => format!("The {label} identity check failed and cleanup also failed: {primary}; cleanup: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    const LEFT: &str = "Left scene.";
    const RIGHT: &str = "Right scene.\n";
    const BOUNDARY: &str = "\n\n";
    const MERGED: &str = "Left scene.\n\nRight scene.\n";
    const BEFORE: &str = "{\"formatVersion\":1,\"manuscripts\":[],\"state\":\"before\"}\n";
    const AFTER: &str = "{\"formatVersion\":1,\"manuscripts\":[],\"state\":\"after\"}\n";

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "two-hundred-crappy-words-merge-{}-{nonce}-{}",
                std::process::id(),
                FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            fs::create_dir(path.join("Manuscript")).unwrap();
            fs::write(path.join("Manuscript/left.md"), LEFT).unwrap();
            fs::write(path.join("Manuscript/right.md"), RIGHT).unwrap();
            fs::write(path.join(MANUSCRIPT_STRUCTURE_FILE), BEFORE).unwrap();
            Self(path)
        }

        fn merge(&self) -> SceneMergeOperation<'static> {
            SceneMergeOperation {
                left_relative: Path::new("Manuscript/left.md"),
                right_relative: Path::new("Manuscript/right.md"),
                retired_relative: Path::new("Manuscript/right.md.retired"),
                expected_left_text: LEFT,
                expected_right_text: RIGHT,
                inserted_boundary: BOUNDARY,
                merged_left_text: MERGED,
                expected_structure_text: BEFORE,
                new_structure_text: AFTER,
            }
        }

        fn undo(&self) -> SceneMergeUndoOperation<'static> {
            SceneMergeUndoOperation {
                left_relative: Path::new("Manuscript/left.md"),
                right_relative: Path::new("Manuscript/right.md"),
                retired_relative: Path::new("Manuscript/right.md.retired"),
                expected_merged_left_text: MERGED,
                restored_left_text: LEFT,
                restored_right_text: RIGHT,
                inserted_boundary: BOUNDARY,
                expected_structure_text: AFTER,
                restored_structure_text: BEFORE,
            }
        }

        fn assert_original(&self) {
            assert_eq!(
                fs::read_to_string(self.0.join("Manuscript/left.md")).unwrap(),
                LEFT
            );
            assert_eq!(
                fs::read_to_string(self.0.join("Manuscript/right.md")).unwrap(),
                RIGHT
            );
            assert!(!self.0.join("Manuscript/right.md.retired").exists());
            assert_eq!(
                fs::read_to_string(self.0.join(MANUSCRIPT_STRUCTURE_FILE)).unwrap(),
                BEFORE
            );
            assert_no_artifacts(&self.0);
        }

        fn assert_merged(&self) {
            assert_eq!(
                fs::read_to_string(self.0.join("Manuscript/left.md")).unwrap(),
                MERGED
            );
            assert!(!self.0.join("Manuscript/right.md").exists());
            assert_eq!(
                fs::read_to_string(self.0.join("Manuscript/right.md.retired")).unwrap(),
                RIGHT
            );
            assert_eq!(
                fs::read_to_string(self.0.join(MANUSCRIPT_STRUCTURE_FILE)).unwrap(),
                AFTER
            );
            assert_no_artifacts(&self.0);
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn merges_and_undoes_all_paths_exactly() {
        let fixture = Fixture::new();
        merge_manuscript_scenes_atomic_impl(&fixture.0, &fixture.merge(), MergeFailpoint::None)
            .unwrap();
        fixture.assert_merged();
        undo_manuscript_scene_merge_atomic_impl(&fixture.0, &fixture.undo(), MergeFailpoint::None)
            .unwrap();
        fixture.assert_original();
    }

    #[test]
    fn refuses_stale_sources_structure_collision_and_invalid_reconstruction() {
        let fixture = Fixture::new();
        fs::write(fixture.0.join("Manuscript/right.md"), "changed").unwrap();
        assert!(merge_manuscript_scenes_atomic_impl(
            &fixture.0,
            &fixture.merge(),
            MergeFailpoint::None
        )
        .unwrap_err()
        .contains("retiring scene changed"));
        fs::write(fixture.0.join("Manuscript/right.md"), RIGHT).unwrap();
        fs::write(fixture.0.join("Manuscript/right.md.retired"), "occupied").unwrap();
        assert!(merge_manuscript_scenes_atomic_impl(
            &fixture.0,
            &fixture.merge(),
            MergeFailpoint::None
        )
        .unwrap_err()
        .contains("already exists"));
        fs::remove_file(fixture.0.join("Manuscript/right.md.retired")).unwrap();
        let mut bad = fixture.merge();
        bad.inserted_boundary = "invented";
        assert!(
            merge_manuscript_scenes_atomic_impl(&fixture.0, &bad, MergeFailpoint::None)
                .unwrap_err()
                .contains("boundary")
        );
        fixture.assert_original();
    }

    #[test]
    fn rolls_back_every_merge_commit_phase() {
        for failpoint in [
            MergeFailpoint::AfterRetirementLink,
            MergeFailpoint::AfterLeft,
            MergeFailpoint::AfterStructure,
        ] {
            let fixture = Fixture::new();
            let error =
                merge_manuscript_scenes_atomic_impl(&fixture.0, &fixture.merge(), failpoint)
                    .unwrap_err();
            assert!(error.contains("rolled back exactly"), "{error}");
            fixture.assert_original();
        }
    }

    #[test]
    fn guards_and_rolls_back_merge_undo() {
        for changed in ["left", "retired", "structure"] {
            let fixture = Fixture::new();
            merge_manuscript_scenes_atomic_impl(&fixture.0, &fixture.merge(), MergeFailpoint::None)
                .unwrap();
            match changed {
                "left" => fs::write(fixture.0.join("Manuscript/left.md"), "changed").unwrap(),
                "retired" => {
                    fs::write(fixture.0.join("Manuscript/right.md.retired"), "changed").unwrap()
                }
                _ => fs::write(fixture.0.join(MANUSCRIPT_STRUCTURE_FILE), BEFORE).unwrap(),
            }
            assert!(undo_manuscript_scene_merge_atomic_impl(
                &fixture.0,
                &fixture.undo(),
                MergeFailpoint::None
            )
            .unwrap_err()
            .contains("Undo is no longer safe"));
        }

        for failpoint in [
            MergeFailpoint::AfterRetirementLink,
            MergeFailpoint::AfterLeft,
            MergeFailpoint::AfterStructure,
        ] {
            let fixture = Fixture::new();
            merge_manuscript_scenes_atomic_impl(&fixture.0, &fixture.merge(), MergeFailpoint::None)
                .unwrap();
            let error =
                undo_manuscript_scene_merge_atomic_impl(&fixture.0, &fixture.undo(), failpoint)
                    .unwrap_err();
            assert!(error.contains("rolled back exactly"), "{error}");
            fixture.assert_merged();
        }
    }

    fn assert_no_artifacts(root: &Path) {
        fn visit(path: &Path) {
            for entry in fs::read_dir(path).unwrap() {
                let entry = entry.unwrap();
                let child = entry.path();
                if child.is_dir() {
                    visit(&child);
                } else {
                    assert!(!entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with(".200-crappy-words-"));
                }
            }
        }
        visit(root);
    }
}
