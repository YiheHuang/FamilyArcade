## WebView2 runtime

Family Arcade ships two all-in-one installers:

- **Offline** — embeds the Microsoft Edge WebView2 Evergreen Runtime offline installer.
  A clean Windows 10/11 x64 machine does not need any network access before launching.
- **Slim** — uses Tauri's small WebView2 bootstrapper instead. Windows 11 and most
  updated Windows 10 machines already have WebView2, so nothing is downloaded. If the
  runtime is missing, the bootstrapper downloads it once; the slim installer is
  roughly 200 MB smaller than the offline build.

Every portable game folder ships `WebView2Loader.dll`. Per-game installers also ship
the loader and Tauri's bootstrapper. If a minimal/offline Windows image reports that
WebView2 is missing, install the
[offline x64 runtime](https://github.com/YiheHuang/FamilyArcade/releases/download/webview2-runtime-v1.0.0/MicrosoftEdgeWebView2RuntimeInstallerX64.exe)
once, or use the offline Family Arcade launcher.
