#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

use tauri::Manager;

fn game_dir(app: &tauri::AppHandle, slug: &str) -> Option<PathBuf> {
    if slug.is_empty() || slug.contains('/') || slug.contains('\\') || slug.contains("..") {
        return None;
    }
    if let Ok(resource) = app.path().resource_dir() {
        let candidate = resource.join("games").join(slug);
        if candidate.join("game.exe").exists() {
            return Some(candidate);
        }
    }
    for base in [PathBuf::from("../games"), PathBuf::from("games")] {
        let candidate = base.join(slug);
        if candidate.join("game.exe").exists() {
            return Some(candidate);
        }
    }
    None
}

#[tauri::command]
fn launch_game(app: tauri::AppHandle, slug: String) -> Result<(), String> {
    let dir = game_dir(&app, &slug).ok_or_else(|| format!("game not bundled: {slug}"))?;
    let exe = dir.join("game.exe");

    // Self-heal older installations that did not copy the WebView2 loader next
    // to the portable game. The hub itself always ships this DLL.
    let loader = dir.join("WebView2Loader.dll");
    if !loader.exists() {
        if let Ok(current) = std::env::current_exe() {
            if let Some(parent) = current.parent() {
                let source = parent.join("WebView2Loader.dll");
                if source.exists() {
                    let _ = std::fs::copy(source, &loader);
                }
            }
        }
    }

    let mut command = std::process::Command::new(exe);
    command.current_dir(&dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("could not start {slug}: {error}"))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![launch_game])
        .run(tauri::generate_context!())
        .expect("Family Arcade failed to start");
}
