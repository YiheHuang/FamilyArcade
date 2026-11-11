//! 原生桥接：把桌面能力以与旧 Electron 版**同名同形**的 `window.splendorDesktop`
//! 对象注入到页面里，前端因此零改动（设置页、更新页、日志页照旧工作）。

use std::io::Write;
use std::path::PathBuf;

use chrono::Local;
use serde::Serialize;

use crate::paths;

#[derive(Serialize)]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub updates_dir: String,
    pub logs_dir: String,
    pub platform: String,
    /// 兼容旧字段名（诊断信息里显示运行时版本）
    pub runtime: String,
}

#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        data_dir: paths::data_dir().to_string_lossy().to_string(),
        updates_dir: paths::updates_dir().to_string_lossy().to_string(),
        logs_dir: paths::logs_dir().to_string_lossy().to_string(),
        platform: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
        runtime: format!("tauri {} / webview2", tauri::VERSION),
    }
}

/// 追加一行日志（渲染端错误也走这里），返回日志文件路径
#[tauri::command]
pub fn log_write(line: String, level: Option<String>) -> Result<String, String> {
    write_log(&line, level.as_deref().unwrap_or("info"))
}

fn write_log(line: &str, level: &str) -> Result<String, String> {
    let lvl = level.to_uppercase();
    let file = current_log_file();
    let text = format!("[{}] {lvl} {line}\n", Local::now().format("%Y-%m-%dT%H:%M:%S"));
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
        .map_err(|e| e.to_string())?;
    f.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    Ok(file.to_string_lossy().to_string())
}

/// 读取最近一段日志（复制诊断信息用）
#[tauri::command]
pub fn log_tail(lines: Option<usize>) -> String {
    let file = current_log_file();
    let text = std::fs::read_to_string(&file).unwrap_or_default();
    let keep = lines.unwrap_or(40);
    let all: Vec<&str> = text.lines().collect();
    let start = all.len().saturating_sub(keep);
    all[start..].join("\n")
}

/// 打开日志目录（Windows 资源管理器）
#[tauri::command]
pub fn open_log_dir() -> Result<(), String> {
    open_in_file_manager(&paths::logs_dir())
}

/// 保存房间快照（主机前端每次变更后调用，去抖在调用方）
#[tauri::command]
pub fn lan_save_rooms(snapshot: serde_json::Value) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
    std::fs::write(paths::rooms_file(), text).map_err(|e| e.to_string())
}

/// 读取房间快照（应用重启后房间码仍可加入）
#[tauri::command]
pub fn lan_load_rooms() -> Option<serde_json::Value> {
    std::fs::read_to_string(paths::rooms_file())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
}

#[tauri::command]
pub fn open_data_dir() -> Result<(), String> {
    open_in_file_manager(&paths::data_dir())
}

fn open_in_file_manager(dir: &PathBuf) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(dir)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
        std::process::Command::new(opener)
            .arg(dir)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

fn current_log_file() -> PathBuf {
    let date = Local::now().format("%Y%m%d").to_string();
    paths::logs_dir().join(format!("main-{date}.log"))
}

/// 主进程日志：同时输出到控制台（便于开发时观察）
pub fn log_line(line: &str, level: &str) {
    println!("[splendor] {line}");
    let _ = write_log(line, level);
}
