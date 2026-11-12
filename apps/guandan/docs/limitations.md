# Guandan · known limitations (v0.1)

- **Automatic tribute returns.** The highest non-wild card is forced, and the
  winner’s return is chosen by a hand-aware policy: keep wildcards, level cards and
  jokers, and avoid breaking a pair. There is no manual “pick a return card”
  screen. The engine and the AI use the same policy, so the result is deterministic
  and never leaks another hand.
- **Win at A is a table choice.** A team already at A wins the match by winning a
  round; it does not have to wait for A to be the current level card after the other
  team has won a round. The round level is always the previous winner’s level.
- **First deal starts with South.** Seat 0 leads the first round. There is no draw
  for the lead, no kitty and no dealer rotation. This keeps hot-seat and LAN turns
  predictable.
- **Straight windows include 2.** A-2-3-4-5 and 2-3-4-5-6 are legal; J-Q-K-A-2 is
  not. Some family tables exclude 2 from all straights. The rule is documented and
  consistent across straights, pair chains and triple chains.
- **Same-suit straights have two readings.** When led, a same-suit straight is
  recorded as a straight flush. When it follows a straight, the engine may use the
  cheaper straight reading if that is enough to beat the table. This is deliberate:
  a player is not forced to spend a bomb to follow a straight.
- **Bombs can reach ten cards.** Eight natural cards plus two wildcards is the
  largest set bomb. The joker bomb is still the highest. A “bomb cap at eight”
  house rule is not implemented.
- **No optional Guandan house rules.** There is no “pass and re-enter”, no
  “must-beat with the same suit”, no “red heart level card exchange”, no “three
  bombs” special score and no “A must be played as the last card” rule. The app
  follows one consistent table.
- **No manual tribute choice for a human.** The summary shows exactly what moved
  and who leads, but the human cannot choose the returned card. This is the largest
  deliberate simplification.
- **Hot-seat privacy is a curtain, not a locked seat.** It relies on the family
  passing the device and not peeking. The hand stays hidden until “Show my hand” is
  pressed for the current seat.
- **LAN is local-subnet IPv4.** There is no internet matchmaking, relay service,
  spectator mode or cloud account. Guest phones need the host firewall to allow the
  app. The browser relay runs on the assigned port and is stopped after the LAN
  E2E.
- **Late LAN guests inherit an AI hand.** A guest who joins after the deal can take
  over an empty AI seat; the hand is not redealt. A guest cannot take over another
  human seat.
- **Host records LAN rounds only.** A guest device keeps its own local record and
  does not duplicate the host’s round. Clearing a record affects only that device.
- **Undo and hints are local.** They are disabled for LAN host and guest seats so no
  seat gets an information or take-back advantage. Undo is also disabled after a
  round has ended.
- **Autosave is for active rounds.** It stores the current round or tribute screen
  in `localStorage`. A completed round is written to the family record, but the
  result screen itself is not resumed after a reload.
- **Hard is strong, not perfect.** It uses hand decomposition, public card counting
  and a one-step lookahead. It does not sample hidden hands and can still lose,
  especially with a poor deal.
- **Browser QR may say localhost.** In Vite dev or a browser relay the invite can
  use `localhost`, which a phone cannot reach. Use the packaged desktop build or the
  host machine’s LAN address for a real phone.
- **No Tauri build was run here.** The shell, capabilities and relay wiring are kept
  unchanged; installer generation is centralised in the main repository build. The
  frontend is checked with TypeScript and Vite, and LAN is tested through the browser
  relay on port 19020.
- **Abrupt host crashes are best effort.** A normal leave sends a closed notice. If
  the host process disappears without one, the guest may sit on the waiting screen
  and should rejoin from the invite URL.
- **The 45-second promo is not stored here.** The root studio renders it from
  `video.json`; this app ships the manifest, real screenshots and docs.
- **No spectator or chat UI.** The shared relay supports messages, but this app
  keeps the table quiet and family-sized.
