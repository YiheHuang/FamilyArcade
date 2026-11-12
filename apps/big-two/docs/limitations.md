# Big Two · known limitations (v0.1)

- **Exactly four players.** The engine, table layout, LAN lobby and scoring are
  built for four seats. There is no two- or three-player Big Two variant.
- **No jokers.** The deck is the standard 52 cards. Joker Big Two, deuces wild
  and other house variants are not supported.
- **No wheel straight.** Ace is high in a straight (10-J-Q-K-A). A-2-3-4-5 is not
  a straight, and the 2 never appears in a straight. This keeps the rank order and
  the five-card table consistent for every player.
- **Five-card hands compare across categories.** The brief specifies the order
  straight < flush < full house < four plus one < straight flush, so a flush can
  beat a straight. Some family tables require the same five-card type to follow;
  this app follows the published hierarchy instead.
- **The game ends at the first empty hand.** There is no “play out for second and
  third place” phase. All remaining hands are counted for scoring, so the result
  still shows every seat's cards and penalty.
- **No cumulative match score.** Each deal produces a winner, a gain and three
  penalties; the local record stores those results. The app does not carry a
  running score across deals or declare a match winner.
- **Undo and hints are local only.** They are available in solo and hot-seat, and
  disabled in LAN host and guest seats so no seat gets an information or take-back
  advantage.
- **LAN is local-subnet IPv4.** There is no internet matchmaking, cloud relay,
  spectator mode or account system. Phones must be on the same network and the
  host firewall must allow the app.
- **The host fills empty LAN seats with the computer.** One connected guest is
  enough to start; the other empty chairs are played by the AI. A guest arriving
  after the deal can take over an empty AI seat, but never a human seat.
- **A browser QR may use localhost.** In Vite dev or a browser relay the invite can
  use `localhost`, which a phone cannot reach. Use the desktop build or open the
  host machine's LAN address for a real phone.
- **LAN records live on the host.** A guest device does not duplicate the host's
  game in its own family record. Clearing a record affects only that device.
- **Hard is strong, not perfect.** It uses hand decomposition, public card counts,
  suit control and endgame pressure, but it is a heuristic opponent and can lose,
  especially with a poor deal. It never reads hidden cards.
- **Autosave is local.** The current solo/hot-seat game and family record live in
  this browser/device. There is no cloud save or cross-device sync.
- **No Tauri build was run here.** The shell, capabilities and shared LAN bridge
  are kept unchanged; installer generation is centralised in the repository
  build. The frontend is checked with `tsc` and Vite, and LAN is tested through the
  browser relay on `LAN_PORT=19022`.
- **Abrupt host crashes are best effort.** A normal leave sends a closed notice. If
  the host process disappears without one, the guest may sit on the waiting screen
  and should rejoin from the invite URL.
- **The 45-second promo is not stored here.** The root studio renders it from
  `video.json`; this app ships the manifest, screenshots and docs.
- **Sound is synthesised in the browser.** There is no music track and no remote
  audio asset. The toggle is remembered on the device.
