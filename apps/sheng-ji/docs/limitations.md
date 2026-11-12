# Sheng Ji · known limitations (v0.1)

This is an honest list of the family-table rules and engineering choices in this
build. The full rule audit is in [`rules.md`](rules.md).

## Rules

- **Four players only.** The engine, table layout and LAN seats are fixed at four.
  There is no two-player duel, three-player cut or six-seat table.
- **100-point duplicate table.** Two decks are used for pairs and tractors, but each
  point-card face scores once per deal; the duplicate deck copy is blank (it shows a
  small `0`). This keeps the classic 100-point table required by the brief. A club or
  tournament game with a 200-point two-deck table and 80/120/160 thresholds is not
  implemented.
- **Throw rule is a family rule.** Throws are led in one plain suit only; trump
  throws are not allowed. Components are read longest-tractor-first. Every component
  must be the current highest of its kind, and a legal throw can only be beaten by a
  matching trump ruff. Followers must match the card count and as many pairs as they
  can; exact tractor shape is not forced on the defence. Some families use a
  different “lowest component is forced” penalty or allow trump throws.
- **Declaration is one quick window.** A single, pair or no-trump declaration may be
  overcalled only by a strictly stronger declaration. There are no repeated counter
  bids, no “robbing the bottom” and no declaration after play starts. The deal is
  declared fresh each hand; a team that holds the declarers under 80 does not
  automatically become the next declarer.
- **No bottom-point doubling.** Buried point cards simply leave the deal; they do not
  double or otherwise score for either side. Burying points also lowers the number
  available to reach the fixed 80 target, so it can make an upgrade impossible.
- **No tribute or exchange.** Every deal is dealt fresh; there is no winner’s
  tribute, no card exchange and no “anti-tribute”.
- **Levels never fall.** A failed deal at A does not demote the team. Reaching A by
  an upgrade does not win the match; the team must make one more deal at A.
- **Deal length varies.** Throws can consume several cards in one trick, so a deal
  can finish in fewer than 25 tricks. All 100 non-buried cards are still played.
- **No “last trick” bottom bonus.** The final trick scores only its own point cards.

## AI

- **Hard is a strong heuristic, not a solved opponent.** It tracks the 80-point line,
  voids, trump economy, partner cover and throw safety, but it does not perform a
  full Monte Carlo search. Its valuation uses public information only; throw
  legality is the one engine rule that checks the whole table.
- **Companion is deliberately gentle.** It may pass a declaration or keep a low card
  where Hard would take control, especially around the human seat.
- **Easy makes mistakes.** It can choose a legal but poor play, and its declaration
  threshold is intentionally loose.

## LAN

- **Same-subnet IPv4.** The shared relay is intended for a home network. Phones need
  the host firewall to allow the app/relay port.
- **Browser hosting needs the relay.** In the browser build, start the shared relay
  (`npm run lan`) or use the desktop app, which starts the same relay internally.
- **The host is authoritative.** Guests receive only their own `SeatView`; the host
  never broadcasts other hands. A guest cannot spoof a seat or a stale turn because
  intents carry the state `version` and are re-validated on the host.
- **Undo and hints pause in LAN play.** The host keeps the record. A guest who
  reloads reconnects to the same seat by client token and receives the current view.
- **Dropped guest seats are covered by the AI.** The table does not freeze; the host
  waits briefly, then plays a legal low card for the vacant seat.
- **No spectator mode.** A fifth connection is rejected as room-full.

## Presentation and build

- **Screenshots are real browser captures.** Desktop 1440×1000 and mobile
  780×1688 (390×844 at 2×) come from the running app. They are not mockups.
- **The Tauri shell is preserved but not built here.** The central build agent runs
  the installer. The app never invokes Cargo or Tauri during `npm run check`.
- **No remote assets.** No CDN, remote fonts, downloaded art or third-party audio.
  The card faces, felt, QR invite and sounds are generated locally.
- **Sound is optional.** Browsers may block audio until the first user gesture; the
  sound toggle and all visual feedback still work.
- **Reduced motion is respected** through `prefers-reduced-motion`; the game does not
  depend on animations to communicate a turn.
- **Record is local.** The family record lives in `localStorage`; there is no account,
  telemetry, cloud sync or ads.
- **Promo is manifest-only.** `video.json` is consumed by the central studio; this app
  does not ship a Remotion project or media files.
