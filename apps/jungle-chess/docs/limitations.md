# Jungle Chess · known limitations (v0.1)

- **Two players only.** The engine, seats and LAN room are built for Red and Blue.
- **No online matchmaking.** LAN rooms are local-network IPv4 only. A guest needs the
  host's address or QR code on the same network.
- **No spectator mode.** A third connection is rejected as “room full”.
- **No cloud saves.** The current game and family record live in this browser/device.
  A LAN result is recorded on the host, not duplicated on the guest.
- **No threefold-repetition rule.** Dou Shou Qi has no single official rule set; this
  family version uses stalemate and a 120-ply (60 full-move) no-capture draw instead.
  The draw rules are stated in the app and in `docs/rules.md`.
- **Hard is honest, not perfect.** It searches three plies, extending to four when eight
  or fewer animals remain. It is a strong family opponent, not a solved-game engine.
- **Water capture variant.** A rat in water can only capture another rat in water. It
  cannot capture an elephant or a land animal from the water. This common variant is
  listed in `docs/rules.md`.
- **No installer was built here.** The shared Tauri shell, capabilities and LAN relay
  wiring are kept and type-checked, but this app agent did not run `cargo build` or
  `tauri build`; installers are produced centrally.
- **Browser QR caveat.** A browser-hosted invite may use `localhost`. For a phone on the
  same Wi-Fi, use the desktop build or open the host machine's LAN address.
- **No 4K or vertical promo.** `video.json` supplies the 45-second bilingual manifest;
  the root Remotion studio renders the actual video.
- **Room code is four digits.** It keeps a family room separate, not a determined
  attacker on the same network.
