# Quarto · known limitations (v0.1)

- **Two players only.** The engine and UI are built for Player 1 and Player 2.
- **Hard is strong, not a solved player.** It uses iterative deepening, alpha-beta and a
  forced-piece filter, but it is not an exhaustive Quarto solver. It can still be beaten.
- **No online matchmaking.** LAN rooms are IPv4 on the same local network. There is no
  cloud room, account or remote play.
- **No spectator mode.** A second guest receives “room full”.
- **Stats are local.** The current game and family record live in this browser/device.
  A LAN result is recorded on the host only. Clearing the record affects only the current
  device.
- **Autosave is local and AI only.** LAN games are authoritative on the host and are not
  resumed from the guest. Undo history is not persisted across a reload; a resumed game
  can continue, but cannot undo actions from before the reload.
- **Undo is disabled after the result.** This keeps the recorded result consistent. Undo
  and hints are also disabled in LAN games.
- **Browser QR may use `localhost`.** In Vite dev the invite can point at `localhost`,
  which a phone cannot reach. Use the Tauri build or the host machine's LAN IP for a
  phone on the same Wi-Fi.
- **Host crashes are best effort.** Leaving normally sends a room-closed notice. If the
  host process disappears without one, the guest should rejoin from the invite URL.
- **No double-quarto scoring.** The optional scoring variant is not implemented; any
  shared attribute ends the game.
- **No tournament clocks or ratings.** The family record is a warm scorebook, not a
  rating system.
- **No installer in the browser build.** The Tauri NSIS build is local and unsigned.
- **No 4K or vertical promo.** The shipped promo is 1080p60, 45 seconds, EN/ZH.
- **Room code is four digits.** It keeps honest family members in the right room, not a
  determined attacker on the same LAN.
