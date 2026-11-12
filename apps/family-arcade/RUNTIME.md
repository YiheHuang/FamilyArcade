## WebView2 runtime

Family Arcade ships three launchers:

- **Offline** — embeds the Microsoft Edge WebView2 Evergreen Runtime offline installer
  and all games. A clean Windows 10/11 x64 machine does not need any network access.
- **Slim** — includes all games but uses Tauri's small WebView2 bootstrapper. Windows
  11 and most updated Windows 10 machines already have WebView2, so nothing is
  downloaded; if it is missing, the installer adds it automatically.
- **Lite** — the tiny download-on-demand launcher. It also uses the WebView2
  bootstrapper, so WebView2 is checked and installed before the launcher opens. Games
  are downloaded only after that, when you choose them.

Every portable game folder ships `WebView2Loader.dll`. Per-game packages also include
the loader. If a minimal/offline Windows image reports that WebView2 is missing,
install the
[offline x64 runtime](https://github.com/YiheHuang/FamilyArcade/releases/download/webview2-runtime-v1.0.0/MicrosoftEdgeWebView2RuntimeInstallerX64.exe)
once, or use the offline Family Arcade launcher.
