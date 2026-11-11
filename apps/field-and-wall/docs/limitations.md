# Known limitations — Field & Wall v0.1

> Honesty is part of the product. If it is not in the app, it is here.

## Game scope

| Limitation | What it means | Next milestone |
| --- | --- | --- |
| **No farms / farmers** | Field edges only align. There is no farmer placement, no field majority and no end-game farm scoring. | Not planned for v0.1. A future expansion would need a separate field/segment model and new tests. |
| **One field type per edge** | A road does not split a field into sub-fields. This is coherent with “no farms”, but it is simpler than full Carcassonne-style field topology. | Would come with farms. |
| **54 tiles, 15 types** | A deliberately compact set: enough for 2–4 players, about 53 draws, 30–35 minutes target. | More tile types only after playtests; do not add without a balance pass. |
| **No expansions** | No river, inns, traders, builders, big meeples or 5th player. | Out of scope. |
| **7 meeples per player** | Fixed for 2–4 players. | If a 5th seat is ever added, rebalance the supply. |
| **Shared wins** | Score tie → more completed features wins; still tied → shared win. No arbitrary seat tie-break. | Documented and tested; keep. |

## Platform & modes

| Limitation | What it means | Next milestone |
| --- | --- | --- |
| **No local installer build** | The shared Tauri shell and config are present, but this pass did not run `cargo`/`tauri build`; the central Family Arcade release job produces the installer. | Central release validation and SmartScreen/firewall copy. |
| **LAN needs the host page** | Host-authoritative LAN is implemented for 2–4 seats: code, QR, seat status and guest reconnect. The host must keep the page open; refreshing/closing it ends the room. Every seat must be online before the start. | Host migration/reconnect is out of scope; next milestone. |
| **No LAN spectate/pause/undo** | Guests send tile/meeple intents only. There is no spectator seat, pause, nudge or undo vote on LAN. | v0.2. |
| **No online accounts / cloud** | No login, no telemetry, no leaderboard. localStorage only. | Intentionally never. |
| **Hot-seat is one screen** | No hidden information, so passing the device is not required for secrecy. | — |
| **No PWA install** | Works in a phone browser, but is not installable as an offline PWA in this pass. | Optional v0.2. |
| **Relay port** | The browser relay defaults to 8080. The shared monorepo test uses 8096 via `?lanPort=` when 8080 is occupied by another app. | Document/choose a port in the central launcher. |
| **Browser QR needs the LAN address** | The QR uses the address in the host page's URL. Open the host via its LAN IPv4 (e.g. `http://192.168.1.20:8080`), not `localhost`, or phones cannot reach the link. The Tauri path is wired to use the relay's reported LAN URLs but was not run in this pass. | Add address discovery to the browser relay. |
| **No pinch zoom** | Board pans by drag and zooms with +/− buttons/wheel. Pinch gestures are not implemented. | Nice-to-have. |

## AI

| Limitation | What it means |
| --- | --- |
| **200-game calibration, one close pair** | 200 seeded self-play games per pairing, 40 ms/move: Companion 20% vs Easy, Easy 34% vs Normal, Normal 52% vs Hard. The last pair is still too close (within ~3.5 pp standard error) to claim an ordering. |
| **Hard is not a deep search** | Hard samples public remaining tile types and a few opponent replies; it does not solve the game. It only sees `view()`, never the bag order. |
| **Companion is intentionally gentle** | Its stealing penalty and lower opponent weight make it weaker; it is not meant to beat a strong adult. |
| **Hint can block briefly** | Hints run in the Worker; the UI disables the hint button while a hint is pending. |

## Production & video

| Limitation | What it means |
| --- | --- |
| **Two cuts, same timeline** | Both Chinese and English MP4s are rendered (1920×1080, 60 fps, ~8.4–8.7 MB) with per-line Edge TTS voiceover. |
| **Mastered for review** | Both cuts measure −14.4 / −14.1 LUFS and −1.47 / −1.49 dBTP. This is a release-acceptable master, but a formal broadcast QC pass is still recommended. |
| **Screenshots are not pixel-regression gated** | `scripts/shots.mjs` regenerates them, but there is no baseline diff threshold in CI. |
| **Stats screenshot uses local demo data** | The stats screen is real; the seeded history is demo data, noted in `docs/screenshots/README.md`. |
| **No installer size / cold-start benchmark** | The browser build is ~405 KB JS + 42 KB CSS (gzip ~127 KB + 9 KB); the central Tauri installer is not built or measured in this pass. |

## Quality gates not met in this pass

- Branch coverage ≥90% is not measured.
- The 200-game AI calibration is produced, but Normal vs Hard is not separated; more games
  or tuning are needed before claiming a strength ordering.
- Tauri packaging, clean-Windows install and screenshot pixel regression are not run in
  this app pass; LAN E2E is implemented and passing.

These are release-standard gaps, not hidden claims. The v0.1 game itself is complete for
solo, hot-seat and a host-authoritative LAN table; the central release still has to build
and validate the Tauri installer.
