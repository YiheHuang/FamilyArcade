//! 安装器式自动更新。
//!
//! 与旧 Electron 版的差别：更新单元从 "app.asar 热替换" 变为 "静默安装新版安装器"，
//! 但仍保留同样的安全属性——
//!   * 版本清单来自更新源（局域网内某台机器），下载后校验 sha256 与 Ed25519 签名；
//!   * 应用自己无法覆盖运行中的 exe，因此把"安装 + 校验 + 回滚"交给一个助手进程
//!     （把自身复制到 `%APPDATA%\Splendor\update-work\` 后以 `--apply-update` 运行）；
//!   * 新版启动后由界面回报 beacon；等不到 beacon 就自动装回上一版。

use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::Duration;

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Digest;
use tauri::{AppHandle, Emitter};

use crate::bridge::log_line;
use crate::paths;

/// 更新源清单（`update.json`）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Manifest {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub installer: String,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub signature: String,
    #[serde(default)]
    pub notes: String,
}

/// 已下载待安装
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pending {
    pub version: String,
    pub sha256: String,
    pub at: i64,
    #[serde(default)]
    pub installer: String,
    #[serde(default)]
    pub signature: String,
}

/// 上次更新的结果（失败时界面提示一次）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateResult {
    pub ok: bool,
    pub version: String,
    #[serde(default)]
    pub reason: String,
    pub at: i64,
}

/// 助手任务
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Job {
    version: String,
    installer: PathBuf,
    #[serde(default)]
    prev_installer: Option<PathBuf>,
    app_exe: PathBuf,
    beacon: PathBuf,
    result: PathBuf,
    log: PathBuf,
    nonce: String,
    #[serde(default)]
    args: Vec<String>,
}

/// 随包分发的 Ed25519 公钥（base64）。私钥保存在 `%APPDATA%\Splendor\keys\`（不入库），
/// 发布脚本用它给安装包签名；这里可用 `%APPDATA%\Splendor\update-pubkey.txt` 覆盖。
const BUILTIN_PUBKEY: &str = "8sx8j9mP8RqYpKUH531J97vn44zAnzgPZF6WuSjWzbo=";

pub fn staged_installer() -> PathBuf {
    paths::update_work_dir().join("staged-installer.exe")
}

pub fn self_installer() -> PathBuf {
    paths::update_work_dir().join("self-installer.exe")
}

fn pending_file() -> PathBuf {
    paths::update_work_dir().join("pending.json")
}

fn result_file() -> PathBuf {
    paths::update_work_dir().join("last-result.json")
}

fn beacon_file() -> PathBuf {
    paths::update_work_dir().join("boot-ok.json")
}

fn settings_file() -> PathBuf {
    paths::data_dir().join("update-settings.json")
}

pub fn read_pending() -> Option<Pending> {
    std::fs::read_to_string(pending_file())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
}

pub fn read_failure() -> Option<UpdateResult> {
    let res: UpdateResult = std::fs::read_to_string(result_file())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())?;
    if res.ok {
        None
    } else {
        Some(res)
    }
}

pub fn clear_failure() {
    let _ = std::fs::remove_file(result_file());
}

// ---------------- 设置（是否允许局域网其他电脑上传） ----------------

pub fn read_allow_publish() -> bool {
    std::fs::read_to_string(settings_file())
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v.get("allowPublish").and_then(|b| b.as_bool()))
        .unwrap_or(false)
}

pub fn write_allow_publish(allow: bool) {
    let _ = std::fs::write(
        settings_file(),
        serde_json::to_string_pretty(&json!({ "allowPublish": allow })).unwrap_or_default(),
    );
}

// ---------------- 签名 ----------------

fn pubkey_bytes() -> Option<[u8; 32]> {
    let override_path = paths::data_dir().join("update-pubkey.txt");
    let text = std::fs::read_to_string(&override_path)
        .ok()
        .map(|t| t.trim().to_string())
        .unwrap_or_else(|| BUILTIN_PUBKEY.trim().to_string());
    if text.is_empty() || text.starts_with("REPLACE_") {
        return None; // 未配置公钥：只做 sha256 校验
    }
    use base64::Engine as _;
    let raw = base64::engine::general_purpose::STANDARD.decode(text).ok()?;
    if raw.len() != 32 {
        return None;
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&raw);
    Some(out)
}

/// 校验 sha256 的 Ed25519 签名；未配置公钥时视为通过。
pub fn verify_signature(sha256_hex: &str, signature_b64: &str) -> Result<(), String> {
    let Some(pubkey) = pubkey_bytes() else {
        return Ok(());
    };
    if signature_b64.is_empty() {
        return Err("missing signature".into());
    }
    use base64::Engine as _;
    let sig_raw = base64::engine::general_purpose::STANDARD
        .decode(signature_b64)
        .map_err(|e| format!("bad signature encoding: {e}"))?;
    let signature = Signature::from_slice(&sig_raw).map_err(|e| format!("bad signature: {e}"))?;
    let key = VerifyingKey::from_bytes(&pubkey).map_err(|e| format!("bad public key: {e}"))?;
    let digest = hex::decode(sha256_hex).map_err(|e| format!("bad digest: {e}"))?;
    key.verify(&digest, &signature).map_err(|_| "signature mismatch".to_string())
}

// ---------------- 网络 ----------------

fn norm_base(source: &str) -> String {
    source.trim().trim_end_matches('/').to_string()
}

fn http_get_json(url: &str) -> Result<Value, String> {
    let res = ureq::get(url)
        .timeout(Duration::from_secs(6))
        .call()
        .map_err(|e| format!("HTTP 失败：{e}"))?;
    res.into_json::<Value>().map_err(|e| format!("响应不是 JSON：{e}"))
}

pub fn fetch_manifest(source: &str) -> Result<Manifest, String> {
    let url = format!("{}/update.json", norm_base(source));
    if norm_base(source).is_empty() {
        return Err("未配置更新源".into());
    }
    let value = http_get_json(&url)?;
    serde_json::from_value(value).map_err(|e| format!("清单格式不对：{e}"))
}

// ---------------- Tauri 命令 ----------------

#[tauri::command]
pub fn update_state() -> Value {
    let staged = read_pending();
    json!({
        "appVersion": env!("CARGO_PKG_VERSION"),
        "updatesDir": paths::updates_dir().to_string_lossy(),
        "staged": staged.map(|p| json!({ "version": p.version, "sha256": p.sha256, "at": p.at })),
        "allowPublish": read_allow_publish(),
        "lastFailure": read_failure().map(|f| json!({ "version": f.version, "status": f.reason, "at": f.at })),
        "hasSelfInstaller": self_installer().exists(),
    })
}

/// 版本比较：只认"更新源比本机新"，避免同版重发或降级被当成更新
fn parse_version(v: &str) -> (u64, u64, u64) {
    let mut parts = v.trim().split('.').map(|p| p.parse::<u64>().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

pub fn is_newer(candidate: &str, current: &str) -> bool {
    parse_version(candidate) > parse_version(current)
}

#[tauri::command]
pub async fn update_check(source: String) -> Value {
    let current = env!("CARGO_PKG_VERSION").to_string();
    match fetch_manifest(&source) {
        Ok(m) if m.version.is_empty() => json!({ "available": false, "current": current, "error": "清单缺少 version" }),
        Ok(m) => json!({
            "available": is_newer(&m.version, &current),
            "version": m.version,
            "notes": m.notes,
            "current": current,
        }),
        Err(err) => json!({ "available": false, "current": current, "error": err }),
    }
}

#[tauri::command]
pub async fn update_download(app: AppHandle, source: String) -> Value {
    let manifest = match fetch_manifest(&source) {
        Ok(m) => m,
        Err(err) => return json!({ "ok": false, "error": err }),
    };
    if manifest.installer.is_empty() {
        return json!({ "ok": false, "error": "清单缺少 installer" });
    }
    let url = format!("{}/{}", norm_base(&source), manifest.installer);
    let res = match ureq::get(&url).timeout(Duration::from_secs(120)).call() {
        Ok(r) => r,
        Err(err) => return json!({ "ok": false, "error": format!("下载失败：{err}") }),
    };
    let mut bytes: Vec<u8> = Vec::with_capacity(manifest.size as usize);
    if let Err(err) = res.into_reader().read_to_end(&mut bytes) {
        return json!({ "ok": false, "error": format!("读取失败：{err}") });
    }
    if bytes.len() < 256 * 1024 {
        return json!({ "ok": false, "error": "安装包体积异常" });
    }
    if !bytes.starts_with(b"MZ") {
        return json!({ "ok": false, "error": "下载内容不是可执行文件" });
    }
    let actual = hex::encode(sha2::Sha256::digest(&bytes));
    if !manifest.sha256.is_empty() && actual != manifest.sha256.to_lowercase() {
        return json!({ "ok": false, "error": "sha256 校验不一致" });
    }
    if let Err(err) = verify_signature(&actual, &manifest.signature) {
        return json!({ "ok": false, "error": err });
    }
    let _ = std::fs::create_dir_all(paths::update_work_dir());
    if let Err(err) = std::fs::write(staged_installer(), &bytes) {
        return json!({ "ok": false, "error": format!("写入失败：{err}") });
    }
    // 上一版安装包（用于回滚）：优先用更新源提供的 prev 包
    let prev_url = format!("{}/Splendor-Setup-prev.exe", norm_base(&source));
    if let Ok(res) = ureq::get(&prev_url).timeout(Duration::from_secs(120)).call() {
        let mut prev_bytes: Vec<u8> = Vec::new();
        if res.into_reader().read_to_end(&mut prev_bytes).is_ok()
            && prev_bytes.len() > 256 * 1024
            && prev_bytes.starts_with(b"MZ")
        {
            let _ = std::fs::write(paths::update_work_dir().join("rollback-installer.exe"), &prev_bytes);
        }
    }
    let pending = Pending {
        version: manifest.version.clone(),
        sha256: actual,
        at: chrono::Local::now().timestamp_millis(),
        installer: manifest.installer.clone(),
        signature: manifest.signature.clone(),
    };
    let _ = std::fs::write(pending_file(), serde_json::to_string_pretty(&pending).unwrap_or_default());
    let _ = app.emit("update://staged", json!({ "version": pending.version }));
    log_line(&format!("更新包已就绪：v{}", pending.version), "info");
    json!({ "ok": true, "version": pending.version })
}

/// 应用更新：把自身复制成助手并以 `--apply-update` 运行，然后退出应用。
#[tauri::command]
pub async fn update_apply(app: AppHandle) -> Value {
    let Some(pending) = read_pending() else {
        return json!({ "ok": false, "error": "没有待安装的更新" });
    };
    let work = paths::update_work_dir();
    let helper = work.join("update-helper.exe");
    let current_exe = std::env::current_exe().unwrap_or_default();
    if let Err(err) = std::fs::copy(&current_exe, &helper) {
        return json!({ "ok": false, "error": format!("复制助手失败：{err}") });
    }
    // 关键：把 exe 同目录的运行库一并复制过去。
    // 助手是独立进程，缺 WebView2Loader.dll 之类会在加载阶段直接退出（表现为"没有任何日志"）。
    if let Some(dir) = current_exe.parent() {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let is_dll = path
                    .extension()
                    .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("dll"))
                    .unwrap_or(false);
                if is_dll {
                    if let Some(name) = path.file_name() {
                        let _ = std::fs::copy(&path, work.join(name));
                    }
                }
            }
        }
    }
    let rollback = work.join("rollback-installer.exe");
    let job = Job {
        version: pending.version.clone(),
        installer: staged_installer(),
        prev_installer: if rollback.exists() { Some(rollback) } else { None },
        app_exe: current_exe,
        beacon: beacon_file(),
        result: result_file(),
        log: paths::logs_dir().join("update.log"),
        nonce: format!("{}-{}", chrono::Local::now().timestamp_millis(), std::process::id()),
        args: std::env::args().skip(1).filter(|a| !a.starts_with("--boot-check")).collect(),
    };
    let job_path = work.join("job.json");
    if let Err(err) = std::fs::write(&job_path, serde_json::to_string_pretty(&job).unwrap_or_default()) {
        return json!({ "ok": false, "error": format!("写入任务失败：{err}") });
    }
    let _ = std::fs::remove_file(&job.beacon);
    log_line(&format!("准备安装 v{}，应用即将退出并自动重启", job.version), "info");
    let log_before = std::fs::metadata(&job.log).map(|m| m.len()).unwrap_or(0);
    if let Err(err) = spawn_helper(&helper, &job_path) {
        return json!({ "ok": false, "error": format!("启动助手失败：{err}") });
    }
    // 助手必须先活下来（写出第一行日志）——否则不要退出应用，避免"关了却没人接"。
    let mut started = false;
    for _ in 0..25 {
        std::thread::sleep(Duration::from_millis(200));
        let len = std::fs::metadata(&job.log).map(|m| m.len()).unwrap_or(0);
        if len > log_before {
            started = true;
            break;
        }
        if let Some(pending) = read_pending() {
            if pending.version != job.version {
                break;
            }
        }
    }
    if !started {
        log_line("更新助手未能启动（可能缺少运行库）；应用保持运行，未做任何改动", "error");
        return json!({ "ok": false, "error": "更新助手未能启动，应用保持运行（未做改动）" });
    }
    let app2 = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(300));
        app2.exit(0);
    });
    json!({ "ok": true, "version": job.version })
}

#[cfg(target_os = "windows")]
fn spawn_helper(helper: &Path, job: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Stdio;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    // 注意：不要用 DETACHED_PROCESS，也不要把 stdio 指向无效句柄——
    // 那会让助手进程在很早的阶段就异常退出（实测 detached + 忽略 stdio 时日志都不出现）。
    // 显式置空三个标准流最稳妥；主进程退出后子进程依然存活。
    std::process::Command::new(helper)
        .arg("--apply-update")
        .arg(job)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
fn spawn_helper(helper: &Path, job: &Path) -> Result<(), String> {
    std::process::Command::new(helper)
        .arg("--apply-update")
        .arg(job)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// 界面就绪：写 beacon，让助手确认新版真的起来了
#[tauri::command]
pub fn ui_ready() -> bool {
    let nonce = std::env::args()
        .collect::<Vec<String>>()
        .windows(2)
        .find(|w| w[0] == "--boot-check")
        .map(|w| w[1].clone())
        .or_else(|| {
            std::env::args()
                .find_map(|a| a.strip_prefix("--boot-check=").map(|s| s.to_string()))
        });
    let Some(nonce) = nonce else { return false };
    let payload = json!({
        "nonce": nonce,
        "version": env!("CARGO_PKG_VERSION"),
        "at": chrono::Local::now().timestamp_millis(),
    });
    let _ = std::fs::write(beacon_file(), serde_json::to_string_pretty(&payload).unwrap_or_default());
    true
}

/// 把本机保留的安装包发布到本机更新源（供其他电脑拉取）
#[tauri::command]
pub fn update_publish() -> Value {
    let source_file = if self_installer().exists() { self_installer() } else { staged_installer() };
    if !source_file.exists() {
        return json!({ "ok": false, "error": "本机没有可发布的安装包（本机是手动安装的，可从其他电脑共享）" });
    }
    let bytes = match std::fs::read(&source_file) {
        Ok(b) => b,
        Err(err) => return json!({ "ok": false, "error": format!("读取失败：{err}") }),
    };
    let version = env!("CARGO_PKG_VERSION").to_string();
    let sha = hex::encode(sha2::Sha256::digest(&bytes));
    let dir = paths::updates_dir();
    let name = format!("Splendor-Setup-{version}.exe");
    // 旧包留作回滚
    if let Ok(prev) = std::fs::read_to_string(dir.join("update.json")) {
        if let Ok(v) = serde_json::from_str::<Value>(&prev) {
            if let Some(prev_name) = v.get("installer").and_then(|x| x.as_str()) {
                let _ = std::fs::copy(dir.join(prev_name), dir.join("Splendor-Setup-prev.exe"));
            }
        }
        let _ = std::fs::copy(dir.join("update.json"), dir.join("update.json.prev"));
    }
    if let Err(err) = std::fs::write(dir.join(&name), &bytes) {
        return json!({ "ok": false, "error": format!("写入失败：{err}") });
    }
    let manifest = json!({
        "version": version,
        "installer": name,
        "sha256": sha,
        "size": bytes.len(),
        "signature": "",
        "createdAt": chrono::Local::now().to_rfc3339(),
        "notes": "shared from another family PC",
    });
    let _ = std::fs::write(dir.join("update.json"), serde_json::to_string_pretty(&manifest).unwrap_or_default());
    log_line(&format!("已发布本机版本 v{version} 到本机更新源"), "info");
    json!({ "ok": true, "version": version, "sha256": sha, "size": bytes.len(), "dir": dir.to_string_lossy() })
}

/// 把本机安装包上传给更新源服务器（对方需开启）
#[tauri::command]
pub async fn update_upload(source: String) -> Value {
    let source_file = if self_installer().exists() { self_installer() } else { staged_installer() };
    if !source_file.exists() {
        return json!({ "ok": false, "error": "本机没有可共享的安装包（本机是手动安装的，可从其他电脑共享）" });
    }
    let bytes = match std::fs::read(&source_file) {
        Ok(b) => b,
        Err(err) => return json!({ "ok": false, "error": format!("读取失败：{err}") }),
    };
    let version = env!("CARGO_PKG_VERSION").to_string();
    let sha = hex::encode(sha2::Sha256::digest(&bytes));
    let url = format!("{}/publish", norm_base(&source));
    let res = ureq::post(&url)
        .timeout(Duration::from_secs(120))
        .set("content-type", "application/octet-stream")
        .set("x-splendor-version", &version)
        .set("x-splendor-sha256", &sha)
        .set("x-splendor-notes", "shared from another family PC")
        .send_bytes(&bytes);
    match res {
        Ok(resp) => {
            let body: Value = resp.into_json().unwrap_or_else(|_| json!({ "ok": false }));
            if body.get("ok").and_then(|b| b.as_bool()) == Some(true) {
                json!({ "ok": true, "version": version })
            } else {
                json!({ "ok": false, "error": body.get("error").and_then(|e| e.as_str()).unwrap_or("服务器拒绝") })
            }
        }
        Err(err) => json!({ "ok": false, "error": format!("上传失败：{err}") }),
    }
}

#[tauri::command]
pub fn update_permission_get() -> Value {
    json!({ "allowPublish": read_allow_publish() })
}

#[tauri::command]
pub fn update_permission_set(state: tauri::State<'_, std::sync::Arc<crate::net::NetState>>, allow: bool) -> Value {
    write_allow_publish(allow);
    state.allow_publish.store(allow, Ordering::SeqCst);
    log_line(&format!("局域网更新包上传：{}", if allow { "已开启" } else { "已关闭" }), "info");
    json!({ "allowPublish": allow })
}

#[tauri::command]
pub fn update_ack_failure() -> bool {
    clear_failure();
    true
}

// ---------------- 助手进程 ----------------

/// 助手模式入口：等主应用退出 → 静默安装 → 启动并等 beacon → 失败则回滚。
pub fn run_helper_if_requested() -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    let idx = args.iter().position(|a| a == "--apply-update")?;
    let job_path = args.get(idx + 1)?.clone();
    let code = run_helper(Path::new(&job_path));
    Some(code)
}

fn helper_log(job: &Job, line: &str) {
    let stamp = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&job.log) {
        use std::io::Write;
        let _ = writeln!(f, "[{stamp}] {line}");
    }
}

fn run_helper(job_path: &Path) -> i32 {
    let job: Job = match std::fs::read_to_string(job_path).ok().and_then(|t| serde_json::from_str(&t).ok()) {
        Some(j) => j,
        None => {
            // 解析失败也要留下证据（助手是无人值守进程，日志是唯一线索）
            let fallback = paths::logs_dir().join("update-helper-error.log");
            let _ = std::fs::write(
                &fallback,
                format!(
                    "{} 无法读取任务文件：{}\n",
                    chrono::Local::now().to_rfc3339(),
                    job_path.display()
                ),
            );
            return 2;
        }
    };
    helper_log(&job, &format!("助手启动：准备安装 v{}", job.version));
    std::thread::sleep(Duration::from_millis(2500));

    let _ = std::fs::remove_file(&job.beacon);
    let mut installed = false;
    for attempt in 1..=3 {
        match run_installer(&job.installer) {
            Ok(()) => {
                installed = true;
                break;
            }
            Err(err) => helper_log(&job, &format!("第 {attempt} 次安装失败：{err}")),
        }
        std::thread::sleep(Duration::from_millis(1500));
    }
    if !installed {
        helper_log(&job, "安装失败，尝试回滚");
        return finish(&job, false, "installer failed");
    }
    // 保留本机安装包，便于日后向其他电脑共享
    let _ = std::fs::copy(&job.installer, self_installer());

    let mut child = match launch_app(&job, true) {
        Ok(c) => c,
        Err(err) => {
            helper_log(&job, &format!("启动新版失败：{err}"));
            return rollback(&job, "launch failed");
        }
    };
    helper_log(&job, "已启动新版，等待界面 beacon…");
    let deadline = std::time::Instant::now() + Duration::from_secs(75);
    while std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(1200));
        if let Some(ok) = beacon_matches(&job) {
            if ok {
                helper_log(&job, "新版启动成功");
                // 注意：不要杀掉刚启动的新版——家人应该看到更新后的应用正常打开
                return finish(&job, true, "");
            }
        }
        if let Ok(Some(_)) = child.try_wait() {
            helper_log(&job, "新版进程退出（未回报 beacon）");
            return rollback(&job, "app exited before beacon");
        }
    }
    helper_log(&job, "等待 beacon 超时");
    let _ = child.kill();
    rollback(&job, "no beacon")
}

fn beacon_matches(job: &Job) -> Option<bool> {
    let text = std::fs::read_to_string(&job.beacon).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    if value.get("nonce").and_then(|n| n.as_str()) == Some(job.nonce.as_str()) {
        Some(true)
    } else {
        Some(false)
    }
}

fn rollback(job: &Job, reason: &str) -> i32 {
    match &job.prev_installer {
        Some(prev) if prev.exists() => {
            helper_log(job, "回滚：安装上一版安装包");
            match run_installer(prev) {
                Ok(()) => {
                    let _ = launch_app(job, false);
                    finish(job, false, reason)
                }
                Err(err) => {
                    helper_log(job, &format!("回滚安装失败：{err}"));
                    let _ = launch_app(job, false);
                    finish(job, false, &format!("{reason}; rollback failed: {err}"))
                }
            }
        }
        _ => {
            helper_log(job, "没有可用的上一版安装包，仅重启应用并报告失败");
            let _ = launch_app(job, false);
            finish(job, false, reason)
        }
    }
}

fn finish(job: &Job, ok: bool, reason: &str) -> i32 {
    let result = UpdateResult {
        ok,
        version: job.version.clone(),
        reason: reason.to_string(),
        at: chrono::Local::now().timestamp_millis(),
    };
    let _ = std::fs::write(&job.result, serde_json::to_string_pretty(&result).unwrap_or_default());
    if ok {
        let _ = std::fs::remove_file(&job.installer);
        let _ = std::fs::remove_file(pending_file());
    }
    helper_log(job, if ok { "完成" } else { "完成（已回滚）" });
    if ok { 0 } else { 1 }
}

#[cfg(target_os = "windows")]
fn run_installer(installer: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let status = std::process::Command::new(installer)
        .arg("/S")
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("退出码 {:?}", status.code()))
    }
}

#[cfg(not(target_os = "windows"))]
fn run_installer(installer: &Path) -> Result<(), String> {
    let status = std::process::Command::new(installer).arg("/S").status().map_err(|e| e.to_string())?;
    if status.success() { Ok(()) } else { Err(format!("退出码 {:?}", status.code())) }
}

#[cfg(target_os = "windows")]
fn launch_app(job: &Job, with_boot_check: bool) -> Result<std::process::Child, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    let mut cmd = std::process::Command::new(&job.app_exe);
    cmd.args(&job.args);
    if with_boot_check {
        cmd.arg("--boot-check").arg(&job.nonce);
    }
    cmd.creation_flags(CREATE_NEW_PROCESS_GROUP)
        .spawn()
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
fn launch_app(job: &Job, with_boot_check: bool) -> Result<std::process::Child, String> {
    let mut cmd = std::process::Command::new(&job.app_exe);
    cmd.args(&job.args);
    if with_boot_check {
        cmd.arg("--boot-check").arg(&job.nonce);
    }
    cmd.spawn().map_err(|e| e.to_string())
}

/// 主程序启动时调用：清掉陈旧的 beacon，并报告是否有等待中的更新
pub fn boot_note() {
    let _ = std::fs::create_dir_all(paths::update_work_dir());
    if let Some(pending) = read_pending() {
        log_line(&format!("检测到待安装更新：v{}（重启后由助手处理）", pending.version), "info");
    }
    if let Some(failure) = read_failure() {
        log_line(&format!("上次更新失败并已回滚：v{}（{}）", failure.version, failure.reason), "warn");
    }
}
