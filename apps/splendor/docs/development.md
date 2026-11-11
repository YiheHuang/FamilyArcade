# Development & checks

## Requirements

- **App**: Node.js 22+, Rust stable (MSVC toolchain on Windows), the WebView2 runtime.
- **Video**: the same Node.js, plus Python 3 with `edge-tts` (`python -m pip install edge-tts`)
  and `ffmpeg`/`ffprobe` on `PATH`.

## App

```bash
npm install           # installs the engine, client, server and Tauri shell
npm run dev           # Vite dev server (http://localhost:5173)
npm run desktop:dev   # run the Tauri shell in dev mode (Vite + Rust, hot reload)
npm run desktop:build # build the Tauri installer (NSIS, ≈3.6 MB)
npm run release       # bump → tests → build → sign → tag → push
npm run lan           # build + run the bare LAN server for scripted hosts
npm run build         # engine + client production build
npm test              # engine + client + server unit tests
npm run typecheck
npm run verify        # typecheck + unit tests + client build + UI checks
```

A clean Rust build takes roughly 10–12 minutes; incremental desktop builds are much faster.
The installer is per-user (no admin) and the app updates itself from the LAN update bundle.

## Scripted checks

The UI and shell are checked by scripts under `scripts/dev/`:

```bash
node scripts/dev/play-test.mjs        # real clicks + assertions (desktop UI)
node scripts/dev/mobile-test.mjs      # phone/tablet layout at three viewports
node scripts/dev/shots-regression.mjs # screenshot regression (fixed seed, canvas diff)
node scripts/dev/tauri-check.mjs      # packaged shell: CDP, relay, embedded assets, data dir
node scripts/dev/lan-e2e.mjs          # app hosts, a phone browser joins and plays
node scripts/dev/update-smoke.mjs     # auto-update end-to-end (install, beacon, restart)
node scripts/dev/rollback-drill.mjs   # a broken update rolls back automatically
node scripts/dev/discovery-check.mjs  # UDP room discovery (probe → reply → room code)
node scripts/dev/perf-check.mjs       # cold start / memory / footprint → docs/perf.md
```

All of these run in GitHub Actions on every push; the release workflow builds the
installer, checksums and signed update bundle on a `v*` tag.

## Video

The 54-second promo lives in `video/` as an independent npm project (Remotion 4,
React 19) so its bundler and dependencies do not interfere with the app.

```bash
cd video
npm install
npm run gen        # real game data + synthesized score/SFX + font subsets
npm run voice      # both narrations (Edge TTS)
npm run srt        # subtitle sidecars in ../docs/promo
npm run facts      # accuracy gate → video/FACTS.md
npm run shots      # real UI stills for the video (needs a built client + server)
npm run readme:shots # README screenshots in ../docs/screenshots/{en,zh}
npm run stills     # key frames → out/stills/
npm run render     # out/splendor-promo-zh.mp4
npm run render:en  # out/splendor-promo-en.mp4
npm run verify out/splendor-promo-zh.mp4
```

The rendered raw files are mastered with ffmpeg (voice compressor + gain + limiter,
and a BT.709 limited-range H.264 encode); the exact command is in
[`video/SCRIPT.md`](../video/SCRIPT.md).

## Repository layout

```
packages/
  engine/    # pure TypeScript rules engine — deterministic, replayable, four AI levels
  client/    # React 19 + Vite + Tailwind v4 + Motion UI
  server/    # LAN server (authoritative rules, reconnect, auto-play, rooms)
  desktop/   # Tauri v2 shell: Rust relay + embedded frontend + signed updater
video/       # Remotion promo: two cuts, real engine data, generated score/SFX, FACTS
scripts/
  dev/       # Playwright UI checks, mobile, shots, packaged app, updates, discovery, perf
  release.mjs / verify-data.mjs / reconcile.mjs / finalize-data.mjs
docs/        # rules-adjacent notes, screenshots, promo outputs, credits
data/        # card-data report, score/seed baselines
```
