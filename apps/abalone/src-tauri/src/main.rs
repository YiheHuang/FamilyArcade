#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
async fn lan_start(app: tauri::AppHandle) -> Result<familyarcade_lan_host::HostInfo, String> {
    familyarcade_lan_host::start(app).await
}

#[tauri::command]
async fn lan_status() -> Option<familyarcade_lan_host::HostInfo> {
    familyarcade_lan_host::status().await
}

#[tauri::command]
async fn lan_stop() -> Result<(), String> {
    familyarcade_lan_host::stop().await
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![lan_start, lan_status, lan_stop])
        .setup(|app| {
            familyarcade_lan_host::init(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Family Arcade game failed to start");
}
