//! Splendor 家庭版 · Tauri 桌面壳
//!
//! 启动顺序（与旧 Electron 版一致）：先起内置局域网服务器，拿到端口后再开窗，
//! 并把 `window.splendorDesktop` 桥接对象（与 Electron 版同名同形）注入页面。
//! 权威规则逻辑仍在前端（同一份经过测试的 TypeScript），Rust 侧只做托管与中继。

mod bridge;
mod discovery;
mod net;
mod paths;
mod update;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// 助手模式（`--apply-update <job>`）：安装新版、校验启动、必要时回滚。
/// 返回 Some(退出码) 表示当前进程是助手，主程序应立即退出。
pub fn run_helper_if_requested() -> Option<i32> {
    update::run_helper_if_requested()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        // 记住窗口位置与大小（家庭里每台机器的屏幕不同）
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(
            tauri_plugin_window_state::StateFlags::SIZE
                | tauri_plugin_window_state::StateFlags::POSITION
                | tauri_plugin_window_state::StateFlags::MAXIMIZED,
        ).build())
        .invoke_handler(tauri::generate_handler![
            bridge::app_info,
            bridge::log_write,
            bridge::log_tail,
            bridge::open_log_dir,
            bridge::open_data_dir,
            bridge::lan_save_rooms,
            bridge::lan_load_rooms,
            net::lan_addresses,
            net::host_status,
            net::host_start,
            net::host_stop,
            net::lan_send,
            net::lan_client_count,
            net::update_source,
            discovery::discovery_scan,
            discovery::discovery_set_advertise,
            update::update_state,
            update::update_check,
            update::update_download,
            update::update_apply,
            update::update_publish,
            update::update_upload,
            update::update_permission_get,
            update::update_permission_set,
            update::update_ack_failure,
            update::ui_ready,
        ])
        .setup(|app| {
            let allow_publish = update::read_allow_publish();
            update::boot_note();
            let handle = app.handle().clone();
            let state = net::NetState::new(handle.clone());
            state.allow_publish.store(allow_publish, std::sync::atomic::Ordering::SeqCst);
            app.manage(state.clone());

            // 内置服务器先启动（端口注入页面，桌面端默认连自己的服务器）
            let info = match tauri::async_runtime::block_on(net::start_host(&state, None)) {
                Ok(info) => info,
                Err(err) => {
                    bridge::log_line(&format!("内置局域网服务器启动失败：{err}"), "error");
                    net::HostInfo {
                        port: 0,
                        urls: Vec::new(),
                    }
                }
            };
            if info.port > 0 {
                bridge::log_line(
                    &format!(
                        "内置局域网服务器已启动：http://localhost:{}（{} 个局域网地址）",
                        info.port,
                        info.urls.len()
                    ),
                    "info",
                );
            }

            // UDP 房间发现：让家里的另一台电脑在「局域网对战」里看到本机房间
            let discovery_state = discovery::DiscoveryState::new(info.port);
            app.manage(discovery_state.clone());
            tauri::async_runtime::spawn(discovery::run(discovery_state));

            let script = build_bridge_script(&info);
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Splendor · 宝石商人")
                .inner_size(1440.0, 960.0)
                .min_inner_size(1100.0, 740.0)
                .center()
                .initialization_script(script);
            // 仅自动化测试：打开 WebView2 调试端口，让 Playwright 能接管窗口。
            // （注意：wry 会显式设置 additional args，因此 WebView2 的环境变量在这里不生效，
            //  必须走上层参数；默认参数也要一并带上。）
            if let Ok(port) = std::env::var("SPLENDOR_CDP_PORT") {
                let args = format!(
                    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port={port}"
                );
                builder = builder.additional_browser_args(&args);
            }
            let win = builder.build()?;
            let _ = win.show();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Splendor 桌面壳启动失败");
}

/// 注入脚本：与 Electron preload 同为 `window.splendorDesktop` 形状，
/// 另外挂一个阶段 0 的中继探针（`window.__lanRelay`），用于验证
/// "浏览器 → Rust → 主机前端 → Rust → 浏览器" 整条链路。
fn build_bridge_script(info: &net::HostInfo) -> String {
    let urls = serde_json::to_string(&info.urls).unwrap_or_else(|_| "[]".to_string());
    let version = env!("CARGO_PKG_VERSION");
    let port = info.port;
    format!(
        r#"
(function () {{
  var PORT = {port};
  var URLS = {urls};
  var VERSION = "{version}";
  function whenTauri(cb, tries) {{
    if (window.__TAURI__ && window.__TAURI__.core) return cb();
    if ((tries || 0) > 200) return; // 约 4 秒后放弃（浏览器直接打开时不会注入）
    setTimeout(function () {{ whenTauri(cb, (tries || 0) + 1); }}, 20);
  }}
  whenTauri(function () {{
    var invoke = window.__TAURI__.core.invoke;
    var listen = window.__TAURI__.event.listen;

    // —— 与旧 Electron 版同名同形的桥接对象 ——
    window.splendorDesktop = {{
      serverPort: PORT,
      serverUrls: URLS,
      appVersion: VERSION,
      /** 界面挂载完成后回报（更新助手据此确认新版真的起来了） */
      ready: function () {{ return invoke('ui_ready'); }},
      log: {{
        write: function (line, level) {{ return invoke('log_write', {{ line: String(line), level: level }}); }},
        openDir: function () {{ return invoke('open_log_dir'); }},
        diagnostics: function () {{
          return invoke('app_info').then(function (info) {{
            return invoke('host_status').then(function (host) {{
              return invoke('log_tail', {{ lines: 40 }}).then(function (tail) {{
                return {{
                  appVersion: info.version,
                  platform: info.platform,
                  electron: info.runtime,
                  updatesDir: info.updates_dir,
                  logsDir: info.logs_dir,
                  serverPort: host ? host.port : 0,
                  serverUrls: host ? host.urls : [],
                  logTail: tail,
                }};
              }});
            }});
          }});
        }},
      }},
      discovery: {{
        scan: function (timeoutMs) {{ return invoke('discovery_scan', {{ timeoutMs: timeoutMs }}); }},
      }},
      update: {{
        state: function () {{ return invoke('update_state'); }},
        check: function (source) {{ return invoke('update_check', {{ source: source }}); }},
        download: function (source) {{ return invoke('update_download', {{ source: source }}); }},
        apply: function () {{ return invoke('update_apply'); }},
        publish: function () {{ return invoke('update_publish'); }},
        upload: function (source) {{ return invoke('update_upload', {{ source: source }}); }},
        permissionGet: function () {{ return invoke('update_permission_get'); }},
        permissionSet: function (allow) {{ return invoke('update_permission_set', {{ allow: !!allow }}); }},
        ackFailure: function () {{ return invoke('update_ack_failure'); }},
      }},
    }};

    // —— 阶段 0 中继探针：把收到的消息原样回传 ——
    var stats = {{ open: 0, msg: 0, close: 0, echo: 0, last: '' }};
    window.__lanRelay = {{ stats: stats, conns: {{}} }};
    listen('lan://open', function (e) {{
      stats.open += 1;
      window.__lanRelay.conns[e.payload.id] = true;
    }});
    listen('lan://msg', function (e) {{
      stats.msg += 1;
      stats.last = String(e.payload.text).slice(0, 120);
      invoke('lan_send', {{ id: e.payload.id, text: e.payload.text }})
        .then(function () {{ stats.echo += 1; }})
        .catch(function () {{}});
    }});
    listen('lan://close', function (e) {{
      stats.close += 1;
      delete window.__lanRelay.conns[e.payload.id];
    }});
    listen('lan://host-started', function (e) {{
      stats.hostPort = e.payload.port;
    }});
  }});
}})();
"#
    )
}
