#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod net;

fn main() {
    tauri::Builder::default()
        .manage(net::NetState::default())
        .invoke_handler(tauri::generate_handler![
            net::start_host,
            net::stop_host,
            net::discover_hosts,
            net::scan_hosts,
            net::lan_addresses
        ])
        .run(tauri::generate_context!())
        .expect("error while running Blokus");
}
