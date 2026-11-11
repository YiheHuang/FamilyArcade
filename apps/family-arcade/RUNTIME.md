## WebView2 runtime

The **all-in-one installer embeds the Microsoft Edge WebView2 Evergreen Runtime offline
installer** and every portable game folder ships `WebView2Loader.dll`. A clean Windows
10/11 x64 machine does not need to download anything before launching a game.

Per-game installers ship `WebView2Loader.dll` and Tauri's WebView2 bootstrapper. If a
minimal/offline Windows image reports that WebView2 is missing, install the
[offline x64 runtime](https://github.com/YiheHuang/FamilyArcade/releases/download/webview2-runtime-v1.0.0/MicrosoftEdgeWebView2RuntimeInstallerX64.exe)
once, or use the Family Arcade launcher.

