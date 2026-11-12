# President · known limitations (v0.1)

- **3–6 players only.** The engine, table layout and LAN lobby are sized for three to
  six seats. Two-player President and seven-plus tables are not supported.
- **No jokers, no four-card sets.** The requested rules use singles, pairs and
  triples with equal-or-higher climbing. Quads are not legal.
- **No revolution, 2-clear or other house rules.** A 2 is simply the highest rank; it
  does not clear the trick. These variants were deliberately left out so a family can
  learn one consistent table.
- **Pass locks you out.** A player who passes cannot re-enter the current trick. Some
  groups allow re-entry; this app follows the lock-out version.
- **Automatic exchange.** The Scum's two best cards are fixed. The President returns
  the two lowest cards automatically instead of choosing any two. This keeps AI and
  LAN turns moving; a house rule may prefer a manual choice.
- **No overall point total.** Every round is ranked and recorded; the session does not
  add points or declare a match winner. Play as many rounds as the table wants.
- **The 3 of clubs starts only round one.** Later rounds start with the President. The
  app does not re-seat players around the table by rank; seats stay fixed so the LAN
  view and the family record remain stable.
- **LAN is local-subnet IPv4.** There is no internet matchmaking, relay service,
  spectator mode or cloud account. Guest phones need the host firewall to allow the
  app.
- **Host records LAN rounds only.** A guest device keeps its own local record and does
  not duplicate the host's round. Clearing a record affects only that device.
- **Late LAN guests inherit an AI hand.** A guest who joins after the deal can take
  over an empty AI seat; the hand is not redealt. A guest cannot take over another
  human seat.
- **Undo and hints are local.** They are disabled for LAN host and guest seats so no
  seat gets an information or take-back advantage.
- **Browser QR may say localhost.** In Vite dev or a browser relay the invite can use
  `localhost`, which a phone cannot reach. Use the Tauri build or the host machine's
  LAN IP for a real phone.
- **Hard is strong, not perfect.** It uses hand decomposition, public card counting
  and sampled rollouts. It can still lose, especially with a poor deal.
- **No Tauri build was run here.** The shell, capabilities and relay wiring are kept
  unchanged; installer generation is centralised in the main repository build. The
  frontend is checked with `tsc` and Vite, and LAN is tested through the browser relay.
- **Abrupt host crashes are best effort.** A normal leave sends a closed notice. If
  the host process disappears without one, the guest may sit on the waiting screen and
  should rejoin from the invite URL.
- **The 45-second promo is not stored here.** The root studio renders it from
  `video.json`; this app ships only the manifest, screenshots and docs.
