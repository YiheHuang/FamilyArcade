# Tables · known limitations (v0.1)

## Rules deliberately left out

- **No doubling cube.** The APP_BRIEF asks for backgammon without the cube; there is no
  offer, accept, resign or cube value.
- **No gammon or backgammon multipliers.** A finished game is one win, even if the loser
  has not borne off a checker. There is no match score or Crawford rule.
- **No opening-roll ceremony.** Ivory always opens. Real backgammon rolls one die per
  player to decide the first mover; that extra step is omitted.
- **No optional rules.** No Jacoby rule, beavers, chouettes, automatic doubles or
  legal-move adjudication beyond the engine's own optimal-turn filter.

## Product scope

- **Two players only.** Solo versus the AI, hot-seat, or one host + one LAN guest.
  There is no three/four-player table, spectator seat or tournament bracket.
- **No online matchmaking or cloud saves.** LAN rooms are local-subnet IPv4 only; the
  family record and autosave live in this browser/WebView.
- **One autosave slot.** Starting a new game clears the previous unfinished save
  (finished games clear it automatically).
- **No reconnect UI mid-game.** The shared relay supports room state, but this app does
  not offer a “rejoin my seat” flow after a guest closes the page.
- **Undo is one step for the LAN host, none for the guest.** The host is authoritative
  and broadcasts the restored view; the guest cannot force a rollback.
- **Browser v0.1 + local Tauri shell.** The Tauri NSIS installer is built centrally and
  is unsigned, so Windows SmartScreen may warn.

## AI honesty

- **Companion** is intentionally gentle: it avoids hits whenever a non-hit turn exists.
  It can therefore miss a strategically strong hit.
- **Easy** picks a random legal complete turn. It can be comically bad.
- **Normal** uses a one-turn static evaluation: pips, off/bar counts, blots and made home
  points. It does not search a full game tree.
- **Hard** ranks the top candidate turns and samples five opponent rolls for each. It is
  a strong family opponent, **not** a world-class backgammon engine and not a substitute
  for a tutor.
- The hint uses the Hard evaluation with no hidden information. It explains the *kind*
  of move (hit, enter, bear off, make a point, safe) rather than giving a numeric score.

## Interface and assets

- No 4K or vertical promo cut; the root studio renders the 45-second 1080p manifest.
- No third-party art, fonts, audio samples or CDN requests. Dice, checkers, board and
  icons are CSS.
- Sound is a small Web Audio chime and can be turned off; there is no music.
- The board is always shown from White's side (Ivory at the bottom right). There is no
  board-flip setting.
- LAN is IPv4 on the same subnet; the host firewall must allow the app/port. A 4-digit
  room code keeps honest family members out, not a determined attacker on the LAN.

## Test boundary

`npm run check` runs TypeScript, 31 engine/AI tests and a production build. The Playwright
E2E exercises the real UI: roll, hint, move, undo, near-win finish, record, AI reply,
autosave/resume and mobile layout. LAN is verified manually with the shared relay, not in
CI. Tauri compilation is intentionally left to the central release job.

