fn main() {
    ensure_dist_exists();
    tauri_build::build();
}

/// `include_dir!` in `src/net.rs` embeds `../dist` at compile time.
/// Make sure the directory exists even before the first `npm run build`,
/// so plain `cargo check` / `cargo build` never fails on a fresh clone.
fn ensure_dist_exists() {
    let manifest = std::path::PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"),
    );
    let dist = manifest.join("../dist");
    let index = dist.join("index.html");
    if !index.exists() {
        let _ = std::fs::create_dir_all(&dist);
        let _ = std::fs::write(
            &index,
            "<!doctype html><meta charset=\"utf-8\"><title>Blokus</title>\
             <body style=\"font-family:system-ui;padding:2rem\">\
             Frontend assets are not built yet — run <code>npm run build</code>.",
        );
    }
    println!("cargo:rerun-if-changed={}", dist.display());
}
