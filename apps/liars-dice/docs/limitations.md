# Liar's Dice · known limitations

- **Family-table rules, not a casino rulebook.** Ones wild and spot-on are
  explicit table options. There is no separate “palifico” or ones-only round,
  no doubling on a bid of ones, and no per-face special bid ladder. The classic
  quantity/face ladder is the whole ladder.
- **Spot-on is optional and off by default.** When enabled, an exact call costs
  the previous bidder one die; a miss costs the caller one die. Different
  families play this differently; the rule screen and both READMEs state the
  version used here.
- **Seat 0 bids first.** A new game starts with seat 0 (the human, the first
  hot-seat player, or the LAN host). There is no random first-bidder draw.
  Subsequent rounds start with the previous loser, or the next living seat if
  that player is out.
- **Hard is heuristic, not a solver.** It uses a binomial probability model plus
  public bidding behaviour. It can still overbid, misread a trap or call a
  spot-on at the wrong moment. It never reads another seat's dice.
- **The AI cannot see the future.** It estimates from its own dice, public dice
  counts, the current bid and public bluff/challenge counters. It does not
  remember every past round's full bid sequence beyond the public counters.
- **LAN is local-subnet IPv4** through the shared relay. There is no online
  matchmaking, spectator view, chat, cloud save or reconnect across networks.
  The four-digit room code keeps honest family members out; it is not a security
  boundary against a determined attacker on the same LAN.
- **LAN records live on the host device.** The guest device does not write the
  family record. A guest that reloads reconnects its seat using the shared local
  token; a guest that joins after the deal can take over an empty AI seat, but a
  connected human seat is never replaced.
- **A disconnected guest seat is played by the AI** after a short pause, so the
  table does not freeze. The returning guest receives the current private view;
  the AI may already have acted for that seat.
- **Undo is deliberately limited.** It works only before a reveal and only
  within the current round. Once a challenge or spot-on lifts the cups, the
  information is public and undo is disabled. Hints and undo are disabled for
  LAN guests.
- **Autosave and the family record use `localStorage`.** There is no cloud,
  account or cross-device sync. Clearing browser data clears them.
- **The screenshots use deterministic engine fixtures.** Game, hint, reveal and
  game-over images come from valid `demoFixture()` states; the stats image uses
  a deterministic local family record. Live play, autosave, record, undo and
  privacy were verified by `node scripts/e2e.mjs` and the LAN test. No mockup
  images are used.
- **Browser QR invites can say `localhost`.** A phone cannot reach the host
  through `localhost`; use the host machine's LAN address or the desktop build.
  The invite URL already points at the relay port when the built app is served
  by the relay.
- **The Windows installer was not built in this workspace.** The central build
  agent runs Tauri/cargo. The Tauri shell and `family_arcade_lan_host` crate name
  are preserved; no Tauri or cargo command was run here.
- **Sound is synthesised in Web Audio.** There are no downloaded samples. Some
  browsers require a tap before the first sound; the app resumes the audio
  context on the first action.
- **Reduced motion is supported twice**: through the operating-system
  `prefers-reduced-motion` query and the table's own “Reduce motion” toggle.
  The toggle is stored locally.
- **Two to six players only.** There is no one-player solitaire variant and no
  more than six seats.

See [`rules.md`](rules.md) for the exact rule audit and the LAN protocol.
