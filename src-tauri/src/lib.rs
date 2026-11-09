use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_sql::{Migration, MigrationKind};

const MAIN_WINDOW: &str = "main";
const TRAY_ID: &str = "striker-tray";
const HOTKEY: &str = "ctrl+shift+s";
const VISIBILITY_EVENT: &str = "striker://visibility";
const QUICK_LOG_EVENT: &str = "striker://quick-log";

const WINDOW_WIDTH: f64 = 420.0;
const WINDOW_HEIGHT: f64 = 640.0;
const EDGE_MARGIN: f64 = 24.0;
/// The widget is nudged above the Windows taskbar at startup.
const TASKBAR_CLEARANCE: f64 = 64.0;

fn migrations() -> Vec<Migration> {
    // One statement per migration keeps the sqlite migrator predictable.
    vec![
        Migration {
            version: 1,
            description: "create_goals",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT,
                    start_date TEXT NOT NULL,
                    weekly_hours_goal REAL NOT NULL DEFAULT 0,
                    success_criteria TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                  );",
        },
        Migration {
            version: 2,
            description: "create_entries",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    goal_id INTEGER NOT NULL,
                    date TEXT NOT NULL,
                    text TEXT NOT NULL,
                    minutes INTEGER,
                    confidence INTEGER,
                    skill_tag TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
                  );",
        },
        Migration {
            version: 3,
            description: "index_entries_by_goal_and_date",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_entries_goal_date ON entries(goal_id, date);",
        },
        Migration {
            version: 4,
            description: "create_weekly_reviews",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS weekly_reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    goal_id INTEGER NOT NULL,
                    week_start TEXT NOT NULL,
                    summary TEXT,
                    next_week_plan TEXT,
                    open_questions TEXT,
                    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
                    UNIQUE (goal_id, week_start)
                  );",
        },
        Migration {
            version: 5,
            description: "create_settings",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                  );",
        },
        Migration {
            version: 6,
            description: "create_skills",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS skills (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    parent_id INTEGER,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (parent_id) REFERENCES skills(id) ON DELETE CASCADE,
                    UNIQUE (name, parent_id)
                  );",
        },
        Migration {
            version: 7,
            description: "create_entry_skills",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS entry_skills (
                    entry_id INTEGER NOT NULL,
                    skill_id INTEGER NOT NULL,
                    PRIMARY KEY (entry_id, skill_id),
                    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
                    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
                  );",
        },
        Migration {
            version: 8,
            description: "seed_default_skills",
            kind: MigrationKind::Up,
            sql: "INSERT INTO skills (name, parent_id)
                  SELECT name, NULL FROM (
                    SELECT 'Modeling' AS name UNION ALL
                    SELECT 'Materials' UNION ALL
                    SELECT 'Animation' UNION ALL
                    SELECT 'Rendering' UNION ALL
                    SELECT 'Other'
                  )
                  WHERE NOT EXISTS (SELECT 1 FROM skills);",
        },
        Migration {
            version: 9,
            description: "add_entries_action",
            kind: MigrationKind::Up,
            sql: "ALTER TABLE entries ADD COLUMN action TEXT;",
        },
        Migration {
            version: 10,
            description: "add_entries_learned",
            kind: MigrationKind::Up,
            sql: "ALTER TABLE entries ADD COLUMN learned TEXT;",
        },
        Migration {
            version: 11,
            description: "add_entries_difficulty",
            kind: MigrationKind::Up,
            sql: "ALTER TABLE entries ADD COLUMN difficulty TEXT;",
        },
        Migration {
            version: 12,
            description: "add_entries_source",
            kind: MigrationKind::Up,
            sql: "ALTER TABLE entries ADD COLUMN source TEXT;",
        },
        Migration {
            version: 13,
            description: "add_entries_evidence",
            kind: MigrationKind::Up,
            sql: "ALTER TABLE entries ADD COLUMN evidence TEXT;",
        },
        Migration {
            version: 14,
            description: "create_milestones",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS milestones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    goal_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    target_date TEXT,
                    target_minutes INTEGER,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
                  );",
        },
        Migration {
            version: 15,
            description: "create_milestone_entries",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS milestone_entries (
                    milestone_id INTEGER NOT NULL,
                    entry_id INTEGER NOT NULL,
                    PRIMARY KEY (milestone_id, entry_id),
                    FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE,
                    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
                  );",
        },
        Migration {
            version: 16,
            description: "index_entries_date",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);",
        },
        Migration {
            version: 17,
            description: "index_entries_skill_tag",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_entries_skill_tag ON entries(skill_tag);",
        },
        Migration {
            version: 18,
            description: "index_entries_goal_id",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_entries_goal_id ON entries(goal_id);",
        },
        Migration {
            version: 19,
            description: "index_entry_skills_skill",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_entry_skills_skill ON entry_skills(skill_id);",
        },
        Migration {
            version: 20,
            description: "index_milestones_goal",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_milestones_goal ON milestones(goal_id);",
        },
        Migration {
            version: 21,
            description: "index_milestone_entries_entry",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_milestone_entries_entry ON milestone_entries(entry_id);",
        },
        Migration {
            version: 22,
            description: "backfill_legacy_skill_tags",
            kind: MigrationKind::Up,
            sql: "INSERT OR IGNORE INTO entry_skills (entry_id, skill_id)
                  SELECT e.id, s.id
                  FROM entries e
                  JOIN skills s ON s.name = e.skill_tag AND s.parent_id IS NULL
                  WHERE e.skill_tag IS NOT NULL;",
        },
        Migration {
            version: 23,
            description: "add_milestone_completion",
            kind: MigrationKind::Up,
            sql: "ALTER TABLE milestones ADD COLUMN completed_at TEXT;",
        },
        Migration {
            version: 24,
            description: "create_entry_evidence",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS entry_evidence (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entry_id INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    path TEXT NOT NULL,
                    original_name TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
                  );",
        },
        Migration {
            version: 25,
            description: "backfill_legacy_evidence",
            kind: MigrationKind::Up,
            sql: "INSERT INTO entry_evidence (entry_id, kind, path, original_name)
                  SELECT id,
                         CASE
                           WHEN lower(evidence) LIKE 'http://%'
                             OR lower(evidence) LIKE 'https://%' THEN 'link'
                           WHEN lower(evidence) LIKE '%.png'
                             OR lower(evidence) LIKE '%.jpg'
                             OR lower(evidence) LIKE '%.jpeg'
                             OR lower(evidence) LIKE '%.webp'
                             OR lower(evidence) LIKE '%.gif' THEN 'image'
                           WHEN lower(evidence) LIKE '%.pdf' THEN 'pdf'
                           ELSE 'file'
                         END,
                         evidence,
                         NULL
                  FROM entries
                  WHERE evidence IS NOT NULL AND trim(evidence) <> '';",
        },
        Migration {
            version: 26,
            description: "index_entry_evidence",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_entry_evidence_entry ON entry_evidence(entry_id);",
        },
        Migration {
            version: 27,
            description: "create_flashcards",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS flashcards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    goal_id INTEGER NOT NULL,
                    entry_id INTEGER,
                    front TEXT NOT NULL,
                    back TEXT NOT NULL,
                    due_date TEXT NOT NULL,
                    interval_days INTEGER NOT NULL DEFAULT 0,
                    ease REAL NOT NULL DEFAULT 2.5,
                    repetitions INTEGER NOT NULL DEFAULT 0,
                    lapses INTEGER NOT NULL DEFAULT 0,
                    last_reviewed_at TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
                    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE SET NULL
                  );",
        },
        Migration {
            version: 28,
            description: "index_flashcards_goal_due",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_flashcards_goal_due ON flashcards(goal_id, due_date);",
        },
        Migration {
            version: 29,
            description: "index_flashcards_entry",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_flashcards_entry ON flashcards(entry_id);",
        },
        Migration {
            version: 30,
            description: "create_skill_trees",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS skill_trees (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    goal_id INTEGER,
                    title TEXT NOT NULL,
                    description TEXT,
                    source TEXT NOT NULL DEFAULT 'manual',
                    schema_version INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL
                  );",
        },
        Migration {
            version: 31,
            description: "create_skill_nodes",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS skill_nodes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tree_id INTEGER NOT NULL,
                    external_id TEXT,
                    parent_id INTEGER,
                    title TEXT NOT NULL,
                    description TEXT,
                    order_index INTEGER NOT NULL DEFAULT 0,
                    tags TEXT NOT NULL DEFAULT '[]',
                    estimated_hours REAL NOT NULL DEFAULT 0,
                    resources_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (tree_id) REFERENCES skill_trees(id) ON DELETE CASCADE,
                    FOREIGN KEY (parent_id) REFERENCES skill_nodes(id) ON DELETE CASCADE
                  );",
        },
        Migration {
            version: 32,
            description: "create_entry_skill_nodes",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS entry_skill_nodes (
                    entry_id INTEGER NOT NULL,
                    node_id INTEGER NOT NULL,
                    PRIMARY KEY (entry_id, node_id),
                    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
                    FOREIGN KEY (node_id) REFERENCES skill_nodes(id) ON DELETE CASCADE
                  );",
        },
        Migration {
            version: 33,
            description: "index_skill_nodes_tree",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_skill_nodes_tree ON skill_nodes(tree_id, order_index);",
        },
        Migration {
            version: 34,
            description: "index_skill_nodes_parent",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_skill_nodes_parent ON skill_nodes(parent_id);",
        },
        Migration {
            version: 35,
            description: "index_skill_nodes_external",
            kind: MigrationKind::Up,
            sql: "CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_nodes_external ON skill_nodes(tree_id, external_id) WHERE external_id IS NOT NULL;",
        },
        Migration {
            version: 36,
            description: "index_entry_skill_nodes_node",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_entry_skill_nodes_node ON entry_skill_nodes(node_id);",
        },
        Migration {
            version: 37,
            description: "seed_default_skill_tree",
            kind: MigrationKind::Up,
            sql: "INSERT INTO skill_trees (goal_id, title, description, source)
                  SELECT (SELECT id FROM goals ORDER BY id DESC LIMIT 1),
                         'My roadmap',
                         'Migrated from the original skill list.',
                         'imported'
                  WHERE NOT EXISTS (SELECT 1 FROM skill_trees);",
        },
        Migration {
            version: 38,
            description: "backfill_skill_nodes",
            kind: MigrationKind::Up,
            sql: "INSERT INTO skill_nodes (id, tree_id, external_id, parent_id, title, order_index, created_at, updated_at)
                  SELECT s.id,
                         (SELECT id FROM skill_trees ORDER BY id LIMIT 1),
                         'legacy-' || s.id,
                         NULL,
                         s.name,
                         s.id,
                         s.created_at,
                         s.created_at
                  FROM skills s
                  WHERE NOT EXISTS (SELECT 1 FROM skill_nodes);",
        },
        Migration {
            version: 39,
            description: "backfill_entry_skill_nodes",
            kind: MigrationKind::Up,
            sql: "INSERT OR IGNORE INTO entry_skill_nodes (entry_id, node_id)
                  SELECT es.entry_id, es.skill_id
                  FROM entry_skills es
                  WHERE EXISTS (SELECT 1 FROM skill_nodes n WHERE n.id = es.skill_id);",
        },
        Migration {
            version: 40,
            description: "backfill_skill_node_parents",
            kind: MigrationKind::Up,
            sql: "UPDATE skill_nodes
                  SET parent_id = (SELECT s.parent_id FROM skills s WHERE s.id = skill_nodes.id)
                  WHERE parent_id IS NULL
                    AND EXISTS (SELECT 1 FROM skills s WHERE s.id = skill_nodes.id AND s.parent_id IS NOT NULL);",
        },
    ]
}

fn place_bottom_right(window: &WebviewWindow) {
    let Ok(Some(monitor)) = window.primary_monitor() else {
        return;
    };

    let scale = monitor.scale_factor();
    let monitor_size = monitor.size();
    let window_size = window.outer_size().unwrap_or_else(|_| {
        PhysicalSize::new(
            (WINDOW_WIDTH * scale).round() as u32,
            (WINDOW_HEIGHT * scale).round() as u32,
        )
    });

    let margin_x = (EDGE_MARGIN * scale).round() as i32;
    let margin_y = (TASKBAR_CLEARANCE * scale).round() as i32;
    let x = monitor_size.width as i32 - window_size.width as i32 - margin_x;
    let y = monitor_size.height as i32 - window_size.height as i32 - margin_y;

    let _ = window.set_position(PhysicalPosition::new(x.max(0), y.max(0)));
}

fn set_widget_visible(window: &WebviewWindow, visible: bool) {
    if visible {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    } else {
        let _ = window.hide();
    }
    // The frontend pauses charts and timers based on this event.
    let _ = window.emit(VISIBILITY_EVENT, visible);
}

fn toggle_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    set_widget_visible(&window, !visible);
}

fn open_quick_log(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    set_widget_visible(&window, true);
    let _ = window.emit(QUICK_LOG_EVENT, ());
}

/// Ctrl+Shift+S toggles the widget; when shown, the quick log takes focus.
fn toggle_quick_log(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        set_widget_visible(&window, false);
    } else {
        set_widget_visible(&window, true);
        let _ = window.emit(QUICK_LOG_EVENT, ());
    }
}

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let toggle = MenuItem::with_id(app, "toggle", "Show / Hide", true, None::<&str>)?;
    let quick_log = MenuItem::with_id(app, "quick_log", "Quick Log", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &quick_log, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Striker — daily learning log")
        .menu(&menu)
        // Right click opens the menu; left click toggles the widget instead.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle_window(app),
            "quick_log" => open_quick_log(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

/// Opens an http(s) link or an absolute local path with the Windows shell.
#[tauri::command]
fn open_external(target: String) -> Result<(), String> {
    let trimmed = target.trim().to_string();
    if trimmed.is_empty() {
        return Err("Nothing to open".to_string());
    }

    let is_link = trimmed.starts_with("http://") || trimmed.starts_with("https://");
    let is_local = std::path::Path::new(&trimmed).is_absolute();
    if !is_link && !is_local {
        return Err("Only http(s) links or absolute file paths can be opened".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&trimmed)
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (is_link, is_local);
        Err("Opening links is only supported on Windows".to_string())
    }
}

const MAX_EVIDENCE_BYTES: usize = 8 * 1024 * 1024;
const MAX_BINARY_EXPORT_BYTES: usize = 32 * 1024 * 1024;

fn sanitized_file_name(file_name: &str) -> String {
    let sanitized: String = file_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect();
    if sanitized.is_empty() {
        "striker-export.txt".to_string()
    } else {
        sanitized
    }
}

fn unique_path(directory: &std::path::Path, file_name: &str) -> std::path::PathBuf {
    let mut path = directory.join(file_name);
    if path.exists() {
        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("striker-export")
            .to_string();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("txt")
            .to_string();
        for index in 1..=999 {
            let candidate = directory.join(format!("{stem}-{index}.{extension}"));
            if !candidate.exists() {
                path = candidate;
                break;
            }
        }
    }
    path
}

fn write_export(app: &AppHandle, file_name: &str, contents: &[u8]) -> Result<String, String> {
    let directory = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .or_else(|_| app.path().home_dir())
        .map_err(|error| error.to_string())?;

    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = unique_path(&directory, &sanitized_file_name(file_name));
    std::fs::write(&path, contents).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Saves an exported JSON/CSV/Markdown file into Downloads and returns its full path.
#[tauri::command]
fn export_file(app: AppHandle, file_name: String, contents: String) -> Result<String, String> {
    write_export(&app, &file_name, contents.as_bytes())
}

fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let first = chunk[0] as u32;
        let second = chunk.get(1).copied().unwrap_or(0) as u32;
        let third = chunk.get(2).copied().unwrap_or(0) as u32;
        let bits = (first << 16) | (second << 8) | third;
        output.push(TABLE[((bits >> 18) & 63) as usize] as char);
        output.push(TABLE[((bits >> 12) & 63) as usize] as char);
        output.push(if chunk.len() > 1 {
            TABLE[((bits >> 6) & 63) as usize] as char
        } else {
            '='
        });
        output.push(if chunk.len() > 2 {
            TABLE[(bits & 63) as usize] as char
        } else {
            '='
        });
    }
    output
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let mut values: Vec<u8> = Vec::with_capacity(input.len());
    for byte in input.bytes() {
        if byte == b'=' {
            break;
        }
        if byte.is_ascii_whitespace() {
            continue;
        }
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return Err("Invalid base64 data".to_string()),
        };
        values.push(value);
    }

    if values.len() % 4 == 1 {
        return Err("Invalid base64 data".to_string());
    }

    let mut output = Vec::with_capacity(values.len() * 3 / 4);
    for chunk in values.chunks(4) {
        let first = chunk[0] as u32;
        let second = chunk.get(1).copied().unwrap_or(0) as u32;
        let third = chunk.get(2).copied().unwrap_or(0) as u32;
        let fourth = chunk.get(3).copied().unwrap_or(0) as u32;
        let bits = (first << 18) | (second << 12) | (third << 6) | fourth;
        output.push(((bits >> 16) & 0xFF) as u8);
        if chunk.len() > 2 {
            output.push(((bits >> 8) & 0xFF) as u8);
        }
        if chunk.len() > 3 {
            output.push((bits & 0xFF) as u8);
        }
    }
    Ok(output)
}

/// Copies a small base64 payload into the app's evidence folder.
#[tauri::command]
fn save_evidence_base64(
    app: AppHandle,
    file_name: String,
    data: String,
) -> Result<String, String> {
    let extension = std::path::Path::new(&file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "pdf"
    ) {
        return Err("Only images, GIFs and PDF files can be attached".to_string());
    }

    let bytes = base64_decode(&data)?;
    if bytes.is_empty() {
        return Err("The selected file is empty".to_string());
    }
    if bytes.len() > MAX_EVIDENCE_BYTES {
        return Err("Evidence files must be 8 MB or smaller".to_string());
    }

    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("evidence");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let file_name = format!("{stamp}-{}", sanitized_file_name(&file_name));
    let path = unique_path(&directory, &file_name);
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Returns a local evidence image as a data URL for the gallery and PDF reports.
#[tauri::command]
fn read_evidence_image(app: AppHandle, path: String) -> Result<String, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("evidence");
    let canonical_directory = std::fs::canonicalize(&directory)
        .map_err(|_| "No evidence folder has been created yet".to_string())?;
    let canonical_path = std::fs::canonicalize(&path)
        .map_err(|_| "That evidence file could not be found".to_string())?;
    if !canonical_path.starts_with(&canonical_directory) {
        return Err("Evidence images must live in the Striker evidence folder".to_string());
    }

    let extension = canonical_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => return Err("Only image evidence can be previewed".to_string()),
    };

    let metadata = std::fs::metadata(&canonical_path).map_err(|error| error.to_string())?;
    if metadata.len() as usize > MAX_EVIDENCE_BYTES {
        return Err("Evidence images must be 8 MB or smaller".to_string());
    }

    let bytes = std::fs::read(&canonical_path).map_err(|error| error.to_string())?;
    Ok(format!("data:{};base64,{}", mime, base64_encode(&bytes)))
}

/// Saves binary report output (a PDF) into Downloads and returns its full path.
#[tauri::command]
fn export_binary_base64(
    app: AppHandle,
    file_name: String,
    data: String,
) -> Result<String, String> {
    let bytes = base64_decode(&data)?;
    if bytes.len() > MAX_BINARY_EXPORT_BYTES {
        return Err("That report is too large to export".to_string());
    }
    write_export(&app, &file_name, &bytes)
}

const MAX_SYNC_BYTES: usize = 32 * 1024 * 1024;

fn sync_file_path(folder: &str, file_name: &str) -> Result<std::path::PathBuf, String> {
    let directory = std::path::PathBuf::from(folder.trim());
    if !directory.is_absolute() {
        return Err("Choose an absolute backup folder".to_string());
    }
    let name = sanitized_file_name(file_name);
    if name == "." || name == ".." {
        return Err("Choose a real backup file name".to_string());
    }
    Ok(directory.join(name))
}

/// Writes an encrypted sync backup into a user-chosen local folder.
#[tauri::command]
fn write_sync_file(folder: String, file_name: String, contents: String) -> Result<String, String> {
    if contents.len() > MAX_SYNC_BYTES {
        return Err("That backup is too large to write".to_string());
    }
    let path = sync_file_path(&folder, &file_name)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::write(&path, contents.as_bytes()).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Reads an encrypted sync backup from a user-chosen local folder.
#[tauri::command]
fn read_sync_file(folder: String, file_name: String) -> Result<String, String> {
    let path = sync_file_path(&folder, &file_name)?;
    let metadata = std::fs::metadata(&path)
        .map_err(|_| "No backup file was found in that folder".to_string())?;
    if metadata.len() as usize > MAX_SYNC_BYTES {
        return Err("That backup is too large to read".to_string());
    }
    std::fs::read_to_string(&path).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:striker.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut(HOTKEY)
                .expect("ctrl+shift+s is a valid shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_quick_log(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            export_file,
            export_binary_base64,
            open_external,
            save_evidence_base64,
            read_evidence_image,
            write_sync_file,
            read_sync_file
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                place_bottom_right(&window);
                // Auto-start launches the app with --hidden so it only lives in the tray.
                if std::env::args().any(|argument| argument == "--hidden") {
                    let _ = window.hide();
                    let _ = window.emit(VISIBILITY_EVENT, false);
                }
            }

            setup_tray(&handle)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Closing the widget parks it in the tray instead of quitting.
                api.prevent_close();
                let _ = window.hide();
                let _ = window.emit(VISIBILITY_EVENT, false);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Striker");
}
