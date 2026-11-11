// Windows 发行版不弹控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 更新助手模式：安装新版、校验启动、必要时回滚（详见 lib.rs / update.rs）
    if let Some(code) = splendor_desktop_lib::run_helper_if_requested() {
        std::process::exit(code);
    }
    splendor_desktop_lib::run()
}
