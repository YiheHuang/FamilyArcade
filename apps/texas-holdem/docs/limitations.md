# Texas Hold'em · known limitations (v0.1)

- **Play money only.** Chips are a family score. There is no cashier, real-money
  mode, odds market, account, purchase, advertising or telemetry.
- **Fixed table economy in the UI.** Every table starts with 1,000 play chips and
  blinds of 10 / 20. The engine accepts other stacks, blinds and button positions,
  but the setup screen does not expose them.
- **No rebuy.** A seat that loses every chip is out. When one seat holds all the
  chips the table ends; start a new table to play again. In solo play a human bust
  ends the table for that seat even if AI seats still have chips.
- **No tournament clock or blind increases.** This is a single-table cash-style
  play-money session, not a tournament structure.
- **No ante, straddle, run-it-twice or insurance.** These are not part of the
  rule contract and are not offered.
- **No rabbit hunting.** Burn cards and unused deck cards are never shown.
- **Short all-in raises follow the standard no-reopen rule.** A player who has
  already acted can call the short raise but cannot re-raise.
- **Odd chips go to one seat.** The whole remainder goes to the first winning seat
  clockwise from the button. It is not split one chip per winner.
- **Four heuristic AI levels.** Companion, Easy, Normal and Hard use hand
  strength, pot odds, position, stack pressure and level-dependent bluffs. Equity
  is estimated from sampled unseen runouts, not a full game-theory solver. Hard
  is stronger but can still be exploited and can misread a table.
- **No opponent modelling beyond public information.** The AI does not track a
  human’s betting history across hands and never reads hidden cards. This is
  deliberate for family play and honesty.
- **Hints are advice, not an oracle.** Hints use the Hard policy and a fixed seed;
  they are legal and reasoned, but they can be wrong.
- **Undo is limited.** Undo is disabled at showdown and in LAN play. In solo it
  rewinds to the human’s previous decision, including AI replies.
- **LAN is same-subnet IPv4.** There is no online matchmaking, spectator mode,
  cloud record or NAT traversal. The host device owns the table; guests receive
  one per-seat view each.
- **LAN start needs at least one guest.** Empty seats are filled by AI, but the
  host cannot open a network table with no guest.
- **Disconnected guest seats fall back to AI.** The host keeps the table running;
  a reconnecting guest with the same browser token can reclaim the seat. If the
  host closes the room, the guests return to the lobby with an error.
- **LAN record is host-side only.** Guests do not write the host’s family record.
- **No spectator or shared-screen LAN view.** A guest sees only its own seat,
  public board, public stacks and public actions.
- **Mobile screenshots show the viewport.** The 390×844 phone layout scrolls to
  reach the bottom of the action panel on small screens; there is no horizontal
  overflow.
- **Browser invites can use `localhost`.** Use the host machine’s LAN address or
  the desktop build for a phone on another device.
- **Tauri installers are built centrally.** This app keeps the shared
  `family_arcade_lan_host` crate and `src-tauri` shell, but no cargo/Tauri build was
  run here.
- **The screenshots are real renders.** The table, showdown and table-over shots
  use deterministic, valid engine fixtures; the live flows are covered by the
  browser and LAN E2E tests.

See [`rules.md`](rules.md) for the complete rule audit and test mapping.
