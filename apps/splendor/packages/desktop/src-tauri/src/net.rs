//! 局域网联机：由主机应用持有的 HTTP + WebSocket 服务。
//!
//! 架构（与兄弟项目 Blokus 一致）：Rust 侧是"哑中继"——
//!   * 静态托管内嵌的前端产物（手机浏览器直接打开）；
//!   * 把每条 WebSocket 连接的消息通过 Tauri 事件转发给主机窗口的前端；
//!   * 主机前端（同一份经过测试的 `RoomManager`）是权威，回包再由 `lan_send` 发回。
//!
//! 因此规则逻辑零重复：Node 宿主（`npm run lan`、CI）与桌面宿主共用同一份 TypeScript。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use sha2::Digest;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, Mutex};

use crate::paths;

/// 依次尝试的端口（8080 被占用时自动顺延）
const LAN_PORTS: [u16; 6] = [8080, 8081, 8082, 8083, 8084, 8085];

#[derive(Debug, Clone, Serialize)]
pub struct HostInfo {
    pub port: u16,
    pub urls: Vec<String>,
}

pub struct NetState {
    pub app: AppHandle,
    pub host: Mutex<Option<HostInfo>>,
    pub shutdown: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub conns: Mutex<HashMap<u64, mpsc::UnboundedSender<String>>>,
    pub next_id: AtomicU64,
    pub clients: AtomicU64,
    /// 是否允许局域网内其他电脑上传更新包（默认关，设置页可开）
    pub allow_publish: std::sync::atomic::AtomicBool,
}

impl NetState {
    pub fn new(app: AppHandle) -> Arc<Self> {
        Arc::new(Self {
            app,
            host: Mutex::new(None),
            shutdown: Mutex::new(None),
            conns: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            clients: AtomicU64::new(0),
            allow_publish: std::sync::atomic::AtomicBool::new(false),
        })
    }
}

/// 单条消息上限（协议里全是小 JSON；64KB 足够且能挡住异常大帧）
const MAX_MESSAGE_BYTES: usize = 64 * 1024;
/// 每连接每秒消息上限
const MAX_MESSAGES_PER_SEC: u32 = 40;
/// 同时连接数上限
const MAX_CLIENTS: u64 = 16;

/// 枚举可供家人使用的局域网地址（过滤虚拟网卡，按"更像家庭网段"排序）
pub fn lan_urls(port: u16) -> Vec<String> {
    let mut found: Vec<(u8, String)> = Vec::new();
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            if iface.is_loopback() {
                continue;
            }
            let name = iface.name.to_lowercase();
            let addr = iface.addr;
            let ip = match addr.ip() {
                std::net::IpAddr::V4(v4) => v4,
                std::net::IpAddr::V6(_) => continue,
            };
            let mut score: u8 = if ip.octets()[0] == 192 && ip.octets()[1] == 168 {
                0
            } else if ip.octets()[0] == 10 {
                1
            } else if ip.octets()[0] == 172 && (16..=31).contains(&ip.octets()[1]) {
                2
            } else {
                3
            };
            if looks_virtual(&name) {
                score += 10;
            }
            found.push((score, format!("http://{ip}:{port}")));
        }
    }
    found.sort_by(|a, b| a.0.cmp(&b.0));
    found.into_iter().map(|(_, url)| url).collect()
}

fn looks_virtual(name: &str) -> bool {
    ["vethernet", "virtual", "vmware", "virtualbox", "hyper-v", "wsl", "docker", "tailscale", "zerotier", "loopback", "bluetooth", "tun", "tap"]
        .iter()
        .any(|k| name.contains(k))
}

// ---------------- Tauri 命令 ----------------

#[tauri::command]
pub async fn lan_addresses() -> Vec<String> {
    // 端口未知时给出 8080（大厅只用于显示候选地址）
    lan_urls(8080)
}

#[tauri::command]
pub async fn host_status(state: tauri::State<'_, Arc<NetState>>) -> Result<Option<HostInfo>, String> {
    Ok(state.host.lock().await.clone())
}

#[tauri::command]
pub async fn host_start(state: tauri::State<'_, Arc<NetState>>, port: Option<u16>) -> Result<HostInfo, String> {
    start_host(&state.inner().clone(), port).await
}

#[tauri::command]
pub async fn host_stop(state: tauri::State<'_, Arc<NetState>>) -> Result<(), String> {
    stop_host(&state.inner().clone()).await;
    Ok(())
}

/// 主机前端把一条消息发给某个浏览器连接
#[tauri::command]
pub async fn lan_send(state: tauri::State<'_, Arc<NetState>>, id: u64, text: String) -> Result<(), String> {    let tx = state.conns.lock().await.get(&id).cloned();
    match tx {
        Some(tx) => tx.send(text).map_err(|e| e.to_string()),
        None => Err("connection closed".into()),
    }
}

/// 当前连接数（大厅显示"已连接 N 台"）
#[tauri::command]
pub async fn lan_client_count(state: tauri::State<'_, Arc<NetState>>) -> Result<u64, String> {
    Ok(state.clients.load(Ordering::SeqCst))
}

/// 更新源信息（主机前端在 welcome 里通告给所有客户端）
#[tauri::command]
pub fn update_source(state: tauri::State<'_, Arc<NetState>>) -> serde_json::Value {
    update_source_info(state.allow_publish.load(Ordering::SeqCst))
}

// ---------------- 服务器本体 ----------------

pub async fn start_host(state: &Arc<NetState>, preferred: Option<u16>) -> Result<HostInfo, String> {
    stop_host(state).await;

    let ports: Vec<u16> = match preferred {
        Some(p) if p > 0 => vec![p],
        _ => LAN_PORTS.to_vec(),
    };
    let mut listener: Option<TcpListener> = None;
    let mut last_err = String::new();
    for port in ports {
        match TcpListener::bind(("0.0.0.0", port)).await {
            Ok(l) => {
                listener = Some(l);
                break;
            }
            Err(e) => last_err = format!("port {port}: {e}"),
        }
    }
    let listener = listener.ok_or_else(|| format!("no free port ({last_err})"))?;
    let bound = listener.local_addr().map(|a| a.port()).unwrap_or(8080);

    let router = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/ws", get(ws_upgrade))
        .route("/updates/publish", axum::routing::post(publish_update))
        .fallback(get(static_or_updates))
        .with_state(state.clone());

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    *state.shutdown.lock().await = Some(tx);

    let info = HostInfo {
        port: bound,
        urls: lan_urls(bound),
    };
    *state.host.lock().await = Some(info.clone());

    let st = state.clone();
    tokio::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
        // 服务退出：清理连接与状态
        st.conns.lock().await.clear();
        st.clients.store(0, Ordering::SeqCst);
        let _ = st.app.emit("lan://host-stopped", json!({}));
    });

    let _ = state.app.emit("lan://host-started", &info);
    Ok(info)
}

pub async fn stop_host(state: &Arc<NetState>) {
    if let Some(tx) = state.shutdown.lock().await.take() {
        let _ = tx.send(());
    }
    *state.host.lock().await = None;
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    headers: axum::http::HeaderMap,
    State(st): State<Arc<NetState>>,
) -> Response {
    if !origin_allowed(&headers) {
        return (StatusCode::FORBIDDEN, "Forbidden origin").into_response();
    }
    if st.clients.load(Ordering::SeqCst) >= MAX_CLIENTS {
        return (StatusCode::SERVICE_UNAVAILABLE, "Too many connections").into_response();
    }
    ws.max_message_size(MAX_MESSAGE_BYTES)
        .max_frame_size(MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| handle_socket(socket, st))
}

/// 局域网安全：只接受本机/局域网页面、桌面壳（Tauri 方案）以及无 Origin 的原生客户端。
/// 公网页面即使知道局域网地址也无法建立 WebSocket。
fn origin_allowed(headers: &axum::http::HeaderMap) -> bool {
    let origin = match headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        Some(v) => v,
        None => return true, // 原生客户端/测试客户端不带 Origin
    };
    if origin == "tauri://localhost" || origin == "http://tauri.localhost" || origin == "https://tauri.localhost" {
        return true;
    }
    let host = match origin.split("://").nth(1) {
        Some(rest) => rest.split('/').next().unwrap_or("").to_string(),
        None => return false,
    };
    let hostname = host.split(':').next().unwrap_or("").to_string();
    let private = hostname == "localhost"
        || hostname == "127.0.0.1"
        || hostname == "[::1]"
        || hostname.starts_with("192.168.")
        || hostname.starts_with("10.")
        || hostname.ends_with(".local")
        || hostname
            .split('.')
            .next()
            .map(|first| first == "172" && hostname.split('.').nth(1).and_then(|s| s.parse::<u8>().ok()).is_some_and(|n| (16..=31).contains(&n)))
            .unwrap_or(false);
    if !private {
        log_line(&format!("拒绝来自 {origin} 的 WebSocket 连接（非局域网来源）"), "warn");
    }
    private
}

fn log_line(line: &str, level: &str) {
    crate::bridge::log_line(line, level);
}

async fn handle_socket(socket: WebSocket, st: Arc<NetState>) {
    let id = st.next_id.fetch_add(1, Ordering::SeqCst);
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    st.conns.lock().await.insert(id, tx);
    st.clients.fetch_add(1, Ordering::SeqCst);
    let _ = st.app.emit("lan://open", json!({ "id": id }));

    let writer = tokio::spawn(async move {
        while let Some(text) = rx.recv().await {
            if sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    // 简易限流：每秒最多 MAX_MESSAGES_PER_SEC 条
    let mut window_start = std::time::Instant::now();
    let mut window_count: u32 = 0;

    while let Some(Ok(msg)) = stream.next().await {
        match msg {
            Message::Text(text) => {
                if window_start.elapsed() >= std::time::Duration::from_secs(1) {
                    window_start = std::time::Instant::now();
                    window_count = 0;
                }
                window_count += 1;
                if window_count > MAX_MESSAGES_PER_SEC {
                    log_line("连接消息频率过高，已断开", "warn");
                    break;
                }
                let _ = st.app.emit("lan://msg", json!({ "id": id, "text": text.to_string() }));
            }
            Message::Close(_) => break,
            Message::Binary(_) => { /* 协议只用文本帧 */ }
            _ => {}
        }
    }

    st.conns.lock().await.remove(&id);
    st.clients.fetch_sub(1, Ordering::SeqCst);
    let _ = st.app.emit("lan://close", json!({ "id": id }));
    writer.abort();
}

/// `/updates/<file>` 从 `%APPDATA%\Splendor\updates` 读取；其余路径走内嵌前端（SPA 回退）。
///
/// 前端资源**只内嵌一份**：由 Tauri 按 `frontendDist` 打进可执行文件，
/// 这里通过 `AssetResolver` 取同一份，避免把资源重复嵌入两次。
async fn static_or_updates(uri: Uri, State(st): State<Arc<NetState>>) -> Response {
    let path = uri.path();
    if let Some(rest) = path.strip_prefix("/updates/") {
        let rel = percent_decode(rest);
        if rel.contains("..") {
            return (StatusCode::FORBIDDEN, "Forbidden").into_response();
        }
        let file = paths::updates_dir().join(&rel);
        return match std::fs::read(&file) {
            Ok(bytes) => {
                let mime = if rel.ends_with(".json") {
                    "application/json; charset=utf-8"
                } else {
                    "application/octet-stream"
                };
                ([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, "no-cache")], bytes).into_response()
            }
            Err(_) => (StatusCode::NOT_FOUND, "Not Found").into_response(),
        };
    }

    let rel = path.trim_start_matches('/');
    let rel = if rel.is_empty() { "index.html" } else { rel };
    let assets = st.app.asset_resolver();
    let asset = assets.get(rel.to_string()).or_else(|| assets.get(format!("/{rel}"))).or_else(|| {
        // SPA 回退：找不到的路径一律交给 index.html
        assets.get("index.html".to_string()).or_else(|| assets.get("/index.html".to_string()))
    });
    match asset {
        Some(asset) => {
            let mime = if asset.mime_type.is_empty() { mime_for(rel) } else { asset.mime_type.as_str() };
            ([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, "no-cache")], asset.bytes).into_response()
        }
        None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
    }
}

// ---------------- 更新包发布通道（局域网内其他电脑共享新版） ----------------

/// 更新源信息：welcome 通告与设置页显示（版本、是否允许上传）
pub fn update_source_info(allow_publish: bool) -> serde_json::Value {
    let manifest = std::fs::read_to_string(paths::updates_dir().join("update.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
    let version = manifest
        .as_ref()
        .and_then(|m| m.get("version"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let installer = manifest
        .as_ref()
        .and_then(|m| m.get("installer"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    json!({
        "updates": true,
        "updatePublish": allow_publish,
        "updateVersion": if version.is_empty() { serde_json::Value::Null } else { json!(version) },
        "installer": if installer.is_empty() { serde_json::Value::Null } else { json!(installer) },
    })
}

fn json_reply(status: StatusCode, body: serde_json::Value) -> Response {
    (status, [(header::CONTENT_TYPE, "application/json; charset=utf-8")], body.to_string()).into_response()
}

/// POST /updates/publish：接收一个安装器（NSIS），校验后落盘为更新源。
/// 需在设置页显式开启（默认关闭）。
async fn publish_update(
    State(st): State<Arc<NetState>>,
    headers: axum::http::HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    if !st.allow_publish.load(Ordering::SeqCst) {
        return json_reply(StatusCode::FORBIDDEN, json!({ "ok": false, "error": "update publish is disabled on this server" }));
    }
    let header_str = |name: &str| -> String {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string()
    };
    let version = header_str("x-splendor-version");
    let sha = header_str("x-splendor-sha256").to_lowercase();
    let signature = header_str("x-splendor-signature");
    let notes = header_str("x-splendor-notes");

    if !(1..=32).contains(&version.len())
        || !version.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '+')
    {
        return json_reply(StatusCode::BAD_REQUEST, json!({ "ok": false, "error": "invalid version" }));
    }
    let size = body.len();
    if size < 256 * 1024 || size > 128 * 1024 * 1024 {
        return json_reply(StatusCode::BAD_REQUEST, json!({ "ok": false, "error": "payload too small or too large" }));
    }
    if sha.len() != 64 || !sha.chars().all(|c| c.is_ascii_hexdigit()) {
        return json_reply(StatusCode::BAD_REQUEST, json!({ "ok": false, "error": "invalid sha256" }));
    }
    let actual = hex::encode(sha2::Sha256::digest(&body));
    if actual != sha {
        return json_reply(StatusCode::BAD_REQUEST, json!({ "ok": false, "error": "sha256 mismatch" }));
    }
    if !body.starts_with(b"MZ") {
        return json_reply(StatusCode::BAD_REQUEST, json!({ "ok": false, "error": "not a Windows installer" }));
    }
    if let Err(err) = crate::update::verify_signature(&actual, &signature) {
        return json_reply(StatusCode::BAD_REQUEST, json!({ "ok": false, "error": err }));
    }

    let dir = paths::updates_dir();
    let installer_name = format!("Splendor-Setup-{version}.exe");
    let target = dir.join(&installer_name);
    let tmp = dir.join("installer.tmp");
    if let Err(err) = std::fs::write(&tmp, &body) {
        return json_reply(StatusCode::INTERNAL_SERVER_ERROR, json!({ "ok": false, "error": format!("write failed: {err}") }));
    }
    // 旧包留作回滚来源
    if let Ok(prev_manifest) = std::fs::read_to_string(dir.join("update.json")) {
        if let Ok(prev) = serde_json::from_str::<serde_json::Value>(&prev_manifest) {
            let prev_installer = prev.get("installer").and_then(|v| v.as_str()).unwrap_or("");
            if !prev_installer.is_empty() {
                let _ = std::fs::copy(dir.join(prev_installer), dir.join("Splendor-Setup-prev.exe"));
            }
        }
        let _ = std::fs::copy(dir.join("update.json"), dir.join("update.json.prev"));
    }
    if let Err(err) = std::fs::rename(&tmp, &target) {
        return json_reply(StatusCode::INTERNAL_SERVER_ERROR, json!({ "ok": false, "error": format!("rename failed: {err}") }));
    }
    let manifest = json!({
        "version": version,
        "installer": installer_name,
        "sha256": actual,
        "size": size,
        "signature": signature,
        "createdAt": chrono::Local::now().to_rfc3339(),
        "notes": notes,
    });
    let _ = std::fs::write(dir.join("update.json"), serde_json::to_string_pretty(&manifest).unwrap_or_default());
    log_line(
        &format!("已接收更新包 v{version}（{} MB，来自局域网）", size / 1024 / 1024),
        "info",
    );
    let _ = st.app.emit("update://source-changed", json!({ "version": manifest["version"].clone() }));
    json_reply(StatusCode::OK, json!({ "ok": true, "version": manifest["version"].clone() }))
}

fn percent_decode(raw: &str) -> String {    let mut out = String::with_capacity(raw.len());
    let bytes = raw.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&raw[i + 1..i + 3], 16) {
                out.push(v as char);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

fn mime_for(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".js") {
        "text/javascript; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "image/jpeg"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else if path.ends_with(".ogg") {
        "audio/ogg"
    } else if path.ends_with(".woff2") {
        "font/woff2"
    } else {
        "application/octet-stream"
    }
}
