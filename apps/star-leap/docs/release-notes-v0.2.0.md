# Star Leap v0.2.0 — LAN rooms and the desktop shell

**Release date:** 2026-11-11

## What is new

- **Authoritative LAN host**: room code, QR invite, 2–4 seats, live seat status,
  and a lobby that says when the shared relay is unreachable.
- **Browser guests**: scan the QR, take a seat, and send move intents. The host
  validates and applies every move, then sends each guest their own `view(state,
  seat)`.
- **Reconnect token**: the same browser restores its seat automatically; the
  guest lobby shows the token and accepts a pasted token on another device.
- **Honest LAN errors**: wrong code, full room, no answer, relay missing, host
  closed. No raw socket messages in the UI.
- **Tauri 2 shell**: `src-tauri/` uses the shared `family-arcade-lan-host` relay and an
  NSIS current-user installer (Simplified Chinese + English, WebView2
  download bootstrapper). The installer was **not** rebuilt in this pass.
- **200-game AI calibration**: four match-ups, alternating colours, seeded RNG,
  method and caveats documented in [`ai-calibration.md`](ai-calibration.md).
- Bilingual README LAN + installer sections, LAN screenshots, and a
  `video.json` manifest for the existing bespoke 48-second promo.

## Checks

- `npm run check` — typecheck, 31 unit tests, production build.
- `node scripts/e2e.mjs` — solo, hot-seat, undo, win, stats, replay, mobile.
- `npm run e2e:lan` — real host + guest over the shared relay: move both ways,
  reconnect with the same token, wrong-code rejection.
- `npm run calibrate` — 200 games per match-up, 3.2 minutes.
- `node scripts/shots.mjs` — real screenshots including LAN host + phone guest.

## Known gaps

- Same local network only; no AI caretaker, spectator view, host migration or
  internet play.
- Browser hosting needs the `npm run lan` relay (the desktop app starts its own).
- Hard vs Normal is draw-heavy and Normal won more decisive games in the 200-game
  sample; see the calibration report.
- 2–4 players; no 6-player party mode.

## Next

- Family playtest pass and AI tuning, especially Hard vs Normal.
- Optional 6-player party mode and a LAN caretaker for a dropped seat.
