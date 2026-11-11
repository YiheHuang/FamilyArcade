# Ladder Run · known limitations (v0.1.0)

- **Browser-first, Tauri shell kept.** The app runs from Vite and from the existing
  Tauri 2 shell. This pass did not run `cargo build`/`tauri build`, so no installer was
  produced here. The `src-tauri` configuration and shared LAN crate remain intact.
- **LAN is local-subnet IPv4 only.** No internet play, matchmaking, accounts or cloud
  relay. A room holds the host plus up to three guests; there is no spectator seat.
- **Browser LAN invites use the page hostname.** If you open the browser build from
  `localhost`, the QR/invite also says `localhost`, which a phone cannot reach. Open
  the host page via the computer's LAN IP, or use the Tauri build, which supplies the
  local relay's real URLs.
- **Host authority is simple.** The host holds the only board and sends per-seat views.
  If the host tab disappears, guests keep the last view and should reload/rejoin. There
  is no host migration.
- **Guest reconnection is manual.** A reloaded guest can rejoin with the same browser
  token and room URL, but there is no automatic reconnect UI or “host disconnected”
  dialog.
- **Disconnected-seat rescue.** If a guest leaves on their turn, the host may roll for
  that empty seat so the family game does not freeze. This is a house fallback, not a
  replacement for a connected guest.
- **AI has no decisions.** Snakes and ladders is a game of luck. The four levels change
  commentary only; Easy/ Normal/ Hard do not change the die, the odds or the hint. The
  UI and README say this plainly rather than pretending otherwise.
- **No capture, no strategy.** Players share squares. There is no sending an opponent
  back, no extra roll on a six, and no choice between paths. That is the written brief
  and the classic 10×10 folk game used here.
- **Hints are luck previews.** The hint lists all six faces and marks the kindest
  outcome. It is not strategic advice because the game has no strategic move.
- **Undo is local/host only.** Guests cannot undo. Undo is disabled after a win and for
  guest seats. In solo games, undo steps back to the human’s previous roll.
- **Saves are local.** Autosave/resume covers solo and hot-seat only. The family record
  is stored in this browser/device; clearing site data clears it. LAN games are not
  autosaved.
- **No promo film in this app.** `video.json` is the manifest for the root Family Arcade
  studio. There is no separate Remotion project, MP4 or poster checked into this app.
- **Screenshots are curated real renders.** The game and hint screenshots load a
  mid-game save so the board is not empty. They are produced from the running app by
  `scripts/shots.mjs`, not mocked or hand-drawn.
- **Room code is 4 digits.** It is a family convenience, not a security boundary. The
  relay is intended for a trusted home Wi-Fi.
- **Sound is synthesised.** Short WebAudio chimes only; there is no music. Sound is off
  by user preference and never required to play.
- **Chrome is assumed for E2E.** `scripts/e2e.mjs` launches Playwright with the local
  Chrome channel. The app itself has no browser-specific requirement beyond modern
  WebSocket/WebAudio support.
- **No 4K/vertical promo cut.** Not part of this game pass.

If a larger LAN party or online play is needed later, the clean next step is a
reconnect UI plus a room-lobby heartbeat; the engine and per-seat view contract are
already in place.
