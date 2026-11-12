# Releases · 42 per-game installers + all-in-one launcher

One folder per game, one lightweight NSIS installer per game:

```
releases/<slug>/<slug>_<version>_x64-setup.exe
```

- Windows 10/11 x64.
- Per-user install; no administrator prompt.
- WebView2 uses the standard bootstrapper.
- Unsigned family build: Windows SmartScreen will ask once.
- `manifest.json` is written by `node tools/collect-installers.mjs` and lists every
  per-game installer with its size.
- The launcher has two all-in-one variants: **offline** (embeds the WebView2 runtime)
  and **slim** (uses the small WebView2 bootstrapper, roughly 200 MB smaller).

The GitHub Actions workflow in `.github/workflows/release.yml` rebuilds the same
matrix and creates **one GitHub Release per game** when a `v*` tag is pushed.
