# International Draughts · known limitations (v0.1)

- **Two players only.** Solo against the computer, two-player hot-seat and one
  LAN guest are supported. There are no teams or spectators.
- **No retrograde tablebase.** Hard searches four plies normally and six plies
  when eight or fewer pieces remain, with a three-capture quiescence search. It
  is strong for a family table but not a tournament engine. It can be beaten.
- **Family draw rules.** The 25-move king-only draw follows the standard
  international convention. Threefold repetition and the 500-ply ceiling are
  house additions so a browser game cannot run forever. There is no claim
  button and no tournament clock.
- **No move clock.** Games are untimed. The app does not implement the FMJD
  rapid or blitz time controls.
- **No opening book.** Every AI move is searched from the current position.
- **LAN is local-subnet IPv4.** There is no internet matchmaking, NAT traversal,
  account system or cloud relay. A guest joins the room code or QR link on the
  same network.
- **Host records the result.** A hosted LAN game is written to the host device's
  family record. The guest keeps its own separate local record; the two records
  are not synchronised.
- **Browser QR may use `localhost`.** For a phone on the same Wi-Fi, use the
  desktop/Tauri build or open the host machine's LAN IP. The browser relay is
  intended for development and same-machine testing.
- **Room code is four digits.** It keeps honest family members in the right
  room; it is not a security boundary against a determined attacker on the same
  LAN. The relay still validates the code and the host still validates every
  intent.
- **Sound is synthesised and best-effort.** Browsers may keep audio suspended
  until the first user gesture. There is no music track.
- **Desktop installer is unsigned.** The Tauri NSIS build may trigger Windows
  SmartScreen. No installer was built for this hand-off; the shared main build
  produces it centrally.
- **No 4K or vertical promo cut.** The 45-second promo is rendered from
  `video.json` by the root studio; this app ships the manifest, not a separate
  Remotion project.
- **No cloud, accounts, ads, telemetry or downloaded assets.** All art is CSS,
  SVG and system fonts.
