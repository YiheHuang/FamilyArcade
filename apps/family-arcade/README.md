# Family Arcade · 家庭游戏馆

**One launcher. 27 games. One table.**

Family Arcade is the front door for the collection: 27 offline family games with AI,
hot-seat and LAN play. Install this one app to launch every game, or install only the
games you want from the per-game releases.

![Family Arcade launcher](docs/screenshots/en/home.jpg)

## What it does

- **One grid, every game.** Search, filter by Classics / Family / Arcade, and launch.
- **Portable game folders.** Each bundled game runs as its own signed-family Tauri
  executable with its own LAN relay and saves. No separate installs needed.
- **Per-game releases stay available.** Prefer one game? Download its own installer.
- **Small comforts.** Recent games, keyboard focus, reduced motion, bilingual labels.
- **Private.** No account, no telemetry, no ads, no network.

## Build

```bash
npm install
npm run dev            # browser preview of the launcher
npm run check
npm run shots          # screenshots (dev server required)
npx tauri build --bundles nsis
```

The all-in-one installer includes `games/<slug>/game.exe` + `dist` for every game.
Those portable folders are assembled by `node tools/prepare-hub.mjs` from the shared
build output.

## Known limits

- The Windows bundle is large because it contains 27 portable games.
- Games open in their own windows; the hub itself does not embed them.
- Installers are unsigned; SmartScreen will ask once.

See the root [README](../../README.md) for the full collection and per-game installers.
