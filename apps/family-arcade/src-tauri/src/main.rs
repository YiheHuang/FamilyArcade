#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

use tauri::Manager;

fn valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && !slug.contains('/')
        && !slug.contains('\\')
        && !slug.contains("..")
        && slug
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
}

#[cfg(not(feature = "lite"))]
fn game_dir(app: &tauri::AppHandle, slug: &str) -> Option<PathBuf> {
    if !valid_slug(slug) {
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

#[cfg(feature = "lite")]
fn lite_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("games"))
        .map_err(|error| error.to_string())
}

#[cfg(feature = "lite")]
fn game_dir(app: &tauri::AppHandle, slug: &str) -> Option<PathBuf> {
    if !valid_slug(slug) {
        return None;
    }
    let candidate = lite_root(app).ok()?.join(slug);
    if candidate.join("game.exe").exists() {
        Some(candidate)
    } else {
        None
    }
}

#[tauri::command]
fn hub_mode() -> &'static str {
    if cfg!(feature = "lite") {
        "lite"
    } else {
        "full"
    }
}

#[tauri::command]
fn launch_game(app: tauri::AppHandle, slug: String) -> Result<(), String> {
    let dir = game_dir(&app, &slug).ok_or_else(|| {
        if cfg!(feature = "lite") {
            format!("game not installed: {slug}")
        } else {
            format!("game not bundled: {slug}")
        }
    })?;
    let exe = dir.join("game.exe");

    // Self-heal older installations that did not copy the WebView2 loader next
    // to the portable game. The launcher itself always ships this DLL.
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

#[cfg(feature = "lite")]
mod lite {
    use std::fs::{self, File};
    use std::io::{Read, Write};
    use std::path::{Path, PathBuf};

    use serde::Serialize;
    use sha2::{Digest, Sha256};
    use tauri::{AppHandle, Emitter, Manager};

    use super::{game_dir, lite_root, valid_slug};

    #[derive(Clone, Serialize)]
    struct DownloadProgress {
        slug: String,
        received: u64,
        total: u64,
    }

    fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
        let dir = app
            .path()
            .app_config_dir()
            .map_err(|error| error.to_string())?;
        fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        Ok(dir.join("config.json"))
    }

    fn read_token(app: &AppHandle) -> Option<String> {
        let path = config_path(app).ok()?;
        let text = fs::read_to_string(path).ok()?;
        let value: serde_json::Value = serde_json::from_str(&text).ok()?;
        value
            .get("githubToken")
            .and_then(|token| token.as_str())
            .map(str::trim)
            .filter(|token| !token.is_empty())
            .map(str::to_string)
    }

    fn write_token(app: &AppHandle, token: Option<String>) -> Result<(), String> {
        let path = config_path(app)?;
        let value = match token {
            Some(token) if !token.trim().is_empty() => {
                serde_json::json!({ "githubToken": token.trim() })
            }
            _ => serde_json::json!({}),
        };
        fs::write(path, format!("{value}\n")).map_err(|error| error.to_string())
    }

    fn client() -> Result<reqwest::blocking::Client, String> {
        reqwest::blocking::Client::builder()
            .user_agent("FamilyArcadeLite/1.0")
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .map_err(|error| error.to_string())
    }

    fn github_request(
        client: &reqwest::blocking::Client,
        url: &str,
        token: Option<&String>,
        accept: &str,
    ) -> Result<reqwest::blocking::RequestBuilder, String> {
        let mut request = client
            .get(url)
            .header("Accept", accept)
            .header("X-GitHub-Api-Version", "2022-11-28");
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        Ok(request)
    }

    fn asset_info(
        client: &reqwest::blocking::Client,
        tag: &str,
        asset: &str,
        token: Option<&String>,
    ) -> Result<(String, u64), String> {
        let url = format!(
            "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/tags/{tag}"
        );
        let response = github_request(client, &url, token, "application/vnd.github+json")
            .and_then(|request| request.send().map_err(|error| error.to_string()))?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(if token.is_some() {
                "package release not found. Check the GitHub token in Settings.".to_string()
            } else {
                "package release not found. Add a read-only GitHub token in Settings, or make the release assets public.".to_string()
            });
        }
        let response = response.error_for_status().map_err(|error| error.to_string())?;
        let release: serde_json::Value = response.json().map_err(|error| error.to_string())?;
        let item = release
            .get("assets")
            .and_then(|assets| assets.as_array())
            .and_then(|assets| {
                assets
                    .iter()
                    .find(|item| item.get("name").and_then(|name| name.as_str()) == Some(asset))
            })
            .ok_or_else(|| format!("package asset not found: {asset}"))?;
        let url = item
            .get("url")
            .and_then(|url| url.as_str())
            .ok_or_else(|| "package asset has no URL".to_string())?;
        let size = item.get("size").and_then(|size| size.as_u64()).unwrap_or(0);
        Ok((url.to_string(), size))
    }

    fn extract_zip(zip_path: &Path, out_dir: &Path) -> Result<(), String> {
        let file = File::open(zip_path).map_err(|error| error.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
        fs::create_dir_all(out_dir).map_err(|error| error.to_string())?;
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|error| error.to_string())?;
            let relative = entry
                .enclosed_name()
                .ok_or_else(|| format!("unsafe zip entry: {}", entry.name()))?
                .to_path_buf();
            let target = out_dir.join(relative);
            if entry.is_dir() {
                fs::create_dir_all(&target).map_err(|error| error.to_string())?;
            } else {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                let mut output = File::create(&target).map_err(|error| error.to_string())?;
                std::io::copy(&mut entry, &mut output).map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    }

    fn package_root(extract_dir: &Path) -> Result<PathBuf, String> {
        if extract_dir.join("game.exe").exists() {
            return Ok(extract_dir.to_path_buf());
        }
        for entry in fs::read_dir(extract_dir).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            if path.is_dir() && path.join("game.exe").exists() {
                return Ok(path);
            }
        }
        Err("package does not contain game.exe".to_string())
    }

    fn install_blocking(
        app: &AppHandle,
        slug: &str,
        tag: &str,
        asset: &str,
        expected_sha: &str,
        expected_bytes: u64,
        direct_url: Option<&str>,
    ) -> Result<(), String> {
        if !valid_slug(slug) {
            return Err("invalid game slug".to_string());
        }
        let client = client()?;
        let token = read_token(app);
        let (asset_url, asset_size) = if let Some(url) = direct_url {
            (url.to_string(), 0)
        } else {
            asset_info(&client, tag, asset, token.as_ref())?
        };
        let total = if asset_size > 0 {
            asset_size
        } else {
            expected_bytes
        };

        let downloads = app
            .path()
            .app_local_data_dir()
            .map_err(|error| error.to_string())?
            .join("downloads");
        fs::create_dir_all(&downloads).map_err(|error| error.to_string())?;
        let zip_path = downloads.join(format!("{slug}.zip.part"));
        let extract_dir = downloads.join(format!("{slug}-extract"));

        let request = github_request(&client, &asset_url, token.as_ref(), "application/octet-stream")?;
        let mut response = request
            .send()
            .map_err(|error| error.to_string())?
            .error_for_status()
            .map_err(|error| format!("download failed: {error}"))?;

        let mut file = File::create(&zip_path).map_err(|error| error.to_string())?;
        let mut hasher = Sha256::new();
        let mut received = 0u64;
        let mut emitted = 0u64;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let count = response.read(&mut buffer).map_err(|error| error.to_string())?;
            if count == 0 {
                break;
            }
            file.write_all(&buffer[..count])
                .map_err(|error| error.to_string())?;
            hasher.update(&buffer[..count]);
            received += count as u64;
            if received - emitted >= 512 * 1024 || (total > 0 && received >= total) {
                emitted = received;
                let _ = app.emit(
                    "download-progress",
                    DownloadProgress {
                        slug: slug.to_string(),
                        received,
                        total,
                    },
                );
            }
        }
        drop(file);

        let actual = hex::encode(hasher.finalize());
        if !expected_sha.is_empty() && !actual.eq_ignore_ascii_case(expected_sha) {
            let _ = fs::remove_file(&zip_path);
            return Err(format!(
                "package checksum mismatch (expected {expected_sha}, got {actual})"
            ));
        }

        let _ = fs::remove_dir_all(&extract_dir);
        extract_zip(&zip_path, &extract_dir)?;
        let root = package_root(&extract_dir)?;

        let games = lite_root(app)?;
        fs::create_dir_all(&games).map_err(|error| error.to_string())?;
        let destination = games.join(slug);
        let _ = fs::remove_dir_all(&destination);
        fs::rename(&root, &destination).map_err(|error| error.to_string())?;
        if root != extract_dir {
            let _ = fs::remove_dir_all(&extract_dir);
        }
        let _ = fs::remove_file(&zip_path);

        if !destination.join("WebView2Loader.dll").exists() {
            if let Ok(current) = std::env::current_exe() {
                if let Some(parent) = current.parent() {
                    let source = parent.join("WebView2Loader.dll");
                    if source.exists() {
                        let _ = fs::copy(source, destination.join("WebView2Loader.dll"));
                    }
                }
            }
        }

        let _ = app.emit(
            "download-progress",
            DownloadProgress {
                slug: slug.to_string(),
                received: total.max(received),
                total: total.max(received),
            },
        );
        Ok(())
    }

    #[tauri::command]
    pub async fn install_game(
        app: AppHandle,
        slug: String,
        tag: String,
        asset: String,
        sha256: String,
        bytes: u64,
        url: Option<String>,
    ) -> Result<(), String> {
        let app_for_task = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            install_blocking(
                &app_for_task,
                &slug,
                &tag,
                &asset,
                &sha256,
                bytes,
                url.as_deref(),
            )
        })
        .await
        .map_err(|error| error.to_string())?
    }

    #[tauri::command]
    pub fn list_installed(app: AppHandle) -> Vec<String> {
        let Ok(root) = lite_root(&app) else {
            return Vec::new();
        };
        let Ok(entries) = fs::read_dir(root) else {
            return Vec::new();
        };
        entries
            .filter_map(Result::ok)
            .filter(|entry| entry.path().join("game.exe").exists())
            .filter_map(|entry| entry.file_name().into_string().ok())
            .collect()
    }

    #[tauri::command]
    pub fn uninstall_game(app: AppHandle, slug: String) -> Result<(), String> {
        if !valid_slug(&slug) {
            return Err("invalid game slug".to_string());
        }
        let dir = lite_root(&app)?.join(slug);
        if dir.exists() {
            fs::remove_dir_all(dir).map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    #[tauri::command]
    pub fn token_status(app: AppHandle) -> bool {
        read_token(&app).is_some()
    }

    #[tauri::command]
    pub fn set_token(app: AppHandle, token: String) -> Result<(), String> {
        write_token(&app, Some(token))
    }

    #[tauri::command]
    pub fn clear_token(app: AppHandle) -> Result<(), String> {
        write_token(&app, None)
    }

    #[tauri::command]
    pub fn storage_path(app: AppHandle) -> Result<String, String> {
        Ok(lite_root(&app)?.to_string_lossy().to_string())
    }

    #[tauri::command]
    pub fn installed_size(app: AppHandle) -> u64 {
        fn folder_size(path: &Path) -> u64 {
            let Ok(entries) = fs::read_dir(path) else {
                return 0;
            };
            entries
                .filter_map(Result::ok)
                .map(|entry| {
                    let path = entry.path();
                    if path.is_dir() {
                        folder_size(&path)
                    } else {
                        entry.metadata().map(|meta| meta.len()).unwrap_or(0)
                    }
                })
                .sum()
        }
        lite_root(&app).map(|root| folder_size(&root)).unwrap_or(0)
    }

    #[allow(dead_code)]
    fn _unused_game_dir(app: &AppHandle, slug: &str) -> Option<PathBuf> {
        game_dir(app, slug)
    }
}

#[cfg(not(feature = "lite"))]
mod lite {
    use tauri::AppHandle;

    #[tauri::command]
    pub async fn install_game(
        _app: AppHandle,
        _slug: String,
        _tag: String,
        _asset: String,
        _sha256: String,
        _bytes: u64,
        _url: Option<String>,
    ) -> Result<(), String> {
        Err("this launcher build does not download games".to_string())
    }

    #[tauri::command]
    pub fn list_installed(_app: AppHandle) -> Vec<String> {
        Vec::new()
    }

    #[tauri::command]
    pub fn uninstall_game(_app: AppHandle, _slug: String) -> Result<(), String> {
        Err("this launcher build does not download games".to_string())
    }

    #[tauri::command]
    pub fn token_status(_app: AppHandle) -> bool {
        false
    }

    #[tauri::command]
    pub fn set_token(_app: AppHandle, _token: String) -> Result<(), String> {
        Err("this launcher build does not download games".to_string())
    }

    #[tauri::command]
    pub fn clear_token(_app: AppHandle) -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn storage_path(_app: AppHandle) -> Result<String, String> {
        Ok(String::new())
    }

    #[tauri::command]
    pub fn installed_size(_app: AppHandle) -> u64 {
        0
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            hub_mode,
            launch_game,
            lite::install_game,
            lite::list_installed,
            lite::uninstall_game,
            lite::token_status,
            lite::set_token,
            lite::clear_token,
            lite::storage_path,
            lite::installed_size
        ])
        .run(tauri::generate_context!())
        .expect("Family Arcade failed to start");
}
