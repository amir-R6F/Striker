use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, DatabaseName, OpenFlags};
use tauri::{AppHandle, Manager};

/// The plugin stores `sqlite:striker.db` under `BaseDirectory::AppConfig`.
pub const DB_FILE: &str = "striker.db";
/// Keep in sync with the highest version in `migrations()`.
pub const LATEST_MIGRATION_VERSION: i64 = 44;
const MAX_AUTOMATIC_BACKUPS: usize = 5;

fn existing_or_default(candidates: Vec<Option<PathBuf>>) -> Option<PathBuf> {
    if let Some(found) = candidates.iter().flatten().find(|path| path.exists()) {
        return Some(found.clone());
    }
    candidates.into_iter().flatten().next()
}

/// Locates `striker.db` in the directories the SQL plugin may use.
pub fn database_path(app: &AppHandle) -> Option<PathBuf> {
    let config = app.path().app_config_dir().ok().map(|dir| dir.join(DB_FILE));
    let data = app.path().app_data_dir().ok().map(|dir| dir.join(DB_FILE));
    let local = app
        .path()
        .app_local_data_dir()
        .ok()
        .map(|dir| dir.join(DB_FILE));
    existing_or_default(vec![config, data, local])
}

fn timestamp() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

fn applied_migration_version(path: &Path) -> i64 {
    let Ok(connection) = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
    else {
        return 0;
    };
    connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
}

fn prune_backups(directory: &Path) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let prefix = format!("{DB_FILE}.bak-");
    let mut backups: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with(&prefix))
                .unwrap_or(false)
        })
        .collect();
    backups.sort();
    if backups.len() <= MAX_AUTOMATIC_BACKUPS {
        return;
    }
    let remove_count = backups.len() - MAX_AUTOMATIC_BACKUPS;
    for path in backups.into_iter().take(remove_count) {
        let _ = fs::remove_file(path);
    }
}

/// Copies the database once, only when pending migrations would touch it.
/// Runs in a plugin registered before `tauri-plugin-sql`, so the copy happens
/// before sqlx applies anything.
pub fn backup_before_migrations(app: &AppHandle) {
    let Some(path) = database_path(app) else {
        return;
    };
    if !path.exists() {
        return;
    }
    let size = fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
    if size == 0 {
        return;
    }
    if applied_migration_version(&path) >= LATEST_MIGRATION_VERSION {
        return;
    }

    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    let backup = directory.join(format!("{DB_FILE}.bak-{}", timestamp()));
    if let Err(error) = fs::copy(&path, &backup) {
        eprintln!("Striker could not back up the database before migrating: {error}");
        return;
    }
    prune_backups(directory);
}

/// Copies the live database into a user-chosen folder using SQLite's backup
/// API, so committed WAL pages are included.
pub fn backup_to_folder(app: &AppHandle, folder: &str) -> Result<String, String> {
    let directory = PathBuf::from(folder.trim());
    if !directory.is_absolute() {
        return Err("Choose an absolute backup folder".to_string());
    }
    let Some(source_path) = database_path(app) else {
        return Err("The Striker database could not be found".to_string());
    };
    if !source_path.exists() {
        return Err("The Striker database could not be found".to_string());
    }
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let destination = directory.join(format!("striker-backup-{}.db", timestamp()));
    let destination_path = if destination.exists() {
        directory.join(format!("striker-backup-{}-1.db", timestamp()))
    } else {
        destination
    };

    let source = Connection::open_with_flags(&source_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| error.to_string())?;
    source
        .backup(DatabaseName::Main, &destination_path, None)
        .map_err(|error| error.to_string())?;

    Ok(destination_path.to_string_lossy().to_string())
}

/// Deletes an attachment from the app evidence folder. Refuses paths outside it.
pub fn delete_evidence_file(app: &AppHandle, path: &str) -> Result<(), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("evidence");
    let canonical_directory =
        fs::canonicalize(&directory).map_err(|_| "No evidence folder exists yet".to_string())?;
    let canonical_path = fs::canonicalize(path)
        .map_err(|_| "That evidence file could not be found".to_string())?;
    if !canonical_path.starts_with(&canonical_directory) {
        return Err("Only files inside the Striker evidence folder can be deleted".to_string());
    }
    if !canonical_path.is_file() {
        return Err("That evidence path is not a file".to_string());
    }
    fs::remove_file(&canonical_path).map_err(|error| error.to_string())
}
