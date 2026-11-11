# Boxes · known limitations (v0.1)

- **One board size.** The app is a 6×6 dot grid, 5×5 boxes, 60 lines. There is no
  size picker or handicap yet.
- **Two players only.** Solo, hot-seat and 1v1 LAN. No three/four-player tables,
  teams or spectators.
- **Hard is strong, not perfect.** It uses chain heuristics for most of the game
  and an exact alpha-beta search only on the last 12 lines. Deep endgame
  double-cross lines can still be missed.
- **Companion is intentionally gentle.** It sometimes declines a free box and
  gives away short chains, but it will still take a game the child leaves open.
- **Hints are one AI opinion.** The hint uses the Hard move and labels the reason;
  it is not a full-game oracle.
- **LAN is local-subnet IPv4.** Host and guest must be on the same Wi-Fi, and the
  host firewall must allow the app/relay. The 4-digit code keeps honest family
  members out; it is not strong security. In browser mode the QR address follows the
  hostname of the host page, so use the machine's LAN IP (or the Tauri build) for a
  phone guest.
- **No matchmaking, cloud, accounts or telemetry.** No online rooms beyond the
  local relay and no reconnect lobby. If the host leaves, the room closes; a guest
  can reload the invite to rejoin while the host is still there.
- **LAN games are not recorded.** The family record and autosave cover solo and
  hot-seat only, and they live in this browser/device's `localStorage`.
- **Browser fallback relay.** In browser dev the host expects the relay on
  `:8080` (`npm run lan`). If that port is busy, start the relay elsewhere and open
  the host page with `?lanPort=PORT`; the built Tauri app starts its own relay.
- **Tauri shell only.** `src-tauri` is kept and configured, but this work did not
  run `cargo build` or `tauri build`; the central build produces the installers.
- **Promo is a manifest.** `video.json` supplies the eight EN/ZH lines and facts
  for the root studio. No separate Remotion project, 4K cut or vertical cut ships
  here.
- **Sound is synthesised.** Short WebAudio chimes only, no music; sound can be
  turned off and the app respects the system reduced-motion preference plus its
  own motion toggle.
- **Keyboard play is dense.** All 60 lines are buttons; Tab/Shift+Tab moves through
  them and Enter draws. Drawn lines stay focusable with `aria-disabled` so keyboard
  focus is not lost after a move, but it is a long tab path on a fresh board.
