# Fleet · known limitations (v0.1)

Fleet is intentionally a small family game, not a competitive online client. These are
the honest gaps in this build.

## Rules and content

- **Two captains only.** There is no spectator seat, no third player and no team mode.
- **One shot per turn, even on a hit.** This is the documented family variant in
  [`rules.md`](rules.md). “Hit again” and salvo variants are not implemented.
- **Ships may touch.** Only overlap and leaving the 10×10 chart are rejected. There is
  no optional “no-touching” rule and no diagonal placement.
- **No draws and no score.** A battle always ends when one fleet is fully sunk. The
  logbook records wins, not points or accuracy.
- **Placement is tap-to-place.** Pick a hull and heading, then tap a start square or use
  auto-place. There is no drag-and-drop, and a placed hull is lifted by tapping it.
- **One save slot.** Autosave keeps only the most recent solo/hot-seat game. Starting a
  new local game replaces it. LAN games are never autosaved.

## LAN

- **Local subnet IPv4 only.** There is no internet play, matchmaking, relay service,
  TLS, account system or NAT traversal.
- **No reconnect or resume.** If the host closes the window, the room and battle end.
  A guest who loses the connection must rejoin a new room.
- **No undo in LAN.** The host holds the authoritative state; undo would let one screen
  rewind a shot the other screen has already seen. Hints still work from the guest's own
  view.
- **Host trust.** The guest receives a per-seat view and never the full state, but the
  host device necessarily holds both fleets in memory. A determined host could inspect
  devtools. This is a family game, not an anti-cheat client.
- **Hot-seat privacy is a curtain, not encryption.** The pass screen hides the next
  captain's fleet from casual eyes, but both fleets live in the same browser state; a
  player with devtools could inspect them. Use two devices for serious secrecy.
- **Room code is family privacy, not security.** It keeps honest family members out of
  the wrong room; it is not a password against a determined attacker on the same LAN.
- **Firewall.** Windows may ask to allow the app or Node relay on the local network.
  Guest phones need that permission and the same Wi-Fi.
- **Port 8080.** The browser relay defaults to 8080. If another Family Arcade game occupies
  it, set `VITE_LAN_PORT` for the host dev server and start the relay with the matching
  `--port` (documented in the README). The Tauri desktop shell uses its own internal
  relay and is unaffected.

## AI

- **Hard is strong, not perfect.** It uses probability density over public information.
  It does not peek at the player's fleet, so a lucky or clever human can still win.
- **Companion deliberately eases off.** It sometimes sweeps near its own misses, follows
  hits only part of the time, and gives extra slack when one enemy ship remains. It is
  designed to be kind to children, not to be a strong opponent.
- **Determinism is per injected RNG.** The app passes `Math.random`, so two app games
  differ. Passing the same seeded RNG and the same view gives the same shot in tests.

## Platform and packaging

- **No `cargo build` or `tauri build` was run here.** The brief assigns installer builds
  to the main agent. The Tauri shell, icons, capabilities and LAN command wiring are
  kept intact; frontend verification used `tsc`, Vitest, Vite and Chrome.
- **Unsigned Windows build.** SmartScreen may warn on the NSIS installer.
- **Web build first.** This is a browser app wrapped by Tauri; there is no native
  battleship rendering, no app-store package and no auto-update in this app.
- **Mobile is portrait-first.** The layout is responsive from 390px upward; landscape
  works but is not separately art-directed.
- **Audio is synthesised, not mixed.** The sound toggle follows the design brief; there
  is no volume slider, music track or downloadable audio file.
- **No remote assets.** No CDN, remote font, downloaded art or third-party sample is
  used. The QR code is generated locally by the `qrcode` dependency.

## Accessibility and localisation

- **English and Simplified Chinese** are complete; no other language is shipped.
- **Keyboard path** covers arrows, Enter, R, H, U and Esc. Screen-reader labels describe
  each cell's coordinate and state, but the board is a 100-button grid rather than a
  fully virtualised ARIA table.
- **Reduced motion** is honoured with a CSS media query. Sound can be turned off.
- **Colour is not the only cue:** misses are rings, hits/sunk are cross marks, and hulls
  have shape/borders. The small screen still compresses the 10×10 chart to roughly 32px
  cells, which may be tight for some users.

## Promo and repository

- **No separate Remotion project.** `video.json` is the single source for the root
  studio's 45-second bilingual promo. This app does not ship rendered promo files,
  posters, narration audio or a 4K/vertical cut.
- **Screenshots are real captures** from headless Chrome at 1440×1000 and 390×844 @2×.
  They are regenerated with `node scripts/shots.mjs` against the real dev server.
