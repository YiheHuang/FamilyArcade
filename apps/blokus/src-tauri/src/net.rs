//! LAN hosting: an HTTP + WebSocket server owned by the host app.
//!
//! Design: the server is a *dumb relay*. The host's frontend is the
//! authoritative game engine; guests send actions to the host and receive
//! broadcast results. Guests can also join from a plain browser (the same
//! frontend bundle is embedded in the binary via `include_dir!`).
//!
//! Discovery: the host broadcasts a small JSON datagram on UDP :7668 every
//! second (and answers unicast probes), so joining devices can list nearby
//! rooms without typing an IP.

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use include_dir::{include_dir, Dir};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, UdpSocket};
use tokio::sync::{mpsc, watch, Mutex};

static DIST: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../dist");

const DISCOVERY_PORT: u16 = 7668;
const MAX_PLAYERS: usize = 4;
/// extra connection slots that only watch the game
const MAX_SPECTATORS: usize = 4;
const IDLE_TIMEOUT: Duration = Duration::from_secs(120);
const JOIN_TIMEOUT: Duration = Duration::from_secs(30);
/// per-connection message budget; stops a scripted client from flooding the relay
const MAX_MSGS_PER_SEC: u32 = 60;
const PROBE: &[u8] = b"blokus-probe";

/// bumped whenever the wire format changes; both sides must match
pub const PROTOCOL_VERSION: u32 = 2;

// ------------------------------------------------------------------ tauri side

#[derive(Default)]
pub struct NetState {
    host: Mutex<Option<RoomHandle>>,
}

struct RoomHandle {
    port: u16,
    stop: watch::Sender<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostInfo {
    pub port: u16,
    pub token: String,
    pub code: String,
    pub addresses: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredHost {
    pub ip: String,
    pub port: u16,
    pub room: String,
    pub players: usize,
    pub max: usize,
    pub phase: String,
    pub variant: String,
}

#[tauri::command]
pub async fn start_host(
    state: tauri::State<'_, NetState>,
    port: u16,
    room: String,
    max_players: usize,
    variant: String,
) -> Result<HostInfo, String> {
    stop_host_inner(&state).await;
    let code = random_code();
    let opts = RoomOpts {
        port,
        room,
        max_players: max_players.clamp(2, MAX_PLAYERS),
        variant,
        code: code.clone(),
    };
    let (handle, token) = spawn_room(opts).await?;
    let port = handle.port;
    let addresses = lan_ips();
    state.host.lock().await.replace(handle);
    Ok(HostInfo {
        port,
        token,
        code,
        addresses,
    })
}

#[tauri::command]
pub async fn stop_host(state: tauri::State<'_, NetState>) -> Result<(), String> {
    stop_host_inner(&state).await;
    Ok(())
}

async fn stop_host_inner(state: &tauri::State<'_, NetState>) {
    if let Some(handle) = state.host.lock().await.take() {
        let _ = handle.stop.send(true);
    }
}

#[tauri::command]
pub fn lan_addresses() -> Vec<String> {
    lan_ips()
}

/// Discovery fallback for networks where UDP broadcasts are filtered: sweep the
/// local /24(s) on the room port. Anything that answers is reachable over TCP —
/// which is exactly what joining needs.
#[tauri::command]
pub async fn scan_hosts(port: u16, timeout_ms: u64) -> Vec<DiscoveredHost> {
    let candidates = subnet_candidates();
    scan_candidates(candidates, port, Duration::from_millis(timeout_ms.clamp(60, 1500))).await
}

#[tauri::command]
pub async fn discover_hosts(ms: u64) -> Vec<DiscoveredHost> {
    let ok = async {
        let sock = UdpSocket::bind(("0.0.0.0", 0)).await.ok()?;
        sock.set_broadcast(true).ok()?;
        for target in broadcast_targets() {
            let _ = sock.send_to(PROBE, (target, DISCOVERY_PORT)).await;
        }

        let deadline = tokio::time::Instant::now() + Duration::from_millis(ms.clamp(200, 5000));
        let mut buf = [0u8; 2048];
        let mut found: Vec<DiscoveredHost> = Vec::new();
        loop {
            let left = deadline.saturating_duration_since(tokio::time::Instant::now());
            if left.is_zero() {
                break;
            }
            match tokio::time::timeout(left, sock.recv_from(&mut buf)).await {
                Ok(Ok((n, from))) => {
                    let Ok(v) = serde_json::from_slice::<Value>(&buf[..n]) else {
                        continue;
                    };
                    if v.get("app").and_then(Value::as_str) != Some("blokus") {
                        continue;
                    }
                    let port = v.get("port").and_then(Value::as_u64).unwrap_or(0) as u16;
                    let ip = from.ip().to_string();
                    if port == 0 {
                        continue;
                    }
                    let room = v
                        .get("room")
                        .and_then(Value::as_str)
                        .unwrap_or("Blokus")
                        .to_string();
                    // the same room may be heard on several interfaces: keep the
                    // address that looks most reachable (real NIC beats virtual)
                    if let Some(existing) = found.iter_mut().find(|h| h.port == port && h.room == room) {
                        if address_score(&ip) > address_score(&existing.ip) {
                            existing.ip = ip;
                        }
                        continue;
                    }
                    found.push(DiscoveredHost {
                        ip,
                        port,
                        room,
                        players: v.get("players").and_then(Value::as_u64).unwrap_or(0) as usize,
                        max: v.get("max").and_then(Value::as_u64).unwrap_or(4) as usize,
                        phase: v
                            .get("phase")
                            .and_then(Value::as_str)
                            .unwrap_or("lobby")
                            .to_string(),
                        variant: v
                            .get("variant")
                            .and_then(Value::as_str)
                            .unwrap_or("standard")
                            .to_string(),
                    });
                }
                _ => break,
            }
        }
        Some(found)
    };
    ok.await.unwrap_or_default()
}

// ----------------------------------------------------------------------- room

pub struct RoomOpts {
    pub port: u16,
    pub room: String,
    pub max_players: usize,
    pub variant: String,
    pub code: String,
}

struct Inner {
    slot_cap: usize,
    players: Vec<Option<Player>>,
    phase: String,
    variant: String,
    next_conn: u64,
}

struct Player {
    name: String,
    token: String,
    conn: u64,
    connected: bool,
    spectator: bool,
    tx: Option<mpsc::UnboundedSender<String>>,
}

struct Room {
    name: String,
    port: u16,
    token: String,
    /// 4-digit join code (kept out of the discovery datagram)
    code: String,
    inner: Mutex<Inner>,
    stop: watch::Sender<bool>,
}

impl Room {
    async fn players_json(&self) -> Value {
        let inner = self.inner.lock().await;
        let arr: Vec<Value> = inner
            .players
            .iter()
            .enumerate()
            .filter_map(|(slot, p)| {
                p.as_ref().map(|p| {
                    json!({
                        "slot": slot,
                        "name": p.name,
                        "connected": p.connected,
                        "spectator": p.spectator,
                    })
                })
            })
            .collect();
        json!({ "t": "room", "hostSlot": 0, "players": arr })
    }

    /// Public room info — the same payload the UDP beacon sends. Deliberately
    /// excludes the room code: discovering a room must not grant entry.
    async fn info_json(&self) -> Value {
        let inner = self.inner.lock().await;
        let players = inner
            .players
            .iter()
            .flatten()
            .filter(|p| p.connected && !p.spectator)
            .count();
        json!({
            "app": "blokus",
            "room": self.name,
            "port": self.port,
            "players": players,
            "max": inner.slot_cap,
            "phase": inner.phase,
            "variant": inner.variant,
        })
    }

    async fn broadcast(&self, text: &str) {
        let inner = self.inner.lock().await;
        for p in inner.players.iter().flatten() {
            if let Some(tx) = &p.tx {
                let _ = tx.send(text.to_string());
            }
        }
    }

    async fn send_to(&self, slot: usize, text: &str) {
        let inner = self.inner.lock().await;
        if let Some(Some(p)) = inner.players.get(slot) {
            if let Some(tx) = &p.tx {
                let _ = tx.send(text.to_string());
            }
        }
    }
}

async fn spawn_room(opts: RoomOpts) -> Result<(RoomHandle, String), String> {
    let listener = TcpListener::bind(("0.0.0.0", opts.port))
        .await
        .map_err(|e| format!("无法监听端口 {}：{e}", opts.port))?;
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(opts.port);

    let token = random_token();
    let (stop_tx, stop_rx) = watch::channel(false);
    let room = Arc::new(Room {
        name: opts.room.clone(),
        port,
        token: token.clone(),
        code: opts.code.clone(),
        inner: Mutex::new(Inner {
            slot_cap: opts.max_players,
            players: Vec::new(),
            phase: "lobby".to_string(),
            variant: opts.variant.clone(),
            next_conn: 1,
        }),
        stop: stop_tx.clone(),
    });

    let router = Router::new()
        .route("/ws", get(ws_handler))
        .route("/room-info", get(room_info_handler))
        .fallback(get(static_handler))
        .with_state(room.clone());

    let mut stop_server = stop_rx.clone();
    tokio::spawn(async move {
        let shutdown = async move {
            let _ = stop_server.changed().await;
        };
        let _ = axum::serve(listener, router).with_graceful_shutdown(shutdown).await;
    });

    // UDP discovery broadcaster / probe responder
    let room_b = room.clone();
    let mut stop_bcast = stop_rx;
    tokio::spawn(async move {
        let Ok(sock) = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)).await else {
            return; // another room on this machine owns discovery — fine
        };
        let _ = sock.set_broadcast(true);
        let broadcast_addrs = broadcast_targets();
        let mut ticker = tokio::time::interval(Duration::from_secs(1));
        let mut buf = [0u8; 512];
        loop {
            tokio::select! {
                _ = stop_bcast.changed() => break,
                _ = ticker.tick() => {
                    let datagram = room_b.info_json().await.to_string();
                    for target in &broadcast_addrs {
                        let _ = sock.send_to(datagram.as_bytes(), (*target, DISCOVERY_PORT)).await;
                    }
                }
                res = sock.recv_from(&mut buf) => {
                    if let Ok((n, from)) = res {
                        if &buf[..n] == PROBE {
                            let reply = room_b.info_json().await.to_string();
                            let _ = sock.send_to(reply.as_bytes(), from).await;
                        }
                    }
                }
            }
        }
    });

    Ok((
        RoomHandle { port, stop: stop_tx },
        token,
    ))
}

fn random_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    format!("{:x}{:x}", nanos ^ (pid << 64), pid.wrapping_mul(0x9e3779b9))
}

/// 4-digit room code. Mixing the nanos with a constant keeps consecutive room
/// creations from producing consecutive codes.
fn random_code() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mixed = nanos.wrapping_mul(0x9e3779b97f4a7c15);
    format!("{:04}", (mixed >> 17) % 10_000)
}

/// Candidate LAN addresses, best first. Virtual adapters (Hyper-V/WSL/Docker/
/// VPN …) are filtered out so the address shown to family is actually
/// reachable; if everything looks virtual we fall back to showing them all.
fn lan_ips() -> Vec<String> {
    let mut candidates: Vec<(String, String)> = Vec::new();
    if let Ok(addrs) = if_addrs::get_if_addrs() {
        for a in addrs {
            if a.is_loopback() {
                continue;
            }
            if let std::net::IpAddr::V4(v4) = a.addr.ip() {
                if v4.is_link_local() || v4.is_unspecified() {
                    continue;
                }
                candidates.push((v4.to_string(), a.name.clone()));
            }
        }
    }
    let ordered = order_addresses(&candidates);
    if !ordered.is_empty() {
        return ordered;
    }
    // last resort: whatever the routing table picks
    if let Ok(sock) = std::net::UdpSocket::bind(("0.0.0.0", 0)) {
        if sock.connect(("8.8.8.8", 80)).is_ok() {
            if let Ok(addr) = sock.local_addr() {
                let ip = addr.ip().to_string();
                if ip != "0.0.0.0" && ip != "127.0.0.1" {
                    return vec![ip];
                }
            }
        }
    }
    Vec::new()
}

/// Directed broadcast addresses of every IPv4 interface (plus 255.255.255.255
/// and loopback). Broadcasting only to the generic broadcast can leave via a
/// virtual adapter, so real LAN devices would never see the room.
fn broadcast_targets() -> Vec<std::net::IpAddr> {
    let mut out: Vec<std::net::IpAddr> = Vec::new();
    if let Ok(addrs) = if_addrs::get_if_addrs() {
        for a in addrs {
            if let if_addrs::IfAddr::V4(v4) = a.addr {
                if v4.ip.is_loopback() {
                    continue;
                }
                let target = v4.broadcast.unwrap_or_else(|| {
                    let ip = u32::from(v4.ip);
                    let mask = u32::from(v4.netmask);
                    std::net::Ipv4Addr::from(ip | !mask)
                });
                let addr = std::net::IpAddr::V4(target);
                if !out.contains(&addr) {
                    out.push(addr);
                }
            }
        }
    }
    let generic = std::net::IpAddr::V4(std::net::Ipv4Addr::BROADCAST);
    if !out.contains(&generic) {
        out.push(generic);
    }
    let loopback = std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST);
    if !out.contains(&loopback) {
        out.push(loopback);
    }
    out
}

/// Candidate addresses for the TCP scan: every host of the /24 we sit in, for
/// each real interface (wider masks are trimmed to the containing /24 so a /16
/// never turns into 65k probes). Localhost is included for same-machine rooms.
fn subnet_candidates() -> Vec<std::net::Ipv4Addr> {
    let mut out: Vec<std::net::Ipv4Addr> = Vec::new();
    if let Ok(addrs) = if_addrs::get_if_addrs() {
        for a in addrs {
            if a.is_loopback() {
                continue;
            }
            if let if_addrs::IfAddr::V4(v4) = a.addr {
                if v4.ip.is_loopback() || v4.ip.is_link_local() || v4.ip.is_unspecified() {
                    continue;
                }
                for host in subnet_hosts_for(v4.ip, v4.netmask) {
                    if !out.contains(&host) {
                        out.push(host);
                    }
                }
            }
        }
    }
    let loopback = std::net::Ipv4Addr::LOCALHOST;
    if !out.contains(&loopback) {
        out.push(loopback);
    }
    out
}

/// Hosts to probe for one interface address (excluding the address itself).
fn subnet_hosts_for(ip: std::net::Ipv4Addr, netmask: std::net::Ipv4Addr) -> Vec<std::net::Ipv4Addr> {
    const MAX_HOSTS: u32 = 512;
    let ip_u = u32::from(ip);
    let mask_u = u32::from(netmask);
    let mut network = ip_u & mask_u;
    let mut broadcast = network | !mask_u;
    if mask_u == 0 || broadcast.saturating_sub(network) > MAX_HOSTS {
        // too wide (or no mask): sweep the /24 we are in
        network = ip_u & 0xffff_ff00;
        broadcast = network | 0xff;
    }
    let mut out = Vec::new();
    let mut addr = network.wrapping_add(1);
    while addr < broadcast && out.len() < MAX_HOSTS as usize {
        let host = std::net::Ipv4Addr::from(addr);
        if host != ip {
            out.push(host);
        }
        addr = addr.wrapping_add(1);
    }
    out
}

/// Probe every candidate concurrently (bounded) and keep the rooms that answer.
async fn scan_candidates(
    candidates: Vec<std::net::Ipv4Addr>,
    port: u16,
    timeout: Duration,
) -> Vec<DiscoveredHost> {
    use futures_util::stream::{self, StreamExt};
    let found = stream::iter(candidates.into_iter().map(|ip| async move {
        probe_room(ip, port, timeout).await
    }))
    .buffer_unordered(64)
    .collect::<Vec<_>>()
    .await;
    found.into_iter().flatten().collect()
}

/// Ask one address for `/room-info`; `None` when nothing (or no Blokus) answers.
async fn probe_room(ip: std::net::Ipv4Addr, port: u16, timeout: Duration) -> Option<DiscoveredHost> {
    let probe = async {
        let mut stream = tokio::net::TcpStream::connect((ip, port)).await.ok()?;
        stream
            .write_all(b"GET /room-info HTTP/1.1\r\nHost: blokus\r\nConnection: close\r\n\r\n")
            .await
            .ok()?;
        let mut buf: Vec<u8> = Vec::with_capacity(1024);
        let mut chunk = [0u8; 1024];
        loop {
            let n = stream.read(&mut chunk).await.ok()?;
            if n == 0 || buf.len() > 8192 {
                break;
            }
            buf.extend_from_slice(&chunk[..n]);
        }
        let text = String::from_utf8_lossy(&buf);
        let body = text.split("\r\n\r\n").nth(1)?;
        let v: Value = serde_json::from_str(body.trim()).ok()?;
        if v.get("app").and_then(Value::as_str) != Some("blokus") {
            return None;
        }
        Some(DiscoveredHost {
            ip: ip.to_string(),
            port,
            room: v
                .get("room")
                .and_then(Value::as_str)
                .unwrap_or("Blokus")
                .to_string(),
            players: v.get("players").and_then(Value::as_u64).unwrap_or(0) as usize,
            max: v.get("max").and_then(Value::as_u64).unwrap_or(4) as usize,
            phase: v
                .get("phase")
                .and_then(Value::as_str)
                .unwrap_or("lobby")
                .to_string(),
            variant: v
                .get("variant")
                .and_then(Value::as_str)
                .unwrap_or("standard")
                .to_string(),
        })
    };
    tokio::time::timeout(timeout, probe).await.ok().flatten()
}

fn looks_virtual(name: &str) -> bool {
    const VIRTUAL: [&str; 16] = [
        "vethernet",
        "docker",
        "wsl",
        "virtual",
        "vmware",
        "vbox",
        "hyper-v",
        "tap",
        "tun",
        "loopback",
        "bluetooth",
        "zerotier",
        "tailscale",
        "radmin",
        "npcap",
        "hamachi",
    ];
    let lower = name.to_lowercase();
    VIRTUAL.iter().any(|v| lower.contains(v))
}

/// 192.168.* > 10.* > 172.16-31.* > anything else
fn address_score(ip: &str) -> u8 {
    if ip.starts_with("192.168.") {
        3
    } else if ip.starts_with("10.") {
        2
    } else if ip.starts_with("172.") {
        let second: u32 = ip.split('.').nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
        if (16..=31).contains(&second) {
            1
        } else {
            0
        }
    } else {
        0
    }
}

fn order_addresses(candidates: &[(String, String)]) -> Vec<String> {
    let mut kept: Vec<(&str, u8)> = candidates
        .iter()
        .filter(|(_, name)| !looks_virtual(name))
        .map(|(ip, _)| (ip.as_str(), address_score(ip)))
        .collect();
    if kept.is_empty() {
        kept = candidates
            .iter()
            .map(|(ip, _)| (ip.as_str(), address_score(ip)))
            .collect();
    }
    kept.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));
    kept.dedup_by(|a, b| a.0 == b.0);
    kept.into_iter().map(|(ip, _)| ip.to_string()).collect()
}

// ------------------------------------------------------------------ websocket

#[derive(Deserialize)]
#[serde(tag = "t", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum ClientMsg {
    Join {
        name: Option<String>,
        token: Option<String>,
        host: Option<bool>,
        host_token: Option<String>,
        version: Option<u32>,
        code: Option<String>,
    },
    Msg {
        payload: Value,
        to: Option<usize>,
    },
    Meta {
        phase: Option<String>,
    },
    Ping,
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(room): State<Arc<Room>>,
    headers: HeaderMap,
) -> Response {
    if !origin_allowed(&headers) {
        return (StatusCode::FORBIDDEN, "cross-site websocket refused").into_response();
    }
    ws.max_message_size(256 * 1024)
        .on_upgrade(move |socket| client_loop(socket, room))
}

/// Browsers let any web page open a WebSocket to any host, so a page from
/// another site could otherwise drive the relay. Pages served by this very
/// room (host == Host header), localhost dev servers and the desktop shell
/// (tauri://) are allowed; native clients send no Origin at all.
fn origin_allowed(headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) else {
        return true;
    };
    let rest = ["http://", "https://", "ws://", "wss://"]
        .iter()
        .find_map(|p| origin.strip_prefix(p));
    let Some(rest) = rest else {
        return origin.starts_with("tauri://");
    };
    let host_header = headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if rest == host_header {
        return true; // served by this room (or whatever this host serves)
    }
    let host_name = rest.split(':').next().unwrap_or("");
    matches!(host_name, "localhost" | "127.0.0.1" | "tauri.localhost")
}

async fn client_loop(socket: WebSocket, room: Arc<Room>) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    let writer = tokio::spawn(async move {
        while let Some(text) = rx.recv().await {
            if sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });

    let mut my_slot: Option<usize> = None;
    let mut my_conn: u64 = 0;
    let mut my_name = String::from("玩家");
    let mut window_start = tokio::time::Instant::now();
    let mut window_msgs: u32 = 0;

    loop {
        let timeout = if my_slot.is_some() { IDLE_TIMEOUT } else { JOIN_TIMEOUT };
        let next = tokio::time::timeout(timeout, stream.next()).await;
        let msg = match next {
            Err(_) => break,
            Ok(None) => break,
            Ok(Some(Err(_))) => break,
            Ok(Some(Ok(Message::Close(_)))) => break,
            Ok(Some(Ok(Message::Text(t)))) => t,
            Ok(Some(Ok(_))) => continue,
        };

        // crude flood protection: no legit client sends this many frames
        if window_start.elapsed() >= Duration::from_secs(1) {
            window_start = tokio::time::Instant::now();
            window_msgs = 0;
        }
        window_msgs += 1;
        if window_msgs > MAX_MSGS_PER_SEC {
            break;
        }

        let Ok(parsed) = serde_json::from_str::<ClientMsg>(msg.as_str()) else {
            continue;
        };

        match parsed {
            ClientMsg::Ping => {
                let _ = tx.send(json!({ "t": "pong" }).to_string());
            }
            ClientMsg::Meta { phase } => {
                // host only
                if my_slot == Some(0) {
                    if let Some(phase) = phase {
                        room.inner.lock().await.phase = phase;
                    }
                }
            }
            ClientMsg::Join {
                name,
                token,
                host,
                host_token,
                version,
                code,
            } => {
                if my_slot.is_some() {
                    continue; // already joined
                }
                let client_version = version.unwrap_or(0);
                if client_version != PROTOCOL_VERSION {
                    let _ = tx.send(
                        json!({
                            "t": "error",
                            "code": "version-mismatch",
                            "msg": "版本不一致",
                            "server": PROTOCOL_VERSION,
                            "client": client_version,
                        })
                        .to_string(),
                    );
                    break;
                }
                let want_host = host.unwrap_or(false);
                if want_host && host_token.as_deref() != Some(room.token.as_str()) {
                    let _ = tx.send(
                        json!({ "t": "error", "code": "bad-token", "msg": "房主凭据无效" }).to_string(),
                    );
                    break;
                }
                // guests need the room code (visible in the host's lobby / invite link)
                if !want_host && code.as_deref() != Some(room.code.as_str()) {
                    let _ = tx.send(
                        json!({ "t": "error", "code": "bad-code", "msg": "房间码不正确" }).to_string(),
                    );
                    break;
                }
                if let Some(n) = name {
                    my_name = n.chars().take(16).collect();
                }

                let mut inner = room.inner.lock().await;
                let token = token.unwrap_or_default();
                let reclaim = if token.is_empty() {
                    None
                } else {
                    inner
                        .players
                        .iter()
                        .position(|p| p.as_ref().map(|p| p.token == token).unwrap_or(false))
                };

                let mut spectator = false;
                let slot = if want_host {
                    if let Some(Some(p)) = inner.players.first() {
                        if p.connected {
                            let _ = tx.send(
                                json!({ "t": "error", "code": "host-taken", "msg": "房主已在房间中" })
                                    .to_string(),
                            );
                            break;
                        }
                    }
                    Some(0usize)
                } else if let Some(s) = reclaim {
                    Some(s)
                } else {
                    let free_player = (0..inner.slot_cap)
                        .find(|s| inner.players.get(*s).map(|p| p.is_none()).unwrap_or(true));
                    match (inner.phase.as_str(), free_player) {
                        // mid-game joins always watch; a full lobby overflows to watchers too
                        (_, Some(s)) if inner.phase != "playing" => Some(s),
                        _ => {
                            let free_spec = (inner.slot_cap..inner.slot_cap + MAX_SPECTATORS)
                                .find(|s| inner.players.get(*s).map(|p| p.is_none()).unwrap_or(true));
                            match free_spec {
                                Some(s) => {
                                    spectator = true;
                                    Some(s)
                                }
                                None => {
                                    let _ = tx.send(
                                        json!({ "t": "error", "code": "full", "msg": "房间已满" })
                                            .to_string(),
                                    );
                                    break;
                                }
                            }
                        }
                    }
                };
                let Some(slot) = slot else { break };

                let conn = inner.next_conn;
                inner.next_conn += 1;
                while inner.players.len() <= slot {
                    inner.players.push(None);
                }
                inner.players[slot] = Some(Player {
                    name: my_name.clone(),
                    token: token.clone(),
                    conn,
                    connected: true,
                    spectator,
                    tx: Some(tx.clone()),
                });
                drop(inner);

                my_slot = Some(slot);
                my_conn = conn;

                let room_json = room.players_json().await;
                let welcome = json!({
                    "t": "welcome",
                    "slot": slot,
                    "hostSlot": 0,
                    "room": room.name,
                    "version": PROTOCOL_VERSION,
                    "spectator": spectator,
                    "players": room_json.get("players").cloned().unwrap_or(json!([])),
                });
                let _ = tx.send(welcome.to_string());
                room.broadcast(&room_json.to_string()).await;
            }
            ClientMsg::Msg { payload, to } => {
                let Some(slot) = my_slot else { continue };
                // spectators only watch: drop anything they send
                {
                    let inner = room.inner.lock().await;
                    let is_spectator = inner
                        .players
                        .get(slot)
                        .and_then(|p| p.as_ref())
                        .map(|p| p.spectator)
                        .unwrap_or(true);
                    if is_spectator {
                        continue;
                    }
                }
                let text = json!({ "t": "msg", "from": slot, "payload": payload }).to_string();
                if slot == 0 {
                    // host → everyone (or a specific guest)
                    match to {
                        Some(target) => room.send_to(target, &text).await,
                        None => {
                            let inner = room.inner.lock().await;
                            for (i, p) in inner.players.iter().enumerate() {
                                if i == slot {
                                    continue;
                                }
                                if let Some(p) = p {
                                    if let Some(tx) = &p.tx {
                                        let _ = tx.send(text.clone());
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // guest → host
                    room.send_to(0, &text).await;
                }
            }
        }
    }

    // cleanup
    if let Some(slot) = my_slot {
        enum Decision {
            Keep,
            HostLeft,
            MarkOffline,
            FreeSlot,
        }
        let mut inner = room.inner.lock().await;
        let playing = inner.phase == "playing";
        let decision = match inner.players.get(slot).and_then(|p| p.as_ref()) {
            Some(p) if p.conn == my_conn => {
                if slot == 0 {
                    Decision::HostLeft
                } else if playing {
                    Decision::MarkOffline
                } else {
                    Decision::FreeSlot
                }
            }
            _ => Decision::Keep,
        };
        let mut host_left = false;
        match decision {
            Decision::Keep => {}
            Decision::HostLeft => host_left = true,
            Decision::MarkOffline => {
                if let Some(Some(p)) = inner.players.get_mut(slot) {
                    p.connected = false; // keep the seat for reconnection
                    p.tx = None;
                }
            }
            Decision::FreeSlot => {
                if slot < inner.players.len() {
                    inner.players[slot] = None; // free the slot in the lobby
                }
            }
        }
        drop(inner);
        if host_left {
            let _ = room.stop.send(true);
            // kick everyone — the room is over
            room.broadcast(&json!({ "t": "error", "code": "host-left", "msg": "房主已离开" }).to_string())
                .await;
            room.inner.lock().await.players.clear();
        } else {
            let room_json = room.players_json().await;
            room.broadcast(&room_json.to_string()).await;
        }
    }

    // drop our sender, then let the writer flush what is still queued and
    // close the socket gracefully (aborting would reset the connection)
    drop(tx);
    if tokio::time::timeout(Duration::from_secs(2), writer).await.is_err() {
        // writer tasks always finish; ignore the timeout case
    }
}

// -------------------------------------------------------------- static assets

/// Machine-readable room info for the TCP scan (and curious humans).
async fn room_info_handler(State(room): State<Arc<Room>>) -> Response {
    let body = room.info_json().await.to_string();
    (
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        body,
    )
        .into_response()
}

async fn static_handler(State(room): State<Arc<Room>>, uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    match DIST.get_file(path) {
        Some(file) => serve_file(file, &room),
        None => match DIST.get_file("index.html") {
            Some(file) => serve_file(file, &room),
            None => (StatusCode::NOT_FOUND, "frontend not built").into_response(),
        },
    }
}

/// Serve a bundled file. HTML gets a small marker injected so a browser page
/// served by a room knows it can prefill the join form from its own address.
fn serve_file(file: &'static include_dir::File<'static>, room: &Room) -> Response {
    if file.path().extension().and_then(|e| e.to_str()) != Some("html") {
        return file_response(file.path(), file.contents());
    }
    let html = String::from_utf8_lossy(file.contents());
    let marker = format!(
        "<script>window.__blokusRoom={};</script>",
        json!({ "room": room.name })
    );
    let body = match html.find("</head>") {
        Some(idx) => format!("{}{}{}", &html[..idx], marker, &html[idx..]),
        None => format!("{marker}{html}"),
    };
    (
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        body,
    )
        .into_response()
}

fn file_response(path: &std::path::Path, bytes: &'static [u8]) -> Response {
    let mime = mime_for(path);
    (
        [
            (header::CONTENT_TYPE, mime),
            (header::CACHE_CONTROL, "no-store"),
        ],
        bytes,
    )
        .into_response()
}

fn mime_for(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("ico") => "image/x-icon",
        Some("webp") => "image/webp",
        Some("woff2") => "font/woff2",
        Some("map") => "application/json",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio_tungstenite::tungstenite::Message as WsMessage;

    type Ws = tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >;

    async fn connect(port: u16) -> Ws {
        let url = format!("ws://127.0.0.1:{port}/ws");
        let (ws, _) = tokio_tungstenite::connect_async(&url)
            .await
            .expect("ws connect");
        ws
    }

    async fn send(ws: &mut Ws, v: Value) {
        ws.send(WsMessage::Text(v.to_string().into()))
            .await
            .expect("ws send");
    }

    async fn next_json(ws: &mut Ws) -> Value {
        loop {
            let msg = tokio::time::timeout(Duration::from_secs(3), ws.next())
                .await
                .expect("ws read timeout")
                .expect("ws closed")
                .expect("ws error");
            match msg {
                WsMessage::Text(t) => return serde_json::from_str(t.as_str()).expect("json"),
                WsMessage::Ping(_) | WsMessage::Pong(_) => continue,
                other => panic!("unexpected ws message: {other:?}"),
            }
        }
    }

    async fn next_where(ws: &mut Ws, pred: impl Fn(&Value) -> bool) -> Value {
        for _ in 0..30 {
            let v = next_json(ws).await;
            if pred(&v) {
                return v;
            }
        }
        panic!("no matching message");
    }

    fn opts(max_players: usize) -> RoomOpts {
        RoomOpts {
            port: 0,
            room: "测试房".into(),
            max_players,
            variant: "duo".into(),
            code: "4321".into(),
        }
    }

    #[tokio::test]
    async fn serves_frontend_over_http() {
        let (handle, _) = spawn_room(opts(2)).await.unwrap();
        let mut sock = tokio::net::TcpStream::connect(("127.0.0.1", handle.port))
            .await
            .unwrap();
        sock.write_all(b"GET / HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut buf = Vec::new();
        let _ = tokio::time::timeout(Duration::from_secs(3), sock.read_to_end(&mut buf)).await;
        let text = String::from_utf8_lossy(&buf);
        assert!(
            text.starts_with("HTTP/1.1 200"),
            "unexpected response: {}",
            &text[..text.len().min(80)]
        );
        assert!(text.to_lowercase().contains("<!doctype html"));
        let _ = handle.stop.send(true);
    }

    #[tokio::test]
    async fn relays_between_host_and_guest() {
        let (handle, token) = spawn_room(opts(2)).await.unwrap();

        let mut host = connect(handle.port).await;
        send(
            &mut host,
            json!({"t":"join","name":"房主","host":true,"hostToken":token,"version": PROTOCOL_VERSION}),
        )
        .await;
        let w = next_where(&mut host, |v| v["t"] == "welcome").await;
        assert_eq!(w["slot"], 0);

        let mut guest = connect(handle.port).await;
        send(
            &mut guest,
            json!({"t":"join","name":"访客","token":"guest-1","version": PROTOCOL_VERSION, "code":"4321"}),
        )
        .await;
        let gw = next_json(&mut guest).await;
        assert_eq!(gw["t"], "welcome");
        assert_eq!(gw["slot"], 1);

        let room = next_where(&mut host, |v| {
            v["t"] == "room" && v["players"].as_array().map(|a| a.len() == 2).unwrap_or(false)
        })
        .await;
        assert_eq!(room["hostSlot"], 0);

        // guest -> host
        send(&mut guest, json!({"t":"msg","payload":{"g":"request","n":1}})).await;
        let relayed = next_where(&mut host, |v| v["t"] == "msg").await;
        assert_eq!(relayed["from"], 1);
        assert_eq!(relayed["payload"]["g"], "request");

        // host -> guests
        send(&mut host, json!({"t":"msg","payload":{"g":"applied","n":2}})).await;
        let applied = next_where(&mut guest, |v| v["t"] == "msg").await;
        assert_eq!(applied["from"], 0);
        assert_eq!(applied["payload"]["n"], 2);

        // capacity is enforced by turning extra guests into spectators
        let mut third = connect(handle.port).await;
        send(&mut third, json!({"t":"join","name":"第三人","token":"guest-3","version": PROTOCOL_VERSION, "code":"4321"})).await;
        let welcome3 = next_json(&mut third).await;
        assert_eq!(welcome3["t"], "welcome");
        assert_eq!(welcome3["spectator"], true);

        // spectators receive broadcasts...
        send(&mut host, json!({"t":"msg","payload":{"g":"applied","n":3}})).await;
        let for_third = next_where(&mut third, |v| v["t"] == "msg").await;
        assert_eq!(for_third["from"], 0);
        assert_eq!(for_third["payload"]["n"], 3);

        // ...but anything they send is dropped (probe with a guest marker)
        send(&mut third, json!({"t":"msg","payload":{"g":"request","n":9}})).await;
        send(&mut guest, json!({"t":"msg","payload":{"g":"request","n":4}})).await;
        let marker = next_where(&mut host, |v| v["t"] == "msg").await;
        assert_eq!(marker["from"], 1);
        assert_eq!(marker["payload"]["n"], 4);

        let _ = handle.stop.send(true);
    }

    #[tokio::test]
    async fn rejects_version_mismatch() {
        let (handle, _) = spawn_room(opts(2)).await.unwrap();
        let mut guest = connect(handle.port).await;
        send(
            &mut guest,
            json!({"t":"join","name":"旧版","token":"old","version": 999}),
        )
        .await;
        let err = next_json(&mut guest).await;
        assert_eq!(err["t"], "error");
        assert_eq!(err["code"], "version-mismatch");
        assert_eq!(err["server"], PROTOCOL_VERSION);
        assert_eq!(err["client"], 999);
        let _ = handle.stop.send(true);
    }

    #[tokio::test]
    async fn rejects_wrong_or_missing_room_code() {
        let (handle, _) = spawn_room(opts(2)).await.unwrap();

        // no code at all
        let mut a = connect(handle.port).await;
        send(&mut a, json!({"t":"join","name":"路人","token":"x1","version": PROTOCOL_VERSION}))
            .await;
        let err = next_json(&mut a).await;
        assert_eq!(err["t"], "error");
        assert_eq!(err["code"], "bad-code");

        // wrong code
        let mut b = connect(handle.port).await;
        send(
            &mut b,
            json!({"t":"join","name":"路人","token":"x2","version": PROTOCOL_VERSION, "code":"0000"}),
        )
        .await;
        let err = next_json(&mut b).await;
        assert_eq!(err["code"], "bad-code");

        // right code gets a seat
        let mut c = connect(handle.port).await;
        send(
            &mut c,
            json!({"t":"join","name":"熟人","token":"x3","version": PROTOCOL_VERSION, "code":"4321"}),
        )
        .await;
        let w = next_json(&mut c).await;
        assert_eq!(w["t"], "welcome");
        assert_eq!(w["slot"], 0);

        let _ = handle.stop.send(true);
    }

    #[tokio::test]
    async fn rejects_cross_site_origins_but_allows_same_host() {
        let (handle, _) = spawn_room(opts(2)).await.unwrap();
        let url = format!("ws://127.0.0.1:{}/ws", handle.port);

        use tokio_tungstenite::tungstenite::client::IntoClientRequest;

        // a page from somewhere else must not be able to drive the relay
        let mut hostile = url.clone().into_client_request().unwrap();
        hostile
            .headers_mut()
            .insert("origin", "http://evil.example".parse().unwrap());
        assert!(tokio_tungstenite::connect_async(hostile).await.is_err());

        // the room's own frontend may connect (origin host == Host header)
        let mut own = url.into_client_request().unwrap();
        own.headers_mut().insert(
            "origin",
            format!("http://127.0.0.1:{}", handle.port).parse().unwrap(),
        );
        let (mut ws, _) = tokio_tungstenite::connect_async(own).await.expect("same-host origin");
        send(
            &mut ws,
            json!({"t":"join","name":"房主","host":true,"hostToken":"wrong","version": PROTOCOL_VERSION}),
        )
        .await;
        let err = next_json(&mut ws).await;
        assert_eq!(err["code"], "bad-token"); // proof the upgrade itself succeeded

        let _ = handle.stop.send(true);
    }

    #[tokio::test]
    async fn floods_get_disconnected() {
        let (handle, _) = spawn_room(opts(2)).await.unwrap();
        let mut ws = connect(handle.port).await;
        for _ in 0..MAX_MSGS_PER_SEC + 5 {
            ws.send(WsMessage::Text(r#"{"t":"ping"}"#.into()))
                .await
                .expect("send");
        }
        // the server drops us: reading eventually ends (close or reset)
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        loop {
            let left = deadline.saturating_duration_since(tokio::time::Instant::now());
            if left.is_zero() {
                panic!("connection stayed open despite flooding");
            }
            match tokio::time::timeout(left, ws.next()).await {
                Ok(None) | Ok(Some(Err(_))) => break,
                Ok(Some(Ok(WsMessage::Close(_)))) => break,
                Ok(Some(Ok(_))) => continue,
                Err(_) => panic!("connection stayed open despite flooding"),
            }
        }
        let _ = handle.stop.send(true);
    }

    #[tokio::test]
    async fn stop_releases_the_port() {
        let (handle, _) = spawn_room(opts(2)).await.unwrap();
        let port = handle.port;
        let _ = handle.stop.send(true);
        let mut released = false;
        for _ in 0..40 {
            if let Ok(l) = TcpListener::bind(("127.0.0.1", port)).await {
                drop(l);
                released = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(released, "port {port} was not released after stop");
    }

    #[tokio::test]
    async fn room_info_is_public_but_hides_the_code() {
        let (handle, _) = spawn_room(opts(2)).await.unwrap();
        let info = probe_room(std::net::Ipv4Addr::LOCALHOST, handle.port, Duration::from_secs(2))
            .await
            .expect("room-info should answer on 127.0.0.1");
        assert_eq!(info.room, "测试房");
        assert_eq!(info.phase, "lobby");
        assert_eq!(info.max, 2);
        assert_eq!(info.variant, "duo");

        // raw body: the room code must never appear
        let mut sock = tokio::net::TcpStream::connect(("127.0.0.1", handle.port))
            .await
            .unwrap();
        sock.write_all(b"GET /room-info HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut buf = Vec::new();
        let _ = tokio::time::timeout(Duration::from_secs(3), sock.read_to_end(&mut buf)).await;
        let text = String::from_utf8_lossy(&buf);
        assert!(text.starts_with("HTTP/1.1 200"), "unexpected: {text}");
        assert!(!text.contains("4321"), "the room code leaked into /room-info");
        let _ = handle.stop.send(true);
    }

    #[tokio::test]
    async fn tcp_scan_finds_a_local_room() {
        let (handle, _) = spawn_room(opts(2)).await.unwrap();
        let found = scan_candidates(
            vec![std::net::Ipv4Addr::LOCALHOST],
            handle.port,
            Duration::from_millis(500),
        )
        .await;
        assert_eq!(found.len(), 1, "scan should find exactly the local room");
        assert_eq!(found[0].ip, "127.0.0.1");
        assert_eq!(found[0].port, handle.port);
        assert_eq!(found[0].room, "测试房");
        assert_eq!(found[0].phase, "lobby");

        // a closed port answers nothing
        let (dead, _) = spawn_room(opts(2)).await.unwrap();
        let dead_port = dead.port;
        let _ = dead.stop.send(true);
        tokio::time::sleep(Duration::from_millis(200)).await;
        let none = scan_candidates(
            vec![std::net::Ipv4Addr::LOCALHOST],
            dead_port,
            Duration::from_millis(200),
        )
        .await;
        assert!(none.is_empty(), "a stopped room must not be found");
        let _ = handle.stop.send(true);
    }

    #[test]
    fn subnet_hosts_covers_a_24_and_trims_wide_masks() {
        let hosts = subnet_hosts_for(
            std::net::Ipv4Addr::new(192, 168, 1, 5),
            std::net::Ipv4Addr::new(255, 255, 255, 0),
        );
        // 256 minus network, broadcast and our own address
        assert_eq!(hosts.len(), 253);
        assert!(hosts.contains(&std::net::Ipv4Addr::new(192, 168, 1, 1)));
        assert!(hosts.contains(&std::net::Ipv4Addr::new(192, 168, 1, 254)));
        assert!(!hosts.contains(&std::net::Ipv4Addr::new(192, 168, 1, 5))); // not ourselves

        // a /16 must not explode into 65k probes
        let wide = subnet_hosts_for(
            std::net::Ipv4Addr::new(10, 3, 7, 9),
            std::net::Ipv4Addr::new(255, 255, 0, 0),
        );
        assert_eq!(wide.len(), 253);
        assert!(wide.contains(&std::net::Ipv4Addr::new(10, 3, 7, 1)));
        assert!(!wide.contains(&std::net::Ipv4Addr::new(10, 4, 0, 1)));
    }

    #[test]
    fn broadcast_targets_cover_every_interface() {
        let targets = broadcast_targets();
        // always includes the generic broadcast and loopback
        assert!(targets.contains(&std::net::IpAddr::V4(std::net::Ipv4Addr::BROADCAST)));
        assert!(targets.contains(&std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST)));
        assert!(targets.len() >= 2);
    }

    #[test]
    fn address_ordering_filters_virtual_nics() {
        let cands = vec![
            ("172.17.96.1".to_string(), "vEthernet (WSL)".to_string()),
            ("192.168.1.9".to_string(), "Wi-Fi".to_string()),
            ("192.168.1.5".to_string(), "Ethernet".to_string()),
            ("10.0.0.7".to_string(), "Ethernet 2".to_string()),
        ];
        assert_eq!(
            order_addresses(&cands),
            vec!["192.168.1.5", "192.168.1.9", "10.0.0.7"]
        );
    }

    #[test]
    fn address_ordering_keeps_everything_when_all_virtual() {
        let cands = vec![("172.17.0.1".to_string(), "Docker0".to_string())];
        assert_eq!(order_addresses(&cands), vec!["172.17.0.1"]);
    }

    #[test]
    fn address_ordering_prefers_private_ranges_and_dedupes() {
        let cands = vec![
            ("203.0.113.9".to_string(), "Ethernet".to_string()),
            ("10.1.2.3".to_string(), "Ethernet".to_string()),
            ("10.1.2.3".to_string(), "Ethernet".to_string()),
        ];
        assert_eq!(order_addresses(&cands), vec!["10.1.2.3", "203.0.113.9"]);
    }

    #[tokio::test]
    async fn seat_reclaim_while_playing() {
        let (handle, token) = spawn_room(opts(2)).await.unwrap();
        let mut host = connect(handle.port).await;
        send(
            &mut host,
            json!({"t":"join","name":"房主","host":true,"hostToken":token,"version": PROTOCOL_VERSION}),
        )
        .await;
        let _ = next_where(&mut host, |v| v["t"] == "welcome").await;

        let mut g1 = connect(handle.port).await;
        send(&mut g1, json!({"t":"join","name":"小蓝","token":"device-T","version": PROTOCOL_VERSION, "code":"4321"})).await;
        let w1 = next_json(&mut g1).await;
        assert_eq!(w1["slot"], 1);

        // game starts, guest drops — the seat stays reserved
        send(&mut host, json!({"t":"meta","phase":"playing"})).await;
        drop(g1);
        next_where(&mut host, |v| {
            v["t"] == "room"
                && v["players"]
                    .as_array()
                    .map(|a| a.iter().any(|p| p["slot"] == 1 && p["connected"] == false))
                    .unwrap_or(false)
        })
        .await;

        // same device reconnects -> same slot
        let mut g2 = connect(handle.port).await;
        send(&mut g2, json!({"t":"join","name":"小蓝","token":"device-T","version": PROTOCOL_VERSION, "code":"4321"})).await;
        let w2 = next_json(&mut g2).await;
        assert_eq!(w2["t"], "welcome");
        assert_eq!(w2["slot"], 1);

        // unknown device watches mid-game instead of taking a seat
        let mut g3 = connect(handle.port).await;
        send(&mut g3, json!({"t":"join","name":"路人","token":"device-X","version": PROTOCOL_VERSION, "code":"4321"})).await;
        let w3 = next_json(&mut g3).await;
        assert_eq!(w3["t"], "welcome");
        assert_eq!(w3["spectator"], true);

        let _ = handle.stop.send(true);
    }
}
