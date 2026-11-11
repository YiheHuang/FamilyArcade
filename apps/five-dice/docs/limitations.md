# Five Dice · known limitations (v0.1)

## Rules scope

- **No Yahtzee bonus.** Extra five-of-a-kind hands do not add 100 points; only the
  13 boxes and the 63→35 upper bonus are implemented, as specified in the brief.
- **No joker rule.** A five-of-a-kind cannot be used as a full house or a straight.
  It is not a full house (strictest reading), and the player must choose an open box.
- **Upper bonus is awarded at 63** even if the upper section is not yet fully filled;
  in practice a game only ends after all 13 boxes are filled, so the final result is
  the same.
- **Ties share the win.** There is no sudden-death roll-off.

## AI

- Hard uses **exact one-roll keep probabilities** for every open box and a
  bonus-aware category choice. It does not solve the full three-roll dynamic program,
  so it is strong but not mathematically perfect.
- Companion deliberately chases fun hands (full house, straights, five of a kind) and
  is gentle with children. It is not a challenge opponent.
- Easy keeps the largest group and makes random category choices; it is meant to be
  beatable.
- Normal uses exact one-roll odds with a heuristic keep mask and a simple EV choice.
- All AI levels are deterministic given the injected RNG; the UI uses `Math.random`
  for real play, while tests and screenshots inject a seeded RNG.

## Modes and saves

- **Autosave and Continue** cover solo and hot-seat games only. LAN games live in the
  host's memory and are not written to the guest's device.
- **Undo** is available in solo and hot-seat. It is disabled in LAN (the host and
  guests would desynchronise) and after the final score. Undoing in solo can restore a
  state before the AI replied; the AI will reply again.
- **Family record** is local to this browser/device in `localStorage`. LAN games are
  not added to it. Clearing the record is a two-click action.
- A saved game is versioned and shape-checked. A corrupted save is ignored rather
  than crashing the app.

## LAN

- LAN is **IPv4 on the same subnet**. The host relay and Windows firewall must allow
  the connection; guests open the address shown by the host.
- **Two to four players** are supported. The host owns the state and plays seat 0
  internally; guests are seats 1–3 and see only their own `viewFor` view.
- A guest who drops mid-game pauses the host's ability to act until the room is
  restarted. There is no mid-game reconnect or seat takeover. Restart the room if a
  guest leaves.
- The relay only forwards messages. It does not authenticate the room code; the
  4-digit code keeps an honest family out, not a determined attacker on the LAN. The
  browser relay in `tools/lan-server.mjs` tracks one host at a time, so run one hosted
  room per relay process.
- Browser LAN needs `npm run lan` (or the Tauri relay). If port 8080 is already in
  use, serve the relay on another port and open the host page with `?relay=PORT`.
- The Tauri desktop build starts the shared Rust relay internally; the browser build
  does not bundle a relay process.

## Distribution and verification

- The Tauri NSIS installer is **unsigned**. Windows SmartScreen will warn on first
  run. This tree was verified with `npx tsc --noEmit`, Vitest, `vite build`, a real
  Chrome E2E run and a two-page LAN run; `cargo build`/`tauri build` were intentionally
  left to the central build agent.
- No 4K/vertical promo cut is built in this app. `video.json` is the manifest the
  root Family Arcade studio uses to render the 45-second EN/ZH promo.
- Screenshots are real UI captures from `scripts/shots.mjs` using seed 23 and a
  deliberately seeded local family record. The record is sample data, not a claim
  about a real family's scores.
- No accounts, cloud saves, telemetry, ads, matchmaking, spectators or chat. No
  remote fonts or downloaded art; dice pips, table and layout are CSS.
