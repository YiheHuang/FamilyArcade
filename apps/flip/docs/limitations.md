# Flip · known limitations (v0.1)

- **Two players only.** The engine, AI and seats are built around Black and White.
- **Hard is four plies, not perfect.** It is a strong family opponent, but a tournament
  engine or a deeper search can beat it.
- **No online matchmaking.** LAN rooms are local-subnet IPv4 only. Guests need the host
  firewall to allow the relay port.
- **No spectator or multi-guest mode.** A second guest gets “room full”.
- **No cloud saves or cross-device record.** The current game and family record live in
  this browser or desktop WebView.
- **Undo is local-only.** It is disabled after a finished game and in LAN games, where
  the host is authoritative.
- **No game clock, resignation or draw offer.** A game ends only when neither player
  can move.
- **The browser build needs the relay.** In the Tauri build the shared Rust relay starts
  inside the app; `npm run lan` provides the same protocol for browser testing.
- **Room codes keep honest family members out.** A four-digit code is not protection
  against a determined attacker on the same network.
- **No 4K or vertical promo cut.** The root studio renders the 45-second EN/ZH promo
  from `video.json`; this app does not ship a separate Remotion project.
- **The Tauri installer is unsigned.** Windows SmartScreen will warn on first launch.
