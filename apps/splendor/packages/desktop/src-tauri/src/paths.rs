//! 数据目录与路径：与旧 Electron 版保持一致（`%APPDATA%\Splendor`），
//! 房间存档、日志、更新包因此可以无缝沿用。

use std::path::PathBuf;

/// `%APPDATA%\Splendor`（Windows）/ 其他平台的等价目录（仅用于开发）。
/// 测试可用 `SPLENDOR_DATA_DIR` 指向临时目录，避免污染真实存档。
pub fn data_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("SPLENDOR_DATA_DIR") {
        if !custom.trim().is_empty() {
            let dir = PathBuf::from(custom);
            let _ = std::fs::create_dir_all(&dir);
            return dir;
        }
    }
    let base = dirs_data_root();
    let dir = base.join("Splendor");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn dirs_data_root() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata);
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".local").join("share");
    }
    PathBuf::from(".")
}

/// 房间存档路径（阶段 1：主机前端通过 Rust 落盘）
#[allow(dead_code)]
pub fn rooms_file() -> PathBuf {
    data_dir().join("lan-rooms.json")
}

pub fn updates_dir() -> PathBuf {
    let dir = data_dir().join("updates");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn logs_dir() -> PathBuf {
    let dir = data_dir().join("logs");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// 更新助手的工作目录（安装器、回滚备份、启动校验标记）
/// 更新助手工作目录（阶段 3）
#[allow(dead_code)]
pub fn update_work_dir() -> PathBuf {
    let dir = data_dir().join("update-work");
    let _ = std::fs::create_dir_all(&dir);
    dir
}
