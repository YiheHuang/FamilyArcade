# Releases · 27 installers

One folder per game, one lightweight NSIS installer per game:

```
releases/<slug>/<slug>_<version>_x64-setup.exe
```

- Windows 10/11 x64.
- Per-user install; no administrator prompt.
- WebView2 uses the standard bootstrapper.
- Unsigned family build: Windows SmartScreen will ask once.
- `manifest.json` is written by `node tools/build-releases.mjs` and lists every
  installer with its size.

The GitHub Actions workflow in `.github/workflows/release.yml` rebuilds the same
matrix and creates **one GitHub Release per game** when a `v*` tag is pushed.
