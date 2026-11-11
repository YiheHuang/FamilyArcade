# Color Chain · known limitations (v0.1)

- **Family variant, not tournament UNO.** There is no draw stacking, no Wild Draw Four
  challenge, no “last card” penalty and no optional scoring table. These choices are
  documented in [rules.md](rules.md#family-variant-choices).
- **The target score ends the match.** Play stops after the round in which any total
  reaches 100, 200 or 300 (default 200). The lowest total wins, so the player who goes out
  is not always the match winner. Tied lowest totals share the match.
- **LAN is local-subnet IPv4.** Guests need the host machine's firewall to allow the
  relay port. No cloud, matchmaking, accounts or spectators.
- **Guests cannot undo or change the next round.** The host is authoritative and controls
  the next deal. A disconnected guest seat is played by Normal AI; a late guest can take
  over an AI seat.
- **Hard is sampled, not perfect.** It evaluates short random playouts and can still lose.
  Companion is intentionally gentle toward a human with few cards.
- **Autosave and the family record are local.** They live in this browser/device's
  `localStorage`; there is no cloud sync.
- **No installer was built in this workspace.** The Tauri shell and NSIS configuration are
  kept working, but installers are built centrally by the Family Arcade main agent.
- **No 4K or vertical promo cut.** `video.json` is the source for the root studio; this
  app does not ship a separate Remotion project.
- **Screenshots are reproducible real captures.** Desktop states are produced by the real
  engine through `?demo=table|wild|final`; the screenshots are taken from the running app,
  not mocked up. The stats image seeds only the local record so the ledger has content.
- **Browser LAN port.** The default relay is `:8080`, matching the shared tooling. On a
  shared development machine an alternative port can be used with `?lanPort=8096`; the
  invite URL follows the selected port.
- **Room code is a family gate, not security.** Four digits stop a neighbour from joining
  the wrong table; they are not a defence against a determined attacker on the same LAN.
