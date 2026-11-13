# Releases

The family library ships **three launchers**:

| Build | Contents |
| --- | --- |
| **Offline** | All games + the WebView2 offline runtime |
| **Slim** | All games, no bundled runtime; WebView2 bootstrapper |
| **Lite** | Small launcher; downloads only the games you choose; installs WebView2 first if needed |

Lite packages are ZIP archives of the portable games in the `game-packages-v3.1.0`
release. There are no separate per-game NSIS installers.

- Windows 10/11 x64.
- Per-user install; no administrator prompt.
- Unsigned family build: Windows SmartScreen will ask once.
- `manifest.json` and `SHA256SUMS.txt` are development artifacts; the launchers are
  the supported downloads.
