# Family Arcade Android build · autonomous overnight brief

You are the autonomous build agent for the Family Arcade repository at
`C:\Users\Yihe Huang\yihe\FamilyArcade`. Work until you have a real Android APK and a
verification report, or until you have a concrete, documented blocker. Do not stop to
ask questions; choose the simplest robust option and document it.

The repository already has 53 finished desktop/Web games, a Hub, three Windows
launchers and 53 game ZIP packages. Do not change game rules, scoring, AI or the
existing desktop releases.

## Goal

Build **one** Android app named **Family Arcade Mobile** that:

- contains all 53 games and works offline;
- adapts cleanly to phones and tablets (360–1280 CSS px);
- supports solo, hot-seat and LAN;
- lets the Android device **host** a LAN room and lets other phones/desktops join;
- keeps the existing bilingual English/Chinese UI and the family-library style;
- produces a debug APK at `releases/android/FamilyArcade_3.2.0.apk`;
- can be verified, not merely compiled.

## Recommended architecture

Use a **single native Android WebView app** with an embedded Ktor/JVM HTTP +
WebSocket server. This avoids Android NDK/Tauri Rust cross-compilation and lets the
phone host LAN rooms.

1. New Gradle/Kotlin project under `android/`:
   - package `com.familyarcade.mobile`;
   - minSdk 26, target/compileSdk 35;
   - Java 21 toolchain is installed; Android SDK must be installed if missing.
2. Bundle:
   - a mobile Hub web app in `assets/www/`;
   - all 53 game builds in `assets/games/<slug>/`.
3. Two local servers:
   - Hub server on a fixed local port (for example 8088) serving `assets/www/` and
     loading in the WebView at `http://127.0.0.1:8088/`.
   - Game server on 8080 (try 8080–8090) serving exactly one game at `/` plus the
     shared `/ws` WebSocket relay. The Hub starts/stops it through a
     `@JavascriptInterface` bridge and receives `{ port, urls }`.
4. The Hub opens the selected game in a full-screen iframe at the first LAN URL
   (`http://<phone-ip>:<port>/`), not `127.0.0.1`, so the game’s existing browser LAN
   helper computes the correct invite URL. A Back button stops the server and returns
   to the grid.
5. Port the existing relay protocol from `tools/lan-server.mjs` and
   `packages/lan/src/index.ts` to Kotlin/Ktor WebSockets. Match the wire protocol:
   `join`/`welcome`/`peer-join`/`peer-leave`, host designation, room isolation and
   host-only intent routing. Guests connect over the phone’s Wi-Fi IP.
6. Android manifest/permissions: INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE;
   cleartext traffic allowed; WebView JavaScript, DOM storage, media playback,
   fullscreen and WebView debugging enabled in debug. Keep the screen awake while a
   game is open. Handle the system Back button.
7. Responsive Hub: 1/2/3/4-column grid, search, category filters, language switch,
   game cards with thumbnails, iframe view with title/back, no horizontal overflow.
   Reuse `apps/family-arcade/src/data/games.json` and
   `apps/family-arcade/public/thumbs/`.

If this architecture proves impossible, Tauri 2 Android with the existing Rust relay
is an acceptable fallback, but only after documenting why Ktor/WebView failed.

## Toolchain bootstrap on this machine

Known state / paths (checked on 2026-11-21):

- Node v24.13.0 and npm 11.6.2 are installed.
- JDK 21 is at `C:\Program Files\Java\jdk-21.0.10`; set `JAVA_HOME` to it.
- Android SDK is preinstalled at `%LOCALAPPDATA%\Android\Sdk` with
  `platform-tools`, `platforms;android-35`, `build-tools;35.0.0`, `emulator`
  and the API 35 Google APIs x86_64 system image.
- Gradle 8.10.2 is preinstalled at
  `tools/android/.toolchain/gradle-8.10.2/bin/gradle.bat`.
- Playwright is not installed. Install it or use the built-in OpenCode browser
  tool for responsive checks.
- Outbound HTTPS to `dl.google.com` and `services.gradle.org` works.
- Hyper-V is present, so the emulator should use WHPX. Confirm with
  `emulator -accel-check` before creating an AVD.
- The Windows account path contains a space (`C:\Users\Yihe Huang`). Quote every
  path in scripts and Gradle config.

If anything above is missing, run the idempotent bootstrap first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\bootstrap-toolchain.ps1
```

Then generate the project wrapper with the preinstalled Gradle:

```powershell
& tools\android\.toolchain\gradle-8.10.2\bin\gradle.bat wrapper --gradle-version 8.10.2
```

Use `gradlew.bat assembleDebug` afterwards; do not require a system Gradle.
Keep generated SDK/Gradle/emulator files out of git (`.gitignore` already covers
`tools/android/.toolchain/`, `android/.gradle/` and `android/**/build/`).

## Build the game assets

Write `tools/build-mobile-web.mjs` (or equivalent) that, for every slug in the Hub
data:

- runs a production Vite build with `--base ./` (so assets work under a nested path);
- handles `splendor` through its client workspace;
- copies the resulting `dist` into `android/app/src/main/assets/games/<slug>/`;
- verifies `index.html` and at least one JS/CSS asset exist.
- builds the mobile Hub into `android/app/src/main/assets/www/`.

Do not hand-edit 53 game apps. A generic build/copy pipeline is required.

## Verification is mandatory

Run and record exact results:

1. `node tools/check-all.mjs` → all 53 apps green.
2. `node tools/build-mobile-web.mjs` → 53 asset folders with `index.html`.
3. Mobile Hub Playwright at **390×844, 768×1024 and 1280×800**:
   - 53 cards, search, filters, EN/ZH switch, no horizontal overflow;
   - open a game, iframe loads, Back returns;
   - all 53 games load in an iframe without console errors (a scripted loop is fine).
4. LAN host proof:
   - start the embedded game server for at least **Gomoku or Chess**;
   - host page at `http://<lan-ip>:<port>/`;
   - a second browser context joins via the invite URL and plays a real move;
   - verify both sides update and the host-only result/restart works.
5. Android build:
   - install Android command-line tools/SDK if missing;
   - build `assembleDebug` and copy the APK to
     `releases/android/FamilyArcade_3.2.0.apk`;
   - if an emulator can run, create an API 35 x86_64 AVD, boot it, install the APK,
     launch it, screenshot it, check logcat for crashes and confirm the activity is
     resumed;
   - if WebView remote debugging can be attached, open one game and verify the iframe;
   - if the emulator cannot run on this machine, report the exact blocker and still
     provide `aapt dump badging` / APK contents proof. Do not claim a device test that
     did not happen.
6. Write `docs/android-report.md` with:
   - architecture;
   - commands and exact results;
   - APK path/size;
   - what was verified on emulator/device vs JVM/browser;
   - known gaps (for example LAN discovery, background hosting, tablet-only layouts);
   - any changes to shared files.

## Repository rules

- Work on a new branch `android-mobile`; commit there. Do not push, do not rewrite
  history, do not delete desktop releases or game assets.
- Do not change game rules, scoring, AI or the 53 game source trees except for a
  minimal shared LAN/invite fix if unavoidable; document any such change.
- Keep English UI English-only and Chinese UI Chinese-only; only the switch, game
  names and technical terms may cross over.
- Do not add ads, accounts, telemetry or cloud services.
- Use subagents for parallel game asset builds/tests if useful.
- If a step fails, fix it and rerun. If a hard blocker remains, leave the repo clean
  enough to continue and write the blocker report.

Start by reading this brief, the root `README.md`, `apps/family-arcade`, `packages/lan`
and `tools/lan-server.mjs`. Then implement, build and verify.
