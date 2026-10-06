use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};
use tauri_plugin_fs::FsExt;

const MAPS_FILE: &str = "200-crappy-words.maps.json";
const MAX_MAPS_BYTES: usize = 5 * 1024 * 1024;
const MAX_MAP_IMAGE_BYTES: u64 = 50 * 1024 * 1024;
const MAPS_DIRECTORY: &str = "Maps";

#[tauri::command]
pub(crate) async fn read_map_image_preview(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<tauri::ipc::Response, String> {
    let source = PathBuf::from(source_path);
    if !app.fs_scope().is_allowed(&source) {
        return Err(
            "The selected image is outside the filesystem scope granted by the native picker."
                .into(),
        );
    }
    read_map_image_preview_impl(&source).map(tauri::ipc::Response::new)
}

#[tauri::command]
pub(crate) fn create_maps_file_new(
    app: tauri::AppHandle,
    root_path: String,
    new_text: String,
) -> Result<(), String> {
    let root = scoped_root(&app, &root_path)?;
    let path = root.join(MAPS_FILE);
    if !app.fs_scope().is_allowed(&path) {
        return Err(
            "The maps file is outside the filesystem scope granted by the native folder picker."
                .into(),
        );
    }
    create_maps_file_new_impl(&root, &new_text)
}

#[tauri::command]
pub(crate) fn replace_maps_file_atomic(
    app: tauri::AppHandle,
    root_path: String,
    expected_text: String,
    new_text: String,
) -> Result<(), String> {
    let root = scoped_root(&app, &root_path)?;
    let path = root.join(MAPS_FILE);
    if !app.fs_scope().is_allowed(&path) {
        return Err(
            "The maps file is outside the filesystem scope granted by the native folder picker."
                .into(),
        );
    }
    replace_maps_file_atomic_impl(&root, &expected_text, &new_text)
}

#[tauri::command]
pub(crate) fn remove_maps_file_if_exact(
    app: tauri::AppHandle,
    root_path: String,
    expected_text: String,
) -> Result<(), String> {
    let root = scoped_root(&app, &root_path)?;
    let path = root.join(MAPS_FILE);
    if !app.fs_scope().is_allowed(&path) {
        return Err(
            "The maps file is outside the filesystem scope granted by the native folder picker."
                .into(),
        );
    }
    remove_maps_file_if_exact_impl(&root, &expected_text)
}

#[tauri::command]
pub(crate) fn import_map_image_new(
    app: tauri::AppHandle,
    root_path: String,
    source_path: String,
    target_name: String,
    expected_sha256: String,
) -> Result<(), String> {
    let root = scoped_root(&app, &root_path)?;
    let source = PathBuf::from(source_path);
    let target = root.join(MAPS_DIRECTORY).join(&target_name);
    if !app.fs_scope().is_allowed(&source)
        || !app.fs_scope().is_allowed(&target)
        || !app.fs_scope().is_allowed(&root)
    {
        return Err(
            "The image import paths are outside the filesystem scope granted by the native picker."
                .into(),
        );
    }
    import_map_image_new_impl(&root, &source, &target_name, &expected_sha256)
}

#[tauri::command]
pub(crate) fn remove_imported_map_image_if_exact(
    app: tauri::AppHandle,
    root_path: String,
    target_name: String,
    expected_sha256: String,
) -> Result<(), String> {
    let root = scoped_root(&app, &root_path)?;
    let target = root.join(MAPS_DIRECTORY).join(&target_name);
    if !app.fs_scope().is_allowed(&target) || !app.fs_scope().is_allowed(&root) {
        return Err(
            "The imported image is outside the filesystem scope granted by the native picker."
                .into(),
        );
    }
    remove_imported_map_image_if_exact_impl(&root, &target_name, &expected_sha256)
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

fn read_map_image_preview_impl(source: &Path) -> Result<Vec<u8>, String> {
    let before = fs::symlink_metadata(source)
        .map_err(|error| format!("The selected map image is unavailable: {error}"))?;
    if before.file_type().is_symlink() || !before.is_file() {
        return Err("The selected map image must be a regular non-symbolic file.".into());
    }
    if before.len() > MAX_MAP_IMAGE_BYTES {
        return Err("The selected map image exceeds the 50 MiB preview limit.".into());
    }
    let bytes = fs::read(source)
        .map_err(|error| format!("The selected map image could not be read: {error}"))?;
    let after = fs::symlink_metadata(source)
        .map_err(|error| format!("The selected map image became unavailable: {error}"))?;
    if after.file_type().is_symlink()
        || !after.is_file()
        || before.len() != after.len()
        || after.len() != bytes.len() as u64
        || before.modified().ok() != after.modified().ok()
    {
        return Err(
            "The selected map image changed while it was read. Choose it again when stable.".into(),
        );
    }
    if bytes.len() as u64 > MAX_MAP_IMAGE_BYTES {
        return Err("The selected map image exceeds the 50 MiB preview limit.".into());
    }
    Ok(bytes)
}

fn create_maps_file_new_impl(root: &Path, new_text: &str) -> Result<(), String> {
    validate_maps_text(new_text)?;
    let root = fs::canonicalize(root)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let path = root.join(MAPS_FILE);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                "The maps file already exists; nothing was overwritten.".to_string()
            } else {
                format!("The maps file could not be created: {error}")
            }
        })?;
    let result = (|| {
        file.write_all(new_text.as_bytes())
            .map_err(|error| format!("The maps file could not be written: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("The maps file could not be synchronized: {error}"))?;
        drop(file);
        let written = fs::read_to_string(&path)
            .map_err(|error| format!("The new maps file could not be reread: {error}"))?;
        if written != new_text {
            return Err("The new maps file did not match the reviewed text.".into());
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
fn replace_maps_file_atomic_impl(
    root: &Path,
    expected_text: &str,
    new_text: &str,
) -> Result<(), String> {
    validate_maps_text(new_text)?;
    let root = fs::canonicalize(root)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let path = root.join(MAPS_FILE);
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("The maps file is unavailable: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("The maps file is not a regular non-symbolic file.".into());
    }
    let canonical_path = fs::canonicalize(&path)
        .map_err(|error| format!("The maps file could not be verified: {error}"))?;
    canonical_path
        .strip_prefix(&root)
        .map_err(|_| "The maps file resolves outside the selected project.".to_string())?;
    let current = fs::read_to_string(&canonical_path)
        .map_err(|error| format!("The maps file could not be read: {error}"))?;
    if current != expected_text {
        return Err("The maps file changed after preview; nothing was written.".into());
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
        fs::set_permissions(&temporary_path, metadata.permissions())
            .map_err(|error| format!("The maps-file permissions could not be retained: {error}"))?;
        drop(temporary);
        let staged = fs::read_to_string(&temporary_path)
            .map_err(|error| format!("The staged maps file could not be verified: {error}"))?;
        if staged != new_text {
            return Err("The staged maps file did not match the reviewed text.".into());
        }
        let rechecked = fs::read_to_string(&canonical_path)
            .map_err(|error| format!("The maps file could not be rechecked: {error}"))?;
        if rechecked != expected_text {
            return Err(
                "The maps file changed while replacement was staged; nothing was written.".into(),
            );
        }
        fs::rename(&temporary_path, &canonical_path)
            .map_err(|error| format!("The atomic maps-file replacement failed: {error}"))?;
        replaced = true;
        sync_directory(&root);
        let written = fs::read_to_string(&canonical_path).map_err(|error| {
            format!("The maps file was replaced but could not be reread: {error}")
        })?;
        if written != new_text {
            return Err("The maps file was replaced, but its reread did not match.".into());
        }
        Ok(())
    })();
    if !replaced {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

#[cfg(not(unix))]
fn replace_maps_file_atomic_impl(
    _root: &Path,
    _expected_text: &str,
    _new_text: &str,
) -> Result<(), String> {
    Err("Atomic maps-file replacement is not yet available on this operating system.".into())
}

fn remove_maps_file_if_exact_impl(root: &Path, expected_text: &str) -> Result<(), String> {
    let root = fs::canonicalize(root)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let path = root.join(MAPS_FILE);
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("The maps file is unavailable: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("The maps file is not a regular non-symbolic file.".into());
    }
    let current = fs::read_to_string(&path)
        .map_err(|error| format!("The maps file could not be read: {error}"))?;
    if current != expected_text {
        return Err("The maps file changed after creation, so Undo will not remove it.".into());
    }
    fs::remove_file(&path)
        .map_err(|error| format!("The maps file could not be removed: {error}"))?;
    sync_directory(&root);
    Ok(())
}

fn import_map_image_new_impl(
    root: &Path,
    source: &Path,
    target_name: &str,
    expected_sha256: &str,
) -> Result<(), String> {
    super::validate_portable_file_name(target_name)?;
    validate_image_file_name(target_name)?;
    validate_sha256(expected_sha256)?;
    let root = fs::canonicalize(root)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let source_metadata = fs::symlink_metadata(source)
        .map_err(|error| format!("The selected source image is unavailable: {error}"))?;
    if source_metadata.file_type().is_symlink() || !source_metadata.is_file() {
        return Err("The selected source image must be a regular non-symbolic file.".into());
    }
    if source_metadata.len() > MAX_MAP_IMAGE_BYTES {
        return Err("The selected source image exceeds the 50 MiB import limit.".into());
    }
    let source_bytes = fs::read(source)
        .map_err(|error| format!("The selected source image could not be read: {error}"))?;
    if source_bytes.len() as u64 > MAX_MAP_IMAGE_BYTES {
        return Err("The selected source image exceeds the 50 MiB import limit.".into());
    }
    if sha256_hex(&source_bytes) != expected_sha256 {
        return Err("The selected source image changed after preview; nothing was copied.".into());
    }

    let maps_directory = root.join(MAPS_DIRECTORY);
    let mut created_directory = false;
    match fs::symlink_metadata(&maps_directory) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err("Maps must be a regular non-symbolic directory.".into())
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&maps_directory)
                .map_err(|cause| format!("The Maps directory could not be created: {cause}"))?;
            created_directory = true;
        }
        Err(error) => {
            return Err(format!(
                "The Maps directory could not be inspected: {error}"
            ))
        }
    }
    let canonical_maps_directory = fs::canonicalize(&maps_directory)
        .map_err(|error| format!("The Maps directory could not be resolved: {error}"))?;
    if canonical_maps_directory != maps_directory {
        return Err("Maps must resolve directly inside the selected project.".into());
    }

    let target = maps_directory.join(target_name);
    let mut target_created = false;
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(|error| {
                if error.kind() == std::io::ErrorKind::AlreadyExists {
                    format!("Maps/{target_name} already exists; nothing was overwritten.")
                } else {
                    format!("The imported image could not be created: {error}")
                }
            })?;
        target_created = true;
        file.write_all(&source_bytes)
            .map_err(|error| format!("The imported image could not be written: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("The imported image could not be synchronized: {error}"))?;
        drop(file);
        let written = fs::read(&target)
            .map_err(|error| format!("The imported image could not be reread: {error}"))?;
        if written != source_bytes || sha256_hex(&written) != expected_sha256 {
            return Err("The imported image did not match the reviewed source bytes.".into());
        }
        sync_directory(&maps_directory);
        sync_directory(&root);
        Ok(())
    })();
    if result.is_err() && target_created {
        let _ = fs::remove_file(&target);
    }
    if result.is_err() && created_directory {
        let _ = fs::remove_dir(&maps_directory);
    }
    result
}

fn remove_imported_map_image_if_exact_impl(
    root: &Path,
    target_name: &str,
    expected_sha256: &str,
) -> Result<(), String> {
    super::validate_portable_file_name(target_name)?;
    validate_image_file_name(target_name)?;
    validate_sha256(expected_sha256)?;
    let root = fs::canonicalize(root)
        .map_err(|error| format!("The selected project root is unavailable: {error}"))?;
    let maps_directory = root.join(MAPS_DIRECTORY);
    let directory_metadata = fs::symlink_metadata(&maps_directory)
        .map_err(|error| format!("The Maps directory is unavailable for rollback: {error}"))?;
    if directory_metadata.file_type().is_symlink() || !directory_metadata.is_dir() {
        return Err("Maps is not a regular non-symbolic directory.".into());
    }
    let canonical_maps_directory = fs::canonicalize(&maps_directory)
        .map_err(|error| format!("The Maps directory could not be resolved: {error}"))?;
    if canonical_maps_directory != maps_directory {
        return Err("Maps must resolve directly inside the selected project.".into());
    }
    let target = maps_directory.join(target_name);
    let metadata = fs::symlink_metadata(&target)
        .map_err(|error| format!("The imported image is unavailable for rollback: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("The imported image is not a regular non-symbolic file.".into());
    }
    let bytes = fs::read(&target).map_err(|error| {
        format!("The imported image could not be verified for rollback: {error}")
    })?;
    if sha256_hex(&bytes) != expected_sha256 {
        return Err(
            "The imported image changed after copying, so rollback will not remove it.".into(),
        );
    }
    fs::remove_file(&target)
        .map_err(|error| format!("The imported image could not be rolled back: {error}"))?;
    sync_directory(&maps_directory);
    sync_directory(&root);
    Ok(())
}

fn validate_image_file_name(name: &str) -> Result<(), String> {
    let extension = Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp") {
        return Err("The imported map image name must end in .png, .jpg, .jpeg, or .webp.".into());
    }
    Ok(())
}

fn validate_sha256(value: &str) -> Result<(), String> {
    if value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err("The expected image digest must be 64 lowercase hexadecimal characters.".into())
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn validate_maps_text(text: &str) -> Result<(), String> {
    if text.len() > MAX_MAPS_BYTES {
        return Err("The maps file exceeds the 5 MiB mutation limit.".into());
    }
    let value: serde_json::Value = serde_json::from_str(text)
        .map_err(|error| format!("The proposed maps file is not valid JSON: {error}"))?;
    let object = value
        .as_object()
        .ok_or_else(|| "The proposed maps file must be a JSON object.".to_string())?;
    if object.get("format").and_then(serde_json::Value::as_str) != Some("200-crappy-words/maps") {
        return Err("The proposed maps file has the wrong format discriminator.".into());
    }
    if object
        .get("formatVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(1)
    {
        return Err("The proposed maps file must use format version 1.".into());
    }
    if !object
        .get("projectId")
        .is_some_and(serde_json::Value::is_string)
    {
        return Err("The proposed maps file must identify its world project.".into());
    }
    if !object.get("maps").is_some_and(serde_json::Value::is_array) {
        return Err("The proposed maps file must contain a maps array.".into());
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
            ".{MAPS_FILE}.tmp-{}-{nonce}-{attempt}",
            std::process::id()
        ));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "A temporary maps file could not be created: {error}"
                ))
            }
        }
    }
    Err("A unique temporary maps-file path could not be created.".into())
}

fn sync_directory(path: &Path) {
    if let Ok(directory) = fs::File::open(path) {
        let _ = directory.sync_all();
    }
}

#[cfg(test)]
mod tests {
    use super::{
        create_maps_file_new_impl, import_map_image_new_impl, read_map_image_preview_impl,
        remove_imported_map_image_if_exact_impl, remove_maps_file_if_exact_impl,
        replace_maps_file_atomic_impl, MAPS_FILE,
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
                "two-hundred-crappy-words-maps-{}-{nonce}-{}",
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
                r#"{{"format":"200-crappy-words/maps","formatVersion":1,"projectId":"7848b5c8-4b08-4bc2-912e-c74c7ec8b001","maps":[],"marker":"{marker}"}}"#
            )
        )
    }

    #[test]
    fn creates_once_without_clobbering() {
        let fixture = Fixture::new();
        let first = text("first");
        create_maps_file_new_impl(&fixture.0, &first).expect("create");
        let collision =
            create_maps_file_new_impl(&fixture.0, &text("second")).expect_err("collision");
        assert!(collision.contains("already exists"));
        assert_eq!(
            fs::read_to_string(fixture.0.join(MAPS_FILE)).unwrap(),
            first
        );
    }

    #[test]
    fn replaces_only_the_exact_expected_source() {
        let fixture = Fixture::new();
        let first = text("first");
        let second = text("second");
        fs::write(fixture.0.join(MAPS_FILE), &first).expect("source");
        replace_maps_file_atomic_impl(&fixture.0, &first, &second).expect("replace");
        assert_eq!(
            fs::read_to_string(fixture.0.join(MAPS_FILE)).unwrap(),
            second
        );
        let stale =
            replace_maps_file_atomic_impl(&fixture.0, &first, &text("third")).expect_err("stale");
        assert!(stale.contains("changed after preview"));
        assert_eq!(
            fs::read_to_string(fixture.0.join(MAPS_FILE)).unwrap(),
            second
        );
    }

    #[test]
    fn removes_only_the_exact_file_created_by_the_session() {
        let fixture = Fixture::new();
        let first = text("first");
        fs::write(fixture.0.join(MAPS_FILE), &first).expect("source");
        let stale = remove_maps_file_if_exact_impl(&fixture.0, &text("other")).expect_err("stale");
        assert!(stale.contains("will not remove"));
        assert!(fixture.0.join(MAPS_FILE).exists());
        remove_maps_file_if_exact_impl(&fixture.0, &first).expect("remove");
        assert!(!fixture.0.join(MAPS_FILE).exists());
    }

    #[test]
    fn imports_without_clobbering_and_rolls_back_only_exact_bytes() {
        let fixture = Fixture::new();
        let source = fixture.0.join("source.png");
        let bytes = b"static map bytes";
        fs::write(&source, bytes).expect("source");
        let digest = super::sha256_hex(bytes);
        import_map_image_new_impl(&fixture.0, &source, "system.png", &digest).expect("import");
        assert_eq!(fs::read(fixture.0.join("Maps/system.png")).unwrap(), bytes);
        let collision = import_map_image_new_impl(&fixture.0, &source, "system.png", &digest)
            .expect_err("collision");
        assert!(collision.contains("already exists"));

        fs::write(fixture.0.join("Maps/system.png"), b"changed").expect("change target");
        let stale = remove_imported_map_image_if_exact_impl(&fixture.0, "system.png", &digest)
            .expect_err("stale rollback");
        assert!(stale.contains("will not remove"));
        fs::write(fixture.0.join("Maps/system.png"), bytes).expect("restore target");
        remove_imported_map_image_if_exact_impl(&fixture.0, "system.png", &digest)
            .expect("rollback");
        assert!(!fixture.0.join("Maps/system.png").exists());
    }

    #[test]
    fn previews_only_bounded_regular_non_symbolic_images() {
        let fixture = Fixture::new();
        let source = fixture.0.join("source.png");
        fs::write(&source, b"static map bytes").expect("source");
        assert_eq!(
            read_map_image_preview_impl(&source).unwrap(),
            b"static map bytes"
        );

        let directory = fixture.0.join("directory.png");
        fs::create_dir(&directory).expect("directory");
        assert!(read_map_image_preview_impl(&directory)
            .expect_err("directory refused")
            .contains("regular non-symbolic"));

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&source, fixture.0.join("link.png")).expect("symlink");
            assert!(read_map_image_preview_impl(&fixture.0.join("link.png"))
                .expect_err("symlink refused")
                .contains("regular non-symbolic"));
        }
    }

    #[test]
    fn refuses_changed_source_and_invalid_target_before_copying() {
        let fixture = Fixture::new();
        let source = fixture.0.join("source.png");
        fs::write(&source, b"changed").expect("source");
        let stale = import_map_image_new_impl(
            &fixture.0,
            &source,
            "system.png",
            &super::sha256_hex(b"expected"),
        )
        .expect_err("changed source");
        assert!(stale.contains("changed after preview"));
        assert!(!fixture.0.join("Maps/system.png").exists());
        assert!(import_map_image_new_impl(
            &fixture.0,
            &source,
            "../system.png",
            &super::sha256_hex(b"changed"),
        )
        .is_err());
    }
}
