//! UDP 局域网房间发现（仅桌面端）。
//!
//! 手机浏览器没法做 UDP，所以仍然走二维码 / 房间码；这里是给家里的**另一台电脑**用的：
//! 打开「局域网对战」就能看到附近开着的房间，点一下直接加入。
//!
//! 协议（单包 JSON / UTF-8）：
//!   探针：{"app":"splendor-family","v":1,"q":"who"}
//!   应答：{"app":"splendor-family","v":1,"host":"客厅台式机","port":8080,
//!          "code":"ABCD","seats":4,"humans":2,"open":true,"started":false,"version":"2.5.0"}
//!
//! 只做"探针—应答"（不周期广播），安静且够用；同一台机器也会探回环地址。

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::net::UdpSocket;
use tokio::sync::Mutex;

use crate::bridge::log_line;

pub const DISCOVERY_PORT: u16 = 7669;
pub const APP_TAG: &str = "splendor-family";

/// 主机当前对外广播的房间信息（由前端在房间状态变化时推送）
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Advertise {
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub seats: u32,
    #[serde(default)]
    pub humans: u32,
    #[serde(default)]
    pub open: bool,
    #[serde(default)]
    pub started: bool,
}

pub struct DiscoveryState {
    pub http_port: u16,
    pub advertise: Mutex<Advertise>,
}

impl DiscoveryState {
    pub fn new(http_port: u16) -> Arc<Self> {
        Arc::new(Self {
            http_port,
            advertise: Mutex::new(Advertise::default()),
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredHost {
    pub host: String,
    pub ip: String,
    pub port: u16,
    /// 就是本机（界面里不显示自己）
    pub own: bool,
    pub code: String,
    pub seats: u32,
    pub humans: u32,
    pub open: bool,
    pub started: bool,
    pub version: String,
}

fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Splendor".to_string())
}

/// 广播目标：受限广播地址 + 每块非虚拟网卡的定向广播地址
fn broadcast_targets() -> Vec<SocketAddr> {
    let mut out = vec![SocketAddr::new(IpAddr::V4(Ipv4Addr::new(255, 255, 255, 255)), DISCOVERY_PORT)];
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            if iface.is_loopback() {
                continue;
            }
            if let if_addrs::IfAddr::V4(v4) = &iface.addr {
                if let Some(broadcast) = v4.broadcast {
                    if !broadcast.is_unspecified() {
                        out.push(SocketAddr::new(IpAddr::V4(broadcast), DISCOVERY_PORT));
                    }
                }
            }
        }
    }
    out.dedup();
    out
}

/// 常驻监听：应答局域网里其他电脑发来的探针
pub async fn run(state: Arc<DiscoveryState>) {
    let socket = match UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)).await {
        Ok(s) => s,
        Err(err) => {
            log_line(&format!("房间发现监听失败（UDP {DISCOVERY_PORT}）：{err}"), "warn");
            return;
        }
    };
    let _ = socket.set_broadcast(true);
    log_line(&format!("房间发现已就绪（UDP {DISCOVERY_PORT}）"), "info");

    let mut buf = [0u8; 2048];
    loop {
        let received = tokio::time::timeout(Duration::from_secs(60), socket.recv_from(&mut buf)).await;
        let Ok(Ok((len, from))) = received else { continue };
        let Ok(msg) = serde_json::from_slice::<Value>(&buf[..len]) else { continue };
        if msg.get("app").and_then(|v| v.as_str()) != Some(APP_TAG) {
            continue;
        }
        if msg.get("q").and_then(|v| v.as_str()) != Some("who") {
            continue;
        }
        let adv = state.advertise.lock().await.clone();
        let reply = json!({
            "app": APP_TAG,
            "v": 1,
            "host": hostname(),
            "port": state.http_port,
            "code": adv.code,
            "seats": adv.seats,
            "humans": adv.humans,
            "open": adv.open,
            "started": adv.started,
            "version": env!("CARGO_PKG_VERSION"),
        });
        let _ = socket.send_to(reply.to_string().as_bytes(), from).await;
    }
}

/// 本机所有 IPv4 地址（用于判断"这条应答是不是自己"）
fn local_ipv4() -> Vec<Ipv4Addr> {
    let mut out = vec![Ipv4Addr::LOCALHOST];
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            if let std::net::IpAddr::V4(v4) = iface.addr.ip() {
                out.push(v4);
            }
        }
    }
    out
}

fn parse_reply(value: &Value, from: SocketAddr, own_port: u16, local: &[Ipv4Addr]) -> Option<DiscoveredHost> {
    if value.get("app").and_then(|v| v.as_str()) != Some(APP_TAG) {
        return None;
    }
    let port = value.get("port").and_then(|v| v.as_u64()).unwrap_or(0) as u16;
    if port == 0 {
        return None;
    }
    Some(DiscoveredHost {
        host: value.get("host").and_then(|v| v.as_str()).unwrap_or("Splendor").to_string(),
        ip: from.ip().to_string(),
        port,
        code: value.get("code").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        seats: value.get("seats").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        humans: value.get("humans").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        open: value.get("open").and_then(|v| v.as_bool()).unwrap_or(false),
        started: value.get("started").and_then(|v| v.as_bool()).unwrap_or(false),
        version: value.get("version").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        own: port == own_port
            && match from.ip() {
                IpAddr::V4(v4) => local.contains(&v4),
                IpAddr::V6(_) => false,
            },
    })
}

// ---------------- Tauri 命令 ----------------

/// 搜索附近的房间（探针 + 收集应答，默认 1.2 秒）
#[tauri::command]
pub async fn discovery_scan(
    state: tauri::State<'_, Arc<DiscoveryState>>,
    timeout_ms: Option<u64>,
) -> Result<Vec<DiscoveredHost>, String> {
    let own_port = state.http_port;
    let local = local_ipv4();
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(1200).clamp(300, 5000));
    let socket = match UdpSocket::bind(("0.0.0.0", 0)).await {
        Ok(s) => s,
        Err(err) => {
            log_line(&format!("房间发现搜索失败：{err}"), "warn");
            return Ok(Vec::new());
        }
    };
    let _ = socket.set_broadcast(true);
    let probe = json!({ "app": APP_TAG, "v": 1, "q": "who" }).to_string();
    for target in broadcast_targets() {
        let _ = socket.send_to(probe.as_bytes(), target).await;
    }
    // 同一台机器（回环）也要能找到，便于单机验证与"两台程序同机调试"
    let _ = socket
        .send_to(probe.as_bytes(), SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), DISCOVERY_PORT))
        .await;

    let mut found: Vec<DiscoveredHost> = Vec::new();
    let deadline = tokio::time::Instant::now() + timeout;
    let mut buf = [0u8; 2048];
    loop {
        let left = deadline.saturating_duration_since(tokio::time::Instant::now());
        if left.is_zero() {
            break;
        }
        match tokio::time::timeout(left, socket.recv_from(&mut buf)).await {
            Ok(Ok((len, from))) => {
                let Ok(value) = serde_json::from_slice::<Value>(&buf[..len]) else { continue };
                if let Some(host) = parse_reply(&value, from, own_port, &local) {
                    let duplicate = found.iter().any(|h| h.ip == host.ip && h.port == host.port);
                    if !duplicate {
                        found.push(host);
                    }
                }
            }
            _ => break,
        }
    }
    // 去重：同一台主机（主机名+端口+房间码）只保留"最好连"的一个网段
    found.sort_by_key(|h| (ip_score(&h.ip), h.ip.clone()));
    let mut deduped: Vec<DiscoveredHost> = Vec::new();
    for host in found {
        let same = deduped.iter().any(|h| h.host == host.host && h.port == host.port && h.code == host.code);
        if !same {
            deduped.push(host);
        }
    }
    // 有房间可加入的排在前面
    deduped.sort_by_key(|h| (h.code.is_empty(), h.started, ip_score(&h.ip)));
    Ok(deduped)
}

/// 家庭场景下"更快连上"的网段排序（与 net.rs 的地址排序同思路）
fn ip_score(ip: &str) -> u8 {
    let parts: Vec<u8> = ip.split('.').filter_map(|p| p.parse::<u8>().ok()).collect();
    match parts.as_slice() {
        [192, 168, ..] => 0,
        [10, ..] => 1,
        [172, second, ..] if (16..=31).contains(second) => 2,
        [127, ..] => 9,
        [100, ..] => 8, // CGNAT / Tailscale 之类
        _ => 3,
    }
}

/// 前端推送本机当前房间信息（房间关闭时传空 code）
#[tauri::command]
pub async fn discovery_set_advertise(
    state: tauri::State<'_, Arc<DiscoveryState>>,
    advertise: Advertise,
) -> Result<(), String> {
    let mut next = advertise;
    // 只接受规范房间码，避免乱码进入广播
    next.code = next.code.chars().filter(|c| c.is_ascii_alphanumeric()).take(4).collect::<String>().to_uppercase();
    next.seats = next.seats.min(8);
    next.humans = next.humans.min(8);
    *state.advertise.lock().await = next;
    Ok(())
}
