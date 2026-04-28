use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{copy, Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::Manager;
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

mod image_metadata;

fn get_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))
}

fn ensure_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = get_data_dir(app)?;
    fs::create_dir_all(data_dir.join("data"))
        .map_err(|e| format!("Failed to create data directory: {}", e))?;
    fs::create_dir_all(data_dir.join("media").join("characters"))
        .map_err(|e| format!("Failed to create media directory: {}", e))?;
    Ok(data_dir)
}

fn resolve_relative_path(relative_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(relative_path);
    if path.is_absolute() {
        return Err("Absolute paths are not allowed".to_string());
    }
    for component in path.components() {
        match component {
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err("Invalid path component".to_string());
            }
            _ => {}
        }
    }
    Ok(path)
}

fn validate_user_absolute_path(path: &str, field_name: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err(format!("{} cannot be empty", field_name));
    }
    let candidate = PathBuf::from(path);
    if !candidate.is_absolute() {
        return Err(format!("{} must be an absolute path", field_name));
    }
    Ok(candidate)
}

fn validate_external_image_source_path(path: &str) -> Result<PathBuf, String> {
    let source = validate_user_absolute_path(path, "Image path")?;
    if !source.exists() || !source.is_file() {
        return Err("Image file not found".to_string());
    }
    let extension = source
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .unwrap_or_default();
    if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif") {
        return Err("Unsupported image file type".to_string());
    }
    Ok(source)
}

fn mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
fn read_json_file(app: tauri::AppHandle, filename: String) -> Result<String, String> {
    let data_dir = ensure_data_dir(&app)?;
    let file_path = data_dir.join(resolve_relative_path(&filename)?);
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read {}: {}", filename, e))
}

#[tauri::command]
fn write_json_file(app: tauri::AppHandle, filename: String, content: String) -> Result<(), String> {
    let data_dir = ensure_data_dir(&app)?;
    let file_path = data_dir.join(resolve_relative_path(&filename)?);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    if filename.ends_with(".json") && serde_json::from_str::<Value>(&content).is_err() {
        if file_path.exists() {
            let broken = file_path.with_extension(format!(
                "broken-{}",
                Utc::now().format("%Y%m%d%H%M%S")
            ));
            let _ = fs::copy(&file_path, broken);
        }
        return Err(format!("Refusing to write invalid JSON to {}", filename));
    }
    let temp_path = file_path.with_extension(format!(
        "tmp-{}",
        Uuid::new_v4()
    ));
    fs::write(&temp_path, content).map_err(|e| format!("Failed to write temp file: {}", e))?;
    fs::rename(&temp_path, &file_path).map_err(|e| format!("Failed to replace {}: {}", filename, e))
}

#[tauri::command]
fn file_exists(app: tauri::AppHandle, filename: String) -> Result<bool, String> {
    let data_dir = ensure_data_dir(&app)?;
    Ok(data_dir.join(resolve_relative_path(&filename)?).exists())
}

#[tauri::command]
fn get_app_data_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(ensure_data_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn open_data_folder(app: tauri::AppHandle) -> Result<(), String> {
    let data_dir = ensure_data_dir(&app)?;
    tauri_plugin_opener::open_path(data_dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("Failed to open data folder: {}", e))
}

#[tauri::command]
fn copy_image_to_app_data(
    app: tauri::AppHandle,
    source_path: String,
    dest_filename: String,
) -> Result<(), String> {
    let source = validate_external_image_source_path(&source_path)?;
    let data_dir = ensure_data_dir(&app)?;
    let dest_path = data_dir.join(resolve_relative_path(&dest_filename)?);
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    fs::copy(&source, &dest_path)
        .map_err(|e| format!("Failed to copy image to app data: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_image_data_url(app: tauri::AppHandle, relative_path: String) -> Result<String, String> {
    let data_dir = ensure_data_dir(&app)?;
    let path = data_dir.join(resolve_relative_path(&relative_path)?);
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read image: {}", e))?;
    Ok(format!(
        "data:{};base64,{}",
        mime_for_path(&path),
        STANDARD.encode(bytes)
    ))
}

#[tauri::command]
fn get_external_image_data_url(absolute_path: String) -> Result<String, String> {
    let path = validate_external_image_source_path(&absolute_path)?;
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read image: {}", e))?;
    Ok(format!(
        "data:{};base64,{}",
        mime_for_path(&path),
        STANDARD.encode(bytes)
    ))
}

#[tauri::command]
fn generate_thumbnail(
    app: tauri::AppHandle,
    relative_path: String,
    thumbnail_path: String,
    force: bool,
) -> Result<String, String> {
    let data_dir = ensure_data_dir(&app)?;
    let source_path = data_dir.join(resolve_relative_path(&relative_path)?);
    let thumb_rel = resolve_relative_path(&thumbnail_path)?;
    let thumb_path = data_dir.join(&thumb_rel);
    if thumb_path.exists() && !force {
        return Ok(thumbnail_path);
    }
    if let Some(parent) = thumb_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create thumbnail directory: {}", e))?;
    }
    let img = image::open(&source_path).map_err(|e| format!("Failed to open image: {}", e))?;
    img.thumbnail(420, 420)
        .save_with_format(&thumb_path, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to save thumbnail: {}", e))?;
    Ok(thumbnail_path)
}

#[tauri::command]
fn delete_path(app: tauri::AppHandle, relative_path: String) -> Result<(), String> {
    let data_dir = ensure_data_dir(&app)?;
    let target = data_dir.join(resolve_relative_path(&relative_path)?);
    if !target.exists() {
        return Ok(());
    }
    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|e| format!("Failed to delete directory: {}", e))
    } else {
        fs::remove_file(&target).map_err(|e| format!("Failed to delete file: {}", e))
    }
}

#[tauri::command]
fn copy_app_data_file(
    app: tauri::AppHandle,
    source_relative_path: String,
    dest_relative_path: String,
) -> Result<(), String> {
    let data_dir = ensure_data_dir(&app)?;
    let source = data_dir.join(resolve_relative_path(&source_relative_path)?);
    let dest = data_dir.join(resolve_relative_path(&dest_relative_path)?);
    if !source.exists() || !source.is_file() {
        return Err(format!("Source file not found: {}", source_relative_path));
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    fs::copy(source, dest).map_err(|e| format!("Failed to copy app data file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn write_export_text_file(dest_path: String, content: String) -> Result<(), String> {
    let dest = validate_user_absolute_path(&dest_path, "Export destination path")?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create export directory: {}", e))?;
    }
    fs::write(&dest, content)
        .map_err(|e| format!("Failed to write export file {}: {}", dest.display(), e))
}

#[tauri::command]
fn extract_character_card_from_path(absolute_path: String) -> Result<image_metadata::CharacterCardMetadata, String> {
    let file_path = validate_external_image_source_path(&absolute_path)?;
    let extension = file_path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .unwrap_or_default();
    if extension != "png" {
        return Err("Character card import supports PNG files only".to_string());
    }
    image_metadata::extract_character_card_metadata(file_path)
}

fn validate_zip_entry_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("ZIP entry path cannot be empty".to_string());
    }
    resolve_relative_path(path).map(|_| ())
}

fn write_json_entry(
    writer: &mut zip::ZipWriter<fs::File>,
    path: &str,
    value: &Value,
    options: SimpleFileOptions,
) -> Result<(), String> {
    validate_zip_entry_path(path)?;
    writer
        .start_file(path, options)
        .map_err(|e| format!("Failed to start ZIP entry {}: {}", path, e))?;
    let content = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Failed to serialize {}: {}", path, e))?;
    writer
        .write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write ZIP entry {}: {}", path, e))
}

fn read_json_or_default(path: &Path, default: Value) -> Result<Value, String> {
    if !path.exists() {
        return Ok(default);
    }
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn stable_hash(value: &Value) -> String {
    fn canonicalize(value: &mut Value) {
        match value {
            Value::Object(obj) => {
                obj.remove("id");
                obj.remove("createdAt");
                obj.remove("updatedAt");
                for nested in obj.values_mut() {
                    canonicalize(nested);
                }
            }
            Value::Array(items) => {
                for item in items {
                    canonicalize(item);
                }
            }
            _ => {}
        }
    }

    let mut clone = value.clone();
    canonicalize(&mut clone);
    serde_json::to_string(&clone).unwrap_or_default()
}

fn value_id(value: &Value) -> Option<String> {
    value
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn set_string_field(value: &mut Value, field: &str, next: String) {
    if let Some(obj) = value.as_object_mut() {
        obj.insert(field.to_string(), Value::String(next));
    }
}

fn remap_character_ids(value: &mut Value, new_id: &str) {
    let now = Utc::now().to_rfc3339();
    let old_id = value_id(value).unwrap_or_default();
    set_string_field(value, "id", new_id.to_string());
    set_string_field(value, "createdAt", now.clone());
    set_string_field(value, "updatedAt", now);
    if let Some(title) = value.get("title").and_then(|v| v.as_str()) {
        set_string_field(value, "title", format!("{} Restored Copy", title));
    }

    for collection in ["scenes", "gallery", "compatibleModels", "tags"] {
        if let Some(items) = value.get_mut(collection).and_then(|v| v.as_array_mut()) {
            for item in items {
                set_string_field(item, "id", Uuid::new_v4().to_string());
                if collection == "gallery" {
                    for field in ["originalPath", "thumbnailPath"] {
                        if let Some(path) = item.get(field).and_then(|v| v.as_str()) {
                            set_string_field(item, field, path.replace(&old_id, new_id));
                        }
                    }
                }
            }
        }
    }
    if let Some(path) = value.get("previewImageId").and_then(|v| v.as_str()) {
        set_string_field(value, "previewImageId", path.replace(&old_id, new_id));
    }
}

#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RestoreSummary {
    imported: usize,
    skipped: usize,
    conflicts: usize,
    media_files: usize,
    missing_media: usize,
    collections_imported: usize,
    collections_skipped: usize,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PreflightSummary {
    valid: bool,
    app: Option<String>,
    export_type: String,
    schema_version: Option<u64>,
    created_at: Option<String>,
    character_count: usize,
    media_count: usize,
    import_count: usize,
    skipped_duplicates: usize,
    conflicts: usize,
    missing_media: usize,
    collection_count: usize,
    characters: Vec<String>,
    warnings: Vec<String>,
    errors: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct RestoreMediaCopy {
    source_path: String,
    dest_path: String,
}

#[derive(Clone, Debug)]
struct RestoreMergePlan {
    characters: Vec<Value>,
    summary: RestoreSummary,
    media_copies: Vec<RestoreMediaCopy>,
}

fn expected_media_paths(character: &Value) -> Vec<String> {
    let mut paths = Vec::new();
    if let Some(gallery) = character.get("gallery").and_then(|value| value.as_array()) {
        for image in gallery {
            for field in ["originalPath", "thumbnailPath"] {
                if let Some(path) = image.get(field).and_then(|value| value.as_str()) {
                    if !path.trim().is_empty() {
                        paths.push(path.to_string());
                    }
                }
            }
        }
    }
    paths.sort();
    paths.dedup();
    paths
}

fn validate_characterkeep_manifest(manifest: &Value) -> Result<(), String> {
    if manifest.get("app").and_then(|v| v.as_str()) != Some("CharacterKeep") {
        return Err("This is not a CharacterKeep backup".to_string());
    }
    let schema = manifest
        .get("backupSchemaVersion")
        .and_then(|value| value.as_u64())
        .unwrap_or(1);
    if schema != 1 {
        return Err(format!(
            "Unsupported CharacterKeep backup schema: {}",
            schema
        ));
    }
    Ok(())
}

fn plan_restore_merge(
    current: Vec<Value>,
    incoming: Vec<Value>,
    media_paths: &HashSet<String>,
) -> RestoreMergePlan {
    let mut merged = current;
    let mut hashes = HashSet::<String>::new();
    let mut id_to_hash = HashMap::<String, String>::new();
    let mut summary = RestoreSummary::default();
    let mut media_copies = Vec::<RestoreMediaCopy>::new();

    for character in &merged {
        let hash = stable_hash(character);
        hashes.insert(hash.clone());
        if let Some(id) = value_id(character) {
            id_to_hash.insert(id, hash);
        }
    }

    for mut character in incoming {
        let incoming_hash = stable_hash(&character);
        if hashes.contains(&incoming_hash) {
            summary.skipped += 1;
            continue;
        }

        let old_id = value_id(&character).unwrap_or_else(|| Uuid::new_v4().to_string());
        let expected_media = expected_media_paths(&character);
        let mut new_id = old_id.clone();

        if let Some(existing_hash) = id_to_hash.get(&old_id) {
            if existing_hash == &incoming_hash {
                summary.skipped += 1;
                continue;
            }
            new_id = Uuid::new_v4().to_string();
            remap_character_ids(&mut character, &new_id);
            summary.conflicts += 1;
        }

        let media_prefix = format!("media/characters/{}/", old_id);
        let imported_prefix = format!("media/characters/{}/", new_id);
        for source_path in expected_media {
            if media_paths.contains(&source_path) {
                media_copies.push(RestoreMediaCopy {
                    dest_path: source_path.replacen(&media_prefix, &imported_prefix, 1),
                    source_path,
                });
                summary.media_files += 1;
            } else {
                summary.missing_media += 1;
            }
        }

        let merged_hash = stable_hash(&character);
        hashes.insert(merged_hash.clone());
        if let Some(id) = value_id(&character) {
            id_to_hash.insert(id, merged_hash);
        }
        merged.push(character);
        summary.imported += 1;
    }

    RestoreMergePlan {
        characters: merged,
        summary,
        media_copies,
    }
}

fn collection_name(value: &Value) -> Option<String> {
    value
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
}

fn merge_collections(current: Vec<Value>, incoming: Vec<Value>, summary: &mut RestoreSummary) -> Vec<Value> {
    let mut merged = current;
    let mut ids = merged.iter().filter_map(value_id).collect::<HashSet<_>>();
    let mut names = merged.iter().filter_map(collection_name).collect::<HashSet<_>>();
    for collection in incoming {
        let id = value_id(&collection).unwrap_or_else(|| Uuid::new_v4().to_string());
        let name = collection_name(&collection);
        if ids.contains(&id) || name.as_ref().is_some_and(|n| names.contains(n)) {
            summary.collections_skipped += 1;
            continue;
        }
        ids.insert(id);
        if let Some(name) = name {
            names.insert(name);
        }
        merged.push(collection);
        summary.collections_imported += 1;
    }
    merged
}

#[tauri::command]
fn create_characterkeep_backup_zip(app: tauri::AppHandle, dest_path: String) -> Result<(), String> {
    let data_dir = ensure_data_dir(&app)?;
    let destination = validate_user_absolute_path(&dest_path, "Backup destination path")?;
    if destination.starts_with(&data_dir) {
        return Err("Please save the backup outside the app data directory".to_string());
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create backup directory: {}", e))?;
    }

    let characters = read_json_or_default(&data_dir.join("data/characters.json"), json!([]))?;
    let collections = read_json_or_default(&data_dir.join("data/collections.json"), json!([]))?;
    let settings = read_json_or_default(&data_dir.join("data/settings.json"), json!({}))?;
    let character_count = characters.as_array().map(|items| items.len()).unwrap_or(0);
    let collection_count = collections.as_array().map(|items| items.len()).unwrap_or(0);
    let media_root = data_dir.join("media");
    let media_count = if media_root.exists() {
        WalkDir::new(&media_root)
            .into_iter()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().is_file())
            .count()
    } else {
        0
    };

    let manifest = json!({
        "app": "CharacterKeep",
        "backupSchemaVersion": 1,
        "createdAt": Utc::now().to_rfc3339(),
        "characterCount": character_count,
        "collectionCount": collection_count,
        "mediaCount": media_count
    });

    let file =
        fs::File::create(&destination).map_err(|e| format!("Failed to create ZIP: {}", e))?;
    let mut writer = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    write_json_entry(&mut writer, "manifest.json", &manifest, options)?;
    write_json_entry(&mut writer, "settings.json", &settings, options)?;
    write_json_entry(&mut writer, "collections.json", &collections, options)?;
    if let Some(items) = characters.as_array() {
        for character in items {
            let id = value_id(character).unwrap_or_else(|| Uuid::new_v4().to_string());
            write_json_entry(
                &mut writer,
                &format!("characters/{}.json", id),
                character,
                options,
            )?;
        }
    }

    if media_root.exists() {
        for entry in WalkDir::new(&media_root)
            .into_iter()
            .filter_map(|entry| entry.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let source = entry.path();
            let relative = source
                .strip_prefix(&data_dir)
                .map_err(|e| format!("Failed to compute media path: {}", e))?;
            let path_in_zip = relative.to_string_lossy().replace('\\', "/");
            validate_zip_entry_path(&path_in_zip)?;
            writer
                .start_file(&path_in_zip, options)
                .map_err(|e| format!("Failed to add media to backup: {}", e))?;
            let mut input =
                fs::File::open(source).map_err(|e| format!("Failed to read media: {}", e))?;
            copy(&mut input, &mut writer).map_err(|e| format!("Failed to write media: {}", e))?;
        }
    }

    writer
        .finish()
        .map_err(|e| format!("Failed to finalize backup: {}", e))?;
    Ok(())
}

type BackupRead = (Value, Vec<Value>, Vec<Value>, HashMap<String, Vec<u8>>, HashSet<String>);

fn read_characterkeep_zip(source_path: &str) -> Result<BackupRead, String> {
    let source = validate_user_absolute_path(source_path, "Backup source path")?;
    let file = fs::File::open(&source).map_err(|e| format!("Failed to open backup ZIP: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid backup ZIP: {}", e))?;

    let mut manifest: Option<Value> = None;
    let mut incoming = Vec::<Value>::new();
    let mut incoming_collections = Vec::<Value>::new();
    let mut media = HashMap::<String, Vec<u8>>::new();
    let mut media_names = HashSet::<String>::new();

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|e| format!("Failed to read ZIP entry: {}", e))?;
        if file.is_dir() {
            continue;
        }
        let name = file
            .enclosed_name()
            .ok_or_else(|| "Backup contains an unsafe path".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|e| format!("Failed to read backup entry {}: {}", name, e))?;
        if name == "manifest.json" {
            manifest = Some(serde_json::from_slice(&bytes).map_err(|e| format!("Invalid manifest: {}", e))?);
        } else if name == "character.json" {
            incoming.push(serde_json::from_slice(&bytes).map_err(|e| format!("Invalid character JSON: {}", e))?);
        } else if name.starts_with("characters/") && name.ends_with(".json") {
            incoming.push(serde_json::from_slice(&bytes).map_err(|e| format!("Invalid character JSON: {}", e))?);
        } else if name == "collections.json" {
            let value: Value = serde_json::from_slice(&bytes).map_err(|e| format!("Invalid collections JSON: {}", e))?;
            incoming_collections = value.as_array().cloned().unwrap_or_default();
        } else if name.starts_with("media/") {
            validate_zip_entry_path(&name)?;
            media_names.insert(name.clone());
            media.insert(name, bytes);
        }
    }

    let manifest = manifest.ok_or_else(|| "This backup is missing manifest.json".to_string())?;
    validate_characterkeep_manifest(&manifest)?;
    Ok((manifest, incoming, incoming_collections, media, media_names))
}

#[tauri::command]
fn preflight_characterkeep_backup_zip(app: tauri::AppHandle, source_path: String) -> Result<PreflightSummary, String> {
    let data_dir = ensure_data_dir(&app)?;
    match read_characterkeep_zip(&source_path) {
        Ok((manifest, incoming, incoming_collections, _media, media_names)) => {
            let current_value = read_json_or_default(&data_dir.join("data/characters.json"), json!([]))?;
            let current = current_value.as_array().cloned().unwrap_or_default();
            let plan = plan_restore_merge(current, incoming.clone(), &media_names);
            let export_type = manifest
                .get("exportType")
                .and_then(|v| v.as_str())
                .unwrap_or("backup")
                .to_string();
            Ok(PreflightSummary {
                valid: true,
                app: manifest.get("app").and_then(|v| v.as_str()).map(|s| s.to_string()),
                export_type,
                schema_version: manifest.get("backupSchemaVersion").or_else(|| manifest.get("schemaVersion")).and_then(|v| v.as_u64()),
                created_at: manifest.get("createdAt").or_else(|| manifest.get("exportedAt")).and_then(|v| v.as_str()).map(|s| s.to_string()),
                character_count: incoming.len(),
                media_count: media_names.len(),
                import_count: plan.summary.imported,
                skipped_duplicates: plan.summary.skipped,
                conflicts: plan.summary.conflicts,
                missing_media: plan.summary.missing_media,
                collection_count: incoming_collections.len(),
                characters: incoming.iter().filter_map(|c| c.get("title").and_then(|v| v.as_str()).map(|s| s.to_string())).collect(),
                warnings: Vec::new(),
                errors: Vec::new(),
            })
        }
        Err(error) => Ok(PreflightSummary {
            valid: false,
            errors: vec![error],
            ..Default::default()
        }),
    }
}

#[tauri::command]
fn restore_characterkeep_backup_zip(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<RestoreSummary, String> {
    let (_manifest, incoming, incoming_collections, media, media_keys) = read_characterkeep_zip(&source_path)?;

    let data_dir = ensure_data_dir(&app)?;
    let characters_path = data_dir.join("data/characters.json");
    let collections_path = data_dir.join("data/collections.json");
    let current_value = read_json_or_default(&characters_path, json!([]))?;
    let current = current_value.as_array().cloned().unwrap_or_default();
    let mut plan = plan_restore_merge(current, incoming, &media_keys);
    let current_collections_value = read_json_or_default(&collections_path, json!([]))?;
    let current_collections = current_collections_value.as_array().cloned().unwrap_or_default();
    let merged_collections = merge_collections(current_collections, incoming_collections, &mut plan.summary);

    for copy_plan in &plan.media_copies {
        if let Some(bytes) = media.get(&copy_plan.source_path) {
            let dest = data_dir.join(resolve_relative_path(&copy_plan.dest_path)?);
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create media directory: {}", e))?;
            }
            fs::write(dest, bytes).map_err(|e| format!("Failed to restore media file: {}", e))?;
        }
    }

    fs::write(
        &characters_path,
        serde_json::to_string_pretty(&plan.characters).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Failed to save restored characters: {}", e))?;
    fs::write(
        &collections_path,
        serde_json::to_string_pretty(&merged_collections).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Failed to save restored collections: {}", e))?;
    Ok(plan.summary)
}

#[tauri::command]
fn export_characterkeep_character_zip(
    app: tauri::AppHandle,
    dest_path: String,
    character: Value,
    collection: Option<Value>,
    include_gallery_media: bool,
    markdown: Option<String>,
    text: Option<String>,
) -> Result<(), String> {
    let data_dir = ensure_data_dir(&app)?;
    let destination = validate_user_absolute_path(&dest_path, "Export destination path")?;
    if destination.starts_with(&data_dir) {
        return Err("Please save the export outside the app data directory".to_string());
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create export directory: {}", e))?;
    }

    let media_paths = expected_media_paths(&character);
    let manifest = json!({
        "app": "CharacterKeep",
        "exportType": "character",
        "backupSchemaVersion": 1,
        "schemaVersion": 1,
        "exportedAt": Utc::now().to_rfc3339(),
        "characterCount": 1,
        "mediaCount": if include_gallery_media { media_paths.len() } else { 0 }
    });

    let file = fs::File::create(&destination).map_err(|e| format!("Failed to create ZIP: {}", e))?;
    let mut writer = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    write_json_entry(&mut writer, "manifest.json", &manifest, options)?;
    write_json_entry(&mut writer, "character.json", &character, options)?;
    if let Some(collection) = collection {
        write_json_entry(&mut writer, "collections.json", &json!([collection]), options)?;
    }
    if let Some(markdown) = markdown {
        writer.start_file("portable.md", options).map_err(|e| format!("Failed to add Markdown export: {}", e))?;
        writer.write_all(markdown.as_bytes()).map_err(|e| format!("Failed to write Markdown export: {}", e))?;
    }
    if let Some(text) = text {
        writer.start_file("portable.txt", options).map_err(|e| format!("Failed to add TXT export: {}", e))?;
        writer.write_all(text.as_bytes()).map_err(|e| format!("Failed to write TXT export: {}", e))?;
    }
    if include_gallery_media {
        for relative_path in media_paths {
            validate_zip_entry_path(&relative_path)?;
            let source = data_dir.join(resolve_relative_path(&relative_path)?);
            if !source.exists() || !source.is_file() {
                continue;
            }
            writer.start_file(&relative_path, options).map_err(|e| format!("Failed to add media: {}", e))?;
            let mut input = fs::File::open(source).map_err(|e| format!("Failed to read media: {}", e))?;
            copy(&mut input, &mut writer).map_err(|e| format!("Failed to write media: {}", e))?;
        }
    }
    writer.finish().map_err(|e| format!("Failed to finalize ZIP: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_json_file,
            write_json_file,
            file_exists,
            get_app_data_path,
            open_data_folder,
            copy_image_to_app_data,
            get_image_data_url,
            get_external_image_data_url,
            generate_thumbnail,
            delete_path,
            copy_app_data_file,
            write_export_text_file,
            extract_character_card_from_path,
            create_characterkeep_backup_zip,
            preflight_characterkeep_backup_zip,
            export_characterkeep_character_zip,
            restore_characterkeep_backup_zip
        ])
        .run(tauri::generate_context!())
        .expect("error while running CharacterKeep");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn character(id: &str, title: &str) -> Value {
        json!({
            "id": id,
            "schemaVersion": 1,
            "type": "roleplay_character",
            "title": title,
            "subtitle": "",
            "systemPrompt": format!("Prompt for {}", title),
            "authorsNote": "",
            "notes": "",
            "scenes": [],
            "tags": [],
            "compatibleModels": [],
            "settingsNotes": "",
            "gallery": [],
            "favorite": false,
            "archived": false,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
            "extensions": { "characterkeep": {} }
        })
    }

    fn character_with_gallery(id: &str) -> Value {
        json!({
            "id": id,
            "schemaVersion": 1,
            "type": "roleplay_character",
            "title": "Gallery Character",
            "subtitle": "",
            "systemPrompt": "Prompt",
            "authorsNote": "",
            "notes": "",
            "scenes": [],
            "tags": [],
            "compatibleModels": [],
            "settingsNotes": "",
            "gallery": [{
                "id": "image-1",
                "filename": "image-1.png",
                "originalPath": format!("media/characters/{}/originals/image-1.png", id),
                "thumbnailPath": format!("media/characters/{}/thumbnails/image-1.jpg", id),
                "caption": "",
                "notes": "",
                "isCover": true,
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-01T00:00:00Z"
            }],
            "favorite": false,
            "archived": false,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
            "extensions": { "characterkeep": {} }
        })
    }

    #[test]
    fn restore_same_id_same_content_is_skipped() {
        let current = vec![character("same-id", "Lena")];
        let incoming = vec![character("same-id", "Lena")];
        let plan = plan_restore_merge(current, incoming, &HashSet::new());

        assert_eq!(plan.summary.skipped, 1);
        assert_eq!(plan.summary.imported, 0);
        assert_eq!(plan.characters.len(), 1);
    }

    #[test]
    fn restore_same_id_different_content_imports_conflict_copy() {
        let current = vec![character("same-id", "Lena")];
        let incoming = vec![character("same-id", "Changed Lena")];
        let plan = plan_restore_merge(current, incoming, &HashSet::new());

        assert_eq!(plan.summary.conflicts, 1);
        assert_eq!(plan.summary.imported, 1);
        assert_eq!(plan.characters.len(), 2);
        assert_ne!(value_id(&plan.characters[1]).as_deref(), Some("same-id"));
        assert_eq!(
            plan.characters[1]
                .get("title")
                .and_then(|value| value.as_str()),
            Some("Changed Lena Restored Copy")
        );
    }

    #[test]
    fn restore_different_id_same_content_is_skipped() {
        let current = vec![character("current-id", "Lena")];
        let incoming = vec![character("incoming-id", "Lena")];
        let plan = plan_restore_merge(current, incoming, &HashSet::new());

        assert_eq!(plan.summary.skipped, 1);
        assert_eq!(plan.summary.imported, 0);
        assert_eq!(plan.characters.len(), 1);
    }

    #[test]
    fn restore_missing_media_is_counted_but_character_imports() {
        let incoming = vec![character_with_gallery("gallery-id")];
        let plan = plan_restore_merge(Vec::new(), incoming, &HashSet::new());

        assert_eq!(plan.summary.imported, 1);
        assert_eq!(plan.summary.missing_media, 2);
        assert_eq!(plan.summary.media_files, 0);
        assert_eq!(plan.characters.len(), 1);
    }

    #[test]
    fn restore_present_media_is_planned_for_copy() {
        let incoming = vec![character_with_gallery("gallery-id")];
        let media_paths = HashSet::from([
            "media/characters/gallery-id/originals/image-1.png".to_string(),
            "media/characters/gallery-id/thumbnails/image-1.jpg".to_string(),
        ]);
        let plan = plan_restore_merge(Vec::new(), incoming, &media_paths);

        assert_eq!(plan.summary.imported, 1);
        assert_eq!(plan.summary.missing_media, 0);
        assert_eq!(plan.summary.media_files, 2);
        assert_eq!(plan.media_copies.len(), 2);
    }

    #[test]
    fn restore_unknown_fields_are_preserved() {
        let mut incoming = character("new-id", "Lena");
        incoming["externalSource"] = json!({ "system": "future-importer", "version": 3 });
        let plan = plan_restore_merge(Vec::new(), vec![incoming], &HashSet::new());

        assert_eq!(plan.summary.imported, 1);
        assert_eq!(
            plan.characters[0].get("externalSource"),
            Some(&json!({ "system": "future-importer", "version": 3 }))
        );
    }

    #[test]
    fn invalid_manifest_is_rejected() {
        let result = validate_characterkeep_manifest(&json!({
            "app": "ArtifactKeep",
            "backupSchemaVersion": 1
        }));

        assert!(result.is_err());
    }

    #[test]
    fn unsupported_manifest_schema_is_rejected() {
        let result = validate_characterkeep_manifest(&json!({
            "app": "CharacterKeep",
            "backupSchemaVersion": 99
        }));

        assert!(result.is_err());
    }

    #[test]
    fn restore_merge_never_wipes_existing_data() {
        let current = vec![character("current-id", "Existing")];
        let incoming = vec![character("incoming-id", "Incoming")];
        let plan = plan_restore_merge(current, incoming, &HashSet::new());

        assert_eq!(plan.summary.imported, 1);
        assert_eq!(plan.characters.len(), 2);
        assert!(plan
            .characters
            .iter()
            .any(|value| value.get("title").and_then(|title| title.as_str()) == Some("Existing")));
        assert!(plan
            .characters
            .iter()
            .any(|value| value.get("title").and_then(|title| title.as_str()) == Some("Incoming")));
    }

    #[test]
    fn collections_merge_preserves_existing_and_skips_duplicate_names() {
        let current = vec![json!({
            "id": "collection-1",
            "name": "Main Cast",
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z"
        })];
        let incoming = vec![
            json!({ "id": "collection-2", "name": "Main Cast" }),
            json!({ "id": "collection-3", "name": "Side Cast" })
        ];
        let mut summary = RestoreSummary::default();
        let merged = merge_collections(current, incoming, &mut summary);

        assert_eq!(merged.len(), 2);
        assert_eq!(summary.collections_imported, 1);
        assert_eq!(summary.collections_skipped, 1);
        assert!(merged.iter().any(|collection| {
            collection.get("name").and_then(|name| name.as_str()) == Some("Side Cast")
        }));
    }
}
