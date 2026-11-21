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
- can be verified, not merely compiled;
- is published as `family-arcade-android-v3.2.0` **only** after the 53/53
  verification gate passes.

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

## Validated Android baseline (2026-11-21)

These versions were actually built and run on this machine; prefer them over
experimenting:

- Gradle 8.10.2, AGP 8.7.3, Kotlin 2.0.21, JDK 21, `compileSdk`/`targetSdk` 35,
  `minSdk` 26, Java/Kotlin target 17.
- A trivial debug APK built in 2m25s, installed with `adb install -r`, launched,
  and `topResumedActivity` confirmed.
- Ktor 3.0.3 (`ktor-server-core-jvm`, `ktor-server-cio-jvm`,
  `ktor-server-websockets-jvm`) plus `kotlinx-coroutines-android:1.9.0` compiled
  and ran inside the emulator. `GET /health` returned `ok`; a WebSocket text
  echo round-trip succeeded through `adb forward tcp:18089 tcp:8089`.
- AVD `familyarcade-api35` (Pixel 6, API 35, x86_64) is pre-created and
  boot-verified. Reuse it:
  `emulator -avd familyarcade-api35 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot -accel on`
- `install(WebSockets)` without options compiles on Ktor 3.0.3. The Ktor 2-style
  `pingPeriod = 15.seconds` / `timeout = 15.seconds` properties did **not**
  resolve here; omit them or use the Ktor 3 API.
- Build-tools 34.0.0 and 35.0.0 are both installed; AGP 8.7.3 selects 34.0.0 by
  default.
- Host-side testing pattern: `adb forward tcp:18089 tcp:8089`, then use
  `Invoke-WebRequest http://127.0.0.1:18089/health` and a Node `ws` client from
  the repository root.

## Build the game assets

Write `tools/build-mobile-web.mjs` (or equivalent) that, for every slug in the Hub
data:

- runs a production Vite build with `--base ./` (so assets work under a nested path);
- handles `splendor` through its client workspace;
- **does not copy the existing `apps/*/dist` folders**: they were built with base
  `/` and their asset URLs will 404 under a nested path. Rebuild every game;
- copies the resulting `dist` into `android/app/src/main/assets/games/<slug>/`;
- verifies `index.html` and at least one JS/CSS asset exist.
- builds the mobile Hub into `android/app/src/main/assets/www/`.

Do not hand-edit 53 game apps. A generic build/copy pipeline is required.

## Concrete implementation hints

- Reuse the app discovery and build logic already in `tools/build-all-portable.mjs`
  and `tools/prepare-hub.mjs`. Do not invent a second game registry.
- Keep the desktop Tauri Hub untouched. Build a separate static mobile Hub (for
  example under `tools/mobile-hub/`) from
  `apps/family-arcade/src/data/games.json` and `public/thumbs/`, and copy its
  `dist` into `assets/www/`. This avoids breaking the Windows launcher.
- Static server: serve `index.html` for unknown paths (SPA fallback), set correct
  MIME types, block directory traversal, and disable caching in debug builds.
- Wi-Fi address: enumerate non-loopback IPv4 `NetworkInterface` addresses instead
  of `WifiManager`, so no runtime location permission is needed. Bind `0.0.0.0`.
- Port conflicts: try 8080–8090 and return the chosen port to JavaScript. Show all
  candidate URLs in the Hub.
- WebSocket relay: match `tools/lan-server.mjs` exactly, including first-host
  assignment, room codes, max players, `peer-join`/`peer-leave` broadcasts, and
  guest-to-host-only intent routing.
- Android Back: if a game iframe is open, stop the game server and return to the
  grid; otherwise finish the activity.
- Storage: rely on WebView DOM storage for the games' existing `localStorage`
  saves. Do not require Tauri filesystem APIs.
- Save persistence: `localStorage` is origin-scoped. Use one stable game origin
  (prefer a fixed port such as 8080 and stop the previous game server before
  starting the next, or serve games under stable paths on one origin). If a game's
  port changes between sessions, its saves will look lost. Verify save/reload
  across a server restart.
- Language propagation: the Hub (`127.0.0.1:8088`) and the game iframe
  (`<phone-ip>:<port>`) are different origins, so they do not share
  `localStorage`. Pass `?lang=en|zh` or a `postMessage`, and make the static server
  set the game's own `familyarcade.lang` before the app script runs. Verify EN and
  ZH inside the iframe, not just on the Hub.
- If a shared package needs a browser-only guard for Tauri, patch the shared
  package once and document it. Do not edit all 53 apps.
- If a game refuses to run in an iframe (frame-busting or top-window logic), fall
  back to a dedicated full-screen WebView activity for that game and document it.

## Verification is mandatory

The release is allowed **only** if every gate below passes. Do not claim a test that
did not run, and do not substitute a screenshot of the home screen for actual play.

### 1. Source checks

`node tools/check-all.mjs` must report **53/53 apps green**. Save the full output to
`tools/android/logs/check-all.log` and record `checks.checkAll = "53/53"`.

### 2. Mobile assets

`node tools/build-mobile-web.mjs` must produce **53/53** game folders with
`index.html` plus at least one JS/CSS asset, and the mobile Hub in `assets/www/`.
Record `checks.mobileAssets = "53/53"`.

### 3. Mobile Hub browser tests

Run Playwright at **390×844, 768×1024 and 1280×800**:

- 53 cards, search, category filters, EN/ZH switch, no horizontal overflow;
- open a game, iframe loads, Back returns;
- all 53 games load in an iframe without console errors or page errors.

Save the script and output under `tools/android/`. Record `checks.hub = "53/53"`.

### 4. Android 53-game matrix (the important one)

Build and install the APK on the pre-created `familyarcade-api35` emulator. Enable
WebView debugging in debug builds. For **every one of the 53 canonical slugs** in
`tools/check-all.mjs` / `apps/family-arcade/src/data/games.json`:

1. Open that game in the **actual Android app**, not desktop Chrome. Support a deep
   link such as `http://127.0.0.1:8088/#/play/<slug>` so automation can open each
   game directly.
2. Wait for the game to load and assert that real content is present (board, cards,
   dice, grid, or game-specific controls), not a blank iframe.
3. Perform **at least one real interaction**: start solo/hot-seat, place a legal
   stone/piece, play a card, roll the dice, or press the primary action. Assert the
   UI changed in response.
4. Assert zero console errors and zero page errors for that game.
5. Capture a screenshot **after the interaction** to
   `docs/android-shots/<slug>.png` (at least 8 KB, not a blank screen).
6. Append a row to `docs/android-verification.json` immediately, so a later crash
   does not lose the evidence.
7. After every batch, check `adb logcat` for `FATAL EXCEPTION`; any crash fails the
   gate.

WebView automation hint: `WebView.setWebContentsDebuggingEnabled(true)`, find the
socket with `adb shell cat /proc/net/unix | findstr webview_devtools_remote`, then
`adb forward tcp:9222 localabstract:<socket>` and
`chromium.connectOverCDP('http://127.0.0.1:9222')`. If CDP is unreliable, use a
debug-only JavaScript bridge plus `uiautomator dump` and `adb shell input tap`, but
still capture the real post-interaction screenshot.

### 5. Existing per-game suites

- Run `npm run e2e` for every game that has `scripts/e2e.mjs` (52 games as of
  2026-11-21). This exercises real solo, hot-seat, language and mobile flows.
- Run `npm run lan:e2e` for every game that has `scripts/lan-e2e.mjs` (31 games as of
  2026-11-21). Use a unique `LAN_PORT` per game and run them sequentially.
- Record `checks.e2e` and `checks.lanE2e` as `passed/total`. All must pass. Logs go
  under `tools/android/logs/e2e/` and `tools/android/logs/lan/`.
- For games without a LAN script, state in the report whether LAN is implemented and
  how it was covered. Do not invent a pass.

### 6. Android-hosted LAN proof

Use **Gomoku or Chess** and the embedded Ktor server:

- host a room inside the Android app;
- connect a second real browser context as the guest and play several real moves;
- verify both sides update, the guest cannot restart locally, and the host can
  restart;
- on the emulator, use `adb forward tcp:18089 tcp:8089` and load both host and guest
  through `http://127.0.0.1:18089/`; note in the report that a physical phone would
  use its Wi-Fi IP instead;
- record a `lan` entry with `kind: "android-host"` and `status: "pass"`.

### 7. Android build proof

- `gradlew.bat assembleDebug`, copy to
  `releases/android/FamilyArcade_3.2.0.apk`;
- `aapt dump badging` must show package `com.familyarcade.mobile`, versionName
  `3.2.0`, minSdk 26, targetSdk 35;
- the APK must contain `assets/www/index.html` and **53** distinct
  `assets/games/<slug>/index.html` entries;
- install, launch, confirm `topResumedActivity`, check logcat for crashes, and
  screenshot the Hub on phone and tablet sizes;
- save proof: in one game, make a move, close and reopen the game, and confirm the
  saved game is offered and resumes;
- language proof: open one game from the Hub in English and one in Chinese and
  verify the iframe language follows the Hub.
- If the emulator cannot run, stop: a browser-only result is not enough to publish.
  Report the exact blocker instead.

### 8. Verification artifact

Write `docs/android-verification.json` with exactly this shape:

```json
{
  "version": "3.2.0",
  "generatedAt": "2026-11-22T03:00:00+08:00",
  "device": {
    "kind": "emulator",
    "avd": "familyarcade-api35",
    "api": 35,
    "resolution": "1080x2400"
  },
  "summary": { "games": 53, "passed": 53, "failed": 0 },
  "checks": {
    "checkAll": "53/53",
    "mobileAssets": "53/53",
    "hub": "53/53",
    "e2e": "52/52",
    "lanE2e": "31/31"
  },
  "games": [
    {
      "slug": "gomoku",
      "status": "pass",
      "loaded": true,
      "consoleErrors": 0,
      "pageErrors": 0,
      "interaction": "started hot-seat and placed a black stone at the centre",
      "screenshot": "docs/android-shots/gomoku.png"
    }
  ],
  "lan": [
    {
      "slug": "gomoku",
      "kind": "android-host",
      "status": "pass",
      "guest": "desktop Chrome via adb forward",
      "moves": 5,
      "evidence": "tools/android/logs/lan/android-host-gomoku.log"
    }
  ]
}
```

### 8b. Subagent playtest (mandatory, separate from automation)

Automated scripts and screenshots are **not enough**. Dispatch **at least 10**
subagents (13–15 recommended), each assigned 3–5 games, until every one of the 53
games has been played by a subagent. This is a release blocker.

Each subagent must:

- read the game's `README.md`, `docs/rules.md` and `docs/limitations.md`;
- play against the AI for several turns or a short full game;
- play hot-seat with both seats and the privacy cover;
- play LAN host + guest for several moves if the game supports LAN;
- switch EN/ZH and check language purity;
- use hint/undo, save/reload, result/record where available;
- check phone 390×844 and tablet 1280×800;
- capture at least **2 screenshots per game** (solo and hot-seat/LAN or tablet);
- report concrete issues with severity P0/P1/P2 and a final verdict.

Run the playtests against the **same mobile bundles embedded in the APK**. Preferred:
serve `android/app/src/main/assets/www` plus the game folders on the host with a
static server, or drive the Android WebView through `adb forward` and CDP. If
multiple subagents cannot share one emulator, use desktop Chrome at 390×844 and
1280×800 and state that in the report; the Android wrapper is still covered by the
automated 53-game matrix. Do not accept "the page loaded" as a playtest: each
subagent must make real moves and observe real responses.

Aggregate into `docs/android-playtest.json`:

```json
{
  "version": "3.2.0",
  "agents": 15,
  "summary": { "games": 53, "passed": 53, "failed": 0, "p0": 0, "p1": 0 },
  "games": [
    {
      "slug": "gomoku",
      "agent": "qa-3",
      "verdict": "pass",
      "modes": ["ai", "hot-seat", "lan"],
      "issues": [],
      "screenshots": [
        "docs/android-playtest-shots/gomoku-solo.png",
        "docs/android-playtest-shots/gomoku-lan.png"
      ]
    }
  ]
}
```

Fix every P0/P1 found and rerun the affected game with a subagent. P2 may be
documented and deferred. The final JSON must reflect the post-fix retest, not the
first attempt. The gate requires 53/53 `verdict: "pass"`, at least 10 agents, zero
P0/P1, and at least two non-trivial screenshots per game.

### 9. Report

Write `docs/android-report.md` with architecture, exact commands and results, APK
path/size/SHA256, what was verified on Android vs browser/JVM, the subagent
playtest summary (agents, games, issues found/fixed), known gaps (background
hosting, LAN discovery, tablet layouts), and every shared-file change.

### 10. Release gate and publication

1. Run `powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\verify-release.ps1`.
   It must print `RELEASE GATE PASSED`.
2. If and only if it passes:
   - commit on `android-mobile`;
   - fast-forward `main` to the verified commit (`git checkout main`, `git merge --ff-only android-mobile`);
   - push `main` and `android-mobile`;
   - publish with
     `powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\publish-android.ps1`.
3. Verify the release URL and asset size through the GitHub API, and record the URL
   in `docs/android-report.md`.
4. Update `README.md` (English) and `README.zh-CN.md` (Chinese) with a short Android
   download/install section and the release link. Keep the two languages separate.
5. If the gate fails, do **not** push and do **not** create a release. Leave the
   branch and a blocker report.

## Repository rules

- Work on a new branch `android-mobile`; commit there.
- Do not rewrite history, do not delete desktop releases or game assets.
- Push and publish **only** after the release gate passes. The authorization is
  conditional on real 53/53 verification.
- Do not change game rules, scoring, AI or the 53 game source trees except for a
  minimal shared LAN/invite fix if unavoidable; document any such change.
- Keep English UI English-only and Chinese UI Chinese-only; only the switch, game
  names and technical terms may cross over.
- Do not add ads, accounts, telemetry or cloud services.
- Use subagents for parallel game builds/tests, but keep ports, Android assets and
  the verification JSON conflict-free.
- Keep large build/test logs on disk and print one-line summaries. Do not paste 53
  full logs into the conversation; preserve context for debugging and verification.
- If a step fails, fix it and rerun. If a hard blocker remains, leave the repo clean
  enough to continue and write the blocker report.

Start by reading this brief, the root `README.md`, `apps/family-arcade`, `packages/lan`
and `tools/lan-server.mjs`. Then implement, build, verify, gate and publish.
