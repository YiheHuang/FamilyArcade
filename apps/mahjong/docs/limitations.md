# Mahjong · known limitations (v0.1)

- **One hand per session.** The app deals a complete hand and records the result. There
  is no dealer rotation, renchan, match target or multi-round wind progression. The round
  wind is a setting, not an advancing match state.
- **Fixed dealer seat.** The human is seat 0 and the dealer in the solo table. The engine
  accepts any dealer, but the UI does not expose a dealer choice or rotate it between
  hands.
- **No flowers, dora, ura-dora, riichi or furiten.** The deck is the 136-tile Chinese set
  in the brief. Special regional rules such as spirit tiles belong to the separate
  Nanchang game.
- **Minimum fan is a table setting.** The UI offers 1, 2 or 3 fan; the default is 1. A
  valid winning shape below the minimum cannot be declared. There is no reduced payment
  for a low-fan win.
- **One winner.** If more than one seat could win the same discard, the nearest seat in
  turn order is chosen after all claim decisions. There is no multiple-ron settlement.
- **Kong variations.** Concealed kongs cannot be robbed; added kongs can. A kong cannot
  be declared when the wall is empty. An exposed kong takes a replacement tile.
- **Points are a family convention.** Self draw pays `fan` from each opponent; a discard
  or robbing-kong win pays `3 × fan` from the responsible player. The fan table is the
  authoritative part; other families may prefer different points.
- **Seven pairs and thirteen orphans are fixed.** Seven pairs allows a quad as two pairs.
  Thirteen orphans requires exactly fourteen tiles with one duplicate. Other regional
  variants may prohibit quads or allow a thirteen-tile wait differently.
- **Last-tile fan is simple.** Winning on the final wall tile or the final discard scores
  the last-tile fan. There is no separate exhaustive-draw payment, tenpai reveal or
  abortive-draw procedure.
- **AI is a heuristic, not a solver.** All levels are deterministic with an injected RNG
  and never read hidden hands. Hard uses shanten, visible-tile counting, danger estimates
  and meld value; it can still misplay, especially in unusual waits and defence spots.
- **Companion is intentionally soft.** It makes more random discards and declines more
  marginal calls. It is not a tournament opponent.
- **Hot-seat privacy is etiquette.** The hand is not rendered until the named seat reveals
  it, but the device itself is shared. A determined player can inspect browser storage or
  history.
- **LAN is same-subnet IPv4.** The host is authoritative. Empty seats are filled by the
  selected AI level. A disconnected guest seat returns to AI. There is no spectator,
  online matchmaking, account or cloud record.
- **LAN records on the host only.** The host writes the family record; a guest device does
  not receive another seat’s hand or the host’s local record.
- **Undo and hints pause in LAN.** This prevents a device from receiving extra search help
  or rewinding a public position. Hot-seat undo turns the hand cover back on.
- **Room code is four digits.** It is a family convenience, not a security boundary
  against a determined attacker on the same network.
- **Autosave and record are local.** They live in this browser or desktop WebView only.
  Clearing them affects only this device.
- **Screenshot fixtures.** `game-over.png` and `claim.png` come from valid deterministic
  engine fixtures (`?demo=win`, `?demo=claim`); live play is covered by the E2E and LAN
  tests.
- **No Tauri build in this run.** The shell is kept and type-checked, but `cargo` and
  `tauri build` are left to the central build agent. The installer is unsigned and may
  trigger a SmartScreen warning.
- **No 4K or vertical promo cut.** The root studio renders the promo from `video.json`;
  no separate Remotion project ships in this app.
