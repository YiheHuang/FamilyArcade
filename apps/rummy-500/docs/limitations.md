# Rummy 500 · known limitations (v0.1)

- **One 52-card deck, no jokers.** Many published Rummy 500 descriptions add two
  jokers as wild cards. This table uses the joker-free version, documented in the
  rules screen and in `docs/rules.md`.
- **Discard pile takes are literal.** You take the chosen discard and every card
  above it, and the chosen card must be melded that turn. The engine does not allow
  taking a buried card and discarding it later.
- **No stock reshuffle.** When the stock is empty and a player wants to draw, the
  hand ends and scores are counted. Some tables reshuffle the discard pile; this
  implementation follows the standard “hand ends when the stock runs out” rule.
- **Going out does not require a final discard.** A player may go out by melding or
  laying off the last card, or by discarding it. The stricter “boathouse” rule is
  not used.
- **One ambiguous full-run case.** If all thirteen cards of a suit are laid down as
  one new meld, the ace is read low and scores 1. Lay-off placement preserves an
  existing high ace, so extending `2…K` with an ace keeps it high (15). This is
  documented rather than offering a placement chooser.
- **Hard is heuristic, not perfect.** It values immediate points, hand potential,
  discard safety and the must-meld obligation. It does not enumerate every future
  draw or opponent hand.
- **LAN is local-subnet only.** Rooms use the shared relay on the same network.
  There is no matchmaking, cloud, spectator mode or internet play.
- **A disconnected LAN seat stops the table.** The host does not play for a missing
  guest. The guest can reload the invite and reclaim the same seat; if they do not
  return, start a new table.
- **Browser QR may say localhost.** In Vite dev the invite can use `localhost`, which
  a phone cannot reach. Use the desktop build or open the host machine’s LAN IP.
- **LAN stats are host-only.** A LAN game is recorded on the host device. The guest
  device keeps its own local record and does not duplicate the result.
- **Hot-seat privacy is a UI boundary.** Each turn hides the previous hand and asks
  the next player to reveal theirs, but the shared device’s browser memory still
  contains the full state. This is family-table privacy, not a security boundary.
- **Autosave is local to this browser/device.** Clearing site data removes the save
  and the record.
- **No cloud, accounts, ads, telemetry or remote assets.** Fonts are system stacks;
  all cards and table art are CSS/SVG.
- **No installer was built in this workspace.** The Tauri shell and LAN relay wiring
  are kept, but `cargo build`/`tauri build` are run centrally by the main agent.
- **No 4K or vertical promo cut.** The manifest is ready for the shared studio.
