# Hex · known limitations (v0.1)

- **Fixed 11×11 board.** The classic rhombus is the only size. The engine constants
  and the board geometry are built around eleven rows and columns.
- **No swap/pie rule.** Red moves first and keeps the usual first-player advantage.
  This is a deliberate scope choice, not an oversight; family games tend to prefer a
  simple opening.
- **Two players only.** Solo, hot-seat and one LAN guest. A second guest receives
  “room full”; there is no spectator or replay mode.
- **Hard is strong, not proven perfect.** It combines shortest-path evaluation with
  Monte Carlo playouts and union-find win detection. It can still lose to a good
  human and can take a moment on an empty or very open board.
- **Companion is intentionally gentle.** It always takes an immediate win and blocks
  an immediate loss, but beyond that it chooses from a shortlist and sometimes
  wanders. It is a family opponent, not a tutor.
- **No draws.** This is a rule, not a missing feature: a filled Hex board must contain
  a connection for one colour.
- **LAN is local-subnet IPv4.** The guest needs the host firewall to allow the relay
  port. The relay is a dumb message bus with a 4-digit room code; it keeps honest
  family members apart, not a determined attacker on the same Wi-Fi.
- **Guest controls are limited.** The host is authoritative, so the guest cannot undo,
  ask for a hint, restart or choose a side. The host can undo and restart; the guest
  receives the new view.
- **Browser LAN needs the relay.** `npm run lan` serves a production build on :8080.
  The dev page on :5199 talks to that relay. If the port is busy, build with
  `VITE_LAN_PORT` and start the relay on the same port (see README).
- **Saves and records are local.** `localStorage` only; no cloud, account or
  cross-device sync. Clearing site data clears the family record.
- **The installer is unsigned and was not built by this game agent.** The shared Tauri
  shell and native relay are intact; the main Family Arcade build job produces installers.
- **No 4K or vertical promo cut.** The root studio renders the 45-second promo from
  `video.json`.
- **System fonts only.** The screenshots were captured on Windows with Segoe UI,
  Palatino/Iowan fallbacks and Microsoft YaHei; other platforms may substitute
  visually similar fonts.
