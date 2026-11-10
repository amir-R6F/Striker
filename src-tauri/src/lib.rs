use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent,
};
use tauri_plugin_sql::{Migration, MigrationKind};

const MAIN_WINDOW: &str = "main";
const TRAY_ID: &str = "striker-mini-tray";
const VISIBILITY_EVENT: &str = "striker-mini://visibility";
const DB_URL: &str = "sqlite:striker-mini.db";
const DB_FILE: &str = "striker-mini.db";

const WINDOW_WIDTH: f64 = 420.0;
const WINDOW_HEIGHT: f64 = 640.0;
const EDGE_MARGIN: f64 = 16.0;
const TASKBAR_CLEARANCE: f64 = 56.0;
const MAX_IMPORT_BYTES: u64 = 2 * 1024 * 1024;

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "init",
        kind: MigrationKind::Up,
        sql: include_str!("../migrations/001_init.sql"),
    }]
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
    let _ = window.emit(VISIBILITY_EVENT, visible);
}

fn toggle_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    set_widget_visible(&window, !visible);
}

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let toggle = MenuItem::with_id(app, "toggle", "Show / Hide", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Striker Mini — strike the day")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle_window(app),
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
        "striker-mini-roadmap.json".to_string()
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
            .unwrap_or("striker-mini-roadmap")
            .to_string();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("json")
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

/// Saves a roadmap JSON file into Downloads (or Documents/Home) and returns it.
#[tauri::command]
fn export_file(app: AppHandle, file_name: String, contents: String) -> Result<String, String> {
    let directory = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .or_else(|_| app.path().home_dir())
        .map_err(|error| error.to_string())?;

    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = unique_path(&directory, &sanitized_file_name(&file_name));
    std::fs::write(&path, contents.as_bytes()).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Reads a roadmap chosen with the dialog plugin. Only local .json files up to
/// 2 MB are accepted; Mini deliberately has no general filesystem plugin.
#[tauri::command]
fn read_json_file(path: String) -> Result<String, String> {
    let file = std::path::PathBuf::from(path.trim());
    if !file.is_absolute() {
        return Err("Choose an absolute .json path".to_string());
    }
    if !file
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("json"))
        .unwrap_or(false)
    {
        return Err("Only .json roadmap files can be imported".to_string());
    }
    let metadata = std::fs::metadata(&file).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_IMPORT_BYTES {
        return Err("Roadmap files must be 2 MB or smaller".to_string());
    }
    std::fs::read_to_string(&file).map_err(|error| error.to_string())
}

#[tauri::command]
fn database_path(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(DB_FILE).to_string_lossy().to_string())
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn registry_command(arguments: &[&str]) -> Result<std::process::Output, String> {
    use std::os::windows::process::CommandExt;
    let mut command = std::process::Command::new("reg");
    command.args(arguments);
    command.creation_flags(0x08000000);
    command.output().map_err(|error| error.to_string())
}

#[tauri::command]
fn autostart_is_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let output = registry_command(&[
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            "Striker Mini",
        ])?;
        Ok(output.status.success())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn autostart_set(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
        if enabled {
            let executable = std::env::current_exe().map_err(|error| error.to_string())?;
            let value = format!("\"{}\" --hidden", executable.display());
            let output = registry_command(&[
                "add",
                key,
                "/v",
                "Striker Mini",
                "/t",
                "REG_SZ",
                "/d",
                &value,
                "/f",
            ])?;
            if !output.status.success() {
                return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
            }
        } else {
            // A missing value is already the disabled state.
            let _ = registry_command(&["delete", key, "/v", "Striker Mini", "/f"]);
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        Err("Auto-start is only supported on Windows".to_string())
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            export_file,
            read_json_file,
            database_path,
            autostart_is_enabled,
            autostart_set
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                place_bottom_right(&window);
                if std::env::args().any(|argument| argument == "--hidden") {
                    let _ = window.hide();
                    let _ = window.emit(VISIBILITY_EVENT, false);
                }
            }
            setup_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                let _ = window.emit(VISIBILITY_EVENT, false);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Striker Mini");
}
