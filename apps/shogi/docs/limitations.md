# Shogi · known limitations (v0.1)

- **No tournament adjudication.** Impasse (`jishogi`) declaration and the 27-point rule
  are not implemented. Fourfold repetition is a draw; perpetual check is not separately
  punished.
- **No handicap or exchange games.** Both sides always start with the standard 20 pieces.
- **AI is a family opponent.** Hard searches three plies with material, king safety and
  drop-safety scoring. It is not a title-strength engine and it does not open a book.
- **No online matchmaking.** LAN rooms are IPv4 on the same subnet.
- **No spectator mode.** A second guest gets “room full”.
- **No cloud saves.** The current game and family record live in this browser/device.
- **A browser-hosted QR may use `localhost`.** For a phone on the Wi-Fi, open the host’s
  LAN address or use the desktop build.
- **No installer build in this pass.** The Tauri NSIS build is local and unsigned; the
  main agent builds installers centrally.
- **No 4K or vertical promo.** The shipped manifest drives the shared 45-second
  1920×1080 studio.
- **Room code is four digits.** It keeps honest family members out, not a determined
  attacker on the same LAN.
