//! Shared LAN relay for Family Arcade games.
//!
//! The Rust side is deliberately a dumb host:
//! - serves the built web app so phones can join from a browser;
//! - relays small JSON messages over WebSocket;
//! - lets the first connected client act as the authoritative game host.
//!
//! All game rules, room codes and hidden-information views live in TypeScript.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, Mutex};
use tower_http::services::{ServeDir, ServeFile};

const PORTS: [u16; 8] = [8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087];
const MAX_MESSAGE_BYTES: usize = 128 * 1024;
const MAX_CLIENTS: u64 = 16;

static STATE: OnceLock<Arc<LanState>> = OnceLock::new();

#[derive(Clone, Debug, Serialize)]
pub struct HostInfo {
    pub port: u16,
    pub urls: Vec<String>,
    pub token: String,
}

struct Client {
    room: String,
    tx: mpsc::UnboundedSender<String>,
}

pub struct LanState {
    app: tauri::AppHandle,
    info: Mutex<Option<HostInfo>>,
    shutdown: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    clients: Mutex<HashMap<u64, Client>>,
    host_id: Mutex<Option<u64>>,
    next_id: AtomicU64,
}

/// Create the process-wide state. Safe to call more than once.
pub fn init(app: tauri::AppHandle) -> Arc<LanState> {
    STATE
        .get_or_init(|| {
            Arc::new(LanState {
                app,
                info: Mutex::new(None),
                shutdown: Mutex::new(None),
                clients: Mutex::new(HashMap::new()),
                host_id: Mutex::new(None),
                next_id: AtomicU64::new(1),
            })
        })
        .clone()
}

fn state() -> Result<Arc<LanState>, String> {
    STATE
        .get()
        .cloned()
        .ok_or_else(|| "LAN state not initialised; call familyarcade_lan_host::init in setup".to_string())
}

/// Enumerate plausible family-LAN addresses, private ranges first.
pub fn lan_urls(port: u16) -> Vec<String> {
    let mut found: Vec<(u8, String)> = Vec::new();
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            if iface.is_loopback() {
                continue;
            }
            let name = iface.name.to_lowercase();
            let ip = match iface.addr.ip() {
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
            if is_virtual(&name) {
                score += 10;
            }
            found.push((score, format!("http://{ip}:{port}")));
        }
    }
    found.sort_by(|a, b| a.0.cmp(&b.0));
    found.into_iter().map(|(_, url)| url).collect()
}

fn is_virtual(name: &str) -> bool {
    [
        "vethernet",
        "virtual",
        "vmware",
        "virtualbox",
        "hyper-v",
        "wsl",
        "docker",
        "tailscale",
        "zerotier",
        "bluetooth",
        "tun",
        "tap",
    ]
    .iter()
    .any(|k| name.contains(k))
}

fn random_token() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}{:x}", nanos, std::process::id())
}

fn dist_dir(app: &tauri::AppHandle) -> PathBuf {
    use tauri::Manager;
    if let Ok(dir) = std::env::var("FAMILYARCADE_DIST") {
        return PathBuf::from(dir);
    }
    if let Ok(resource) = app.path().resource_dir() {
        let candidate = resource.join("dist");
        if candidate.join("index.html").exists() {
            return candidate;
        }
    }
    for candidate in [
        PathBuf::from("../dist"),
        PathBuf::from("dist"),
        PathBuf::from("../../dist"),
    ] {
        if candidate.join("index.html").exists() {
            return candidate;
        }
    }
    PathBuf::from("../dist")
}

pub async fn start(app: tauri::AppHandle) -> Result<HostInfo, String> {
    let state = init(app);
    if let Some(info) = state.info.lock().await.clone() {
        return Ok(info);
    }

    let dist = dist_dir(&state.app);
    let index = dist.join("index.html");
    let service = ServeDir::new(&dist).not_found_service(ServeFile::new(index));
    let app_state = state.clone();
    let router = Router::new()
        .route("/ws", get(ws_handler))
        .fallback_service(service)
        .with_state(app_state);

    let mut last_error = String::new();
    for port in PORTS {
        match TcpListener::bind(("0.0.0.0", port)).await {
            Ok(listener) => {
                let (tx, rx) = tokio::sync::oneshot::channel::<()>();
                let info = HostInfo {
                    port,
                    urls: lan_urls(port),
                    token: random_token(),
                };
                *state.info.lock().await = Some(info.clone());
                *state.shutdown.lock().await = Some(tx);
                tauri::async_runtime::spawn(async move {
                    let server = axum::serve(listener, router).with_graceful_shutdown(async {
                        let _ = rx.await;
                    });
                    if let Err(err) = server.await {
                        tracing::error!("LAN server stopped: {err}");
                    }
                });
                return Ok(info);
            }
            Err(err) => last_error = format!("port {port}: {err}"),
        }
    }
    Err(format!("could not start LAN server: {last_error}"))
}

pub async fn status() -> Option<HostInfo> {
    let state = state().ok()?;
    let info = state.info.lock().await.clone();
    info
}

pub async fn stop() -> Result<(), String> {
    let state = state()?;
    if let Some(tx) = state.shutdown.lock().await.take() {
        let _ = tx.send(());
    }
    *state.info.lock().await = None;
    state.clients.lock().await.clear();
    *state.host_id.lock().await = None;
    Ok(())
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<LanState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<LanState>) {
    let id = state.next_id.fetch_add(1, Ordering::SeqCst);
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    {
        let mut clients = state.clients.lock().await;
        if clients.len() as u64 >= MAX_CLIENTS {
            let _ = sink
                .send(Message::Text(
                    json!({"t":"error","code":"full","msg":"room is full"}).to_string().into(),
                ))
                .await;
            return;
        }
        clients.insert(
            id,
            Client {
                room: String::new(),
                tx: tx.clone(),
            },
        );
    }

    let _ = tx.send(json!({"t":"hello","id":id}).to_string());

    let writer = tauri::async_runtime::spawn(async move {
        while let Some(text) = rx.recv().await {
            if sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    let mut room = String::new();
    let mut is_host = false;

    while let Some(Ok(message)) = stream.next().await {
        let text = match message {
            Message::Text(text) => text.to_string(),
            Message::Close(_) => break,
            _ => continue,
        };
        if text.len() > MAX_MESSAGE_BYTES {
            let _ = tx.send(json!({"t":"error","code":"too-large"}).to_string());
            continue;
        }
        let mut value: Value = match serde_json::from_str(&text) {
            Ok(value) => value,
            Err(_) => {
                let _ = tx.send(json!({"t":"error","code":"bad-json"}).to_string());
                continue;
            }
        };

        let kind = value.get("t").and_then(Value::as_str).unwrap_or("");
        if kind == "join" {
            room = value
                .get("room")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            {
                let mut clients = state.clients.lock().await;
                if let Some(client) = clients.get_mut(&id) {
                    client.room = room.clone();
                }
            }
            let mut host_slot = state.host_id.lock().await;
            if host_slot.is_none() && value.get("host").and_then(Value::as_bool) == Some(true) {
                *host_slot = Some(id);
            }
            is_host = *host_slot == Some(id);
            drop(host_slot);

            let peer = json!({
                "t":"peer-join",
                "id":id,
                "room":room,
                "name":value.get("name").cloned().unwrap_or(Value::String("Player".into())),
                "token":value.get("token").cloned().unwrap_or(Value::Null),
                "code":value.get("code").cloned().unwrap_or(Value::Null),
                "host":is_host,
            })
            .to_string();
            broadcast_room(&state, &room, Some(id), peer, None).await;
            let welcome = json!({
                "t":"welcome",
                "id":id,
                "host":is_host,
                "port":state.info.lock().await.as_ref().map(|i| i.port).unwrap_or(0),
            })
            .to_string();
            let _ = tx.send(welcome);
            continue;
        }

        if room.is_empty() {
            let _ = tx.send(
                json!({"t":"error","code":"not-joined","msg":"send join first"}).to_string(),
            );
            continue;
        }

        if let Some(object) = value.as_object_mut() {
            object.insert("from".into(), json!(id));
        }
        let outgoing = value.to_string();
        let to = value.get("to").and_then(Value::as_u64);

        if is_host {
            broadcast_room(&state, &room, Some(id), outgoing, to).await;
        } else {
            let host = *state.host_id.lock().await;
            if let Some(host_id) = host {
                send_to(&state, host_id, outgoing).await;
            }
        }
    }

    state.clients.lock().await.remove(&id);
    {
        let mut host_slot = state.host_id.lock().await;
        if *host_slot == Some(id) {
            *host_slot = None;
        }
    }
    let leave = json!({"t":"peer-leave","id":id,"room":room}).to_string();
    broadcast_room(&state, &room, Some(id), leave, None).await;
    writer.abort();
}

async fn send_to(state: &Arc<LanState>, id: u64, text: String) {
    let clients = state.clients.lock().await;
    if let Some(client) = clients.get(&id) {
        let _ = client.tx.send(text);
    }
}

async fn broadcast_room(
    state: &Arc<LanState>,
    room: &str,
    except: Option<u64>,
    text: String,
    to: Option<u64>,
) {
    let clients = state.clients.lock().await;
    for (id, client) in clients.iter() {
        if client.room != room {
            continue;
        }
        if Some(*id) == except {
            continue;
        }
        if let Some(target) = to {
            if *id != target {
                continue;
            }
        }
        let _ = client.tx.send(text.clone());
    }
}
