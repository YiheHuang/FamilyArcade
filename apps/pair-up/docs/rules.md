# Pair Up · rule audit

Every rule is implemented in `src/game/pair-up.ts`, a pure engine with no DOM,
network, clock or `Math.random`. The shuffle and every AI decision take an injected
RNG. The UI is the only caller that passes `Math.random`; tests pass deterministic
sequences.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | A 4 × 4 deck has 16 cards (8 pairs) and a 6 × 6 deck has 36 (18 pairs). | `setup()` | “deals 8 pairs…” and “deals 18 pairs…” |
| R2 | The table seats 2–6 players; other counts are rejected. | `setup()` / `assertPlayers` | “rejects impossible sizes…” |
| R3 | The first seat starts; turns move clockwise. | `setup({first})`, `resolve()` | “honours the starting seat”, “rotates turns…” |
| R4 | A turn is two flips. The first flip does not change the turn. | `flip()` | “opens the first card without changing the turn” |
| R5 | A matching pair stays open, scores one point, and the same player flips again. | `flip()` match branch | “scores a matching pair…” |
| R6 | A miss stays visible in a `resolve` phase, then turns back and passes the turn. | `flip()`, `resolve()` | “puts a miss into resolve…”, “resolve closes a miss…” |
| R7 | A card cannot be flipped twice, a matched card cannot be flipped, and out-of-range tiles are rejected. | `flip()` errors | “rejects duplicates, matched cards…” |
| R8 | A finished game rejects every further flip. | `flip()` `game-over` | “plays a complete 4×4 game…” |
| R9 | The game ends when every pair is found. Most pairs wins. | `finish()` | “plays a complete 4×4 game…” |
| R10 | If two or more players tie for the top score, the win is shared. | `finish()` | “shares the win when the top score is tied” |
| R11 | The player who finds the last pair also ends the game immediately. | `finish()` | “finishes immediately after the last pair…” |
| R12 | Every reveal is public; the engine records who saw each card. | `reveals` | “records who saw every reveal…” |
| R13 | A seat may only flip on its own turn. | `flipForSeat()` | “enforces the seat on the wire path” |
| R14 | A seat view hides every face-down value and exposes only open/matched cards. | `view()` | “hides every face-down value…” |
| R15 | A seat view has its own `canFlip` and `myTurn`, never another seat's turn. | `view()` | “gives each seat its own canFlip…” |
| R16 | Each seat's view carries public scores, owners, flipped cards and pair count only. | `view()` | same tests |
| R17 | A state round-trips through JSON; malformed saves are rejected. | `serialize()`, `deserialize()` | “round-trips a full state…” |
| R18 | AI only returns legal, face-down tiles. | `chooseFlip()` | “only returns legal…”, “complete AI memory…” |
| R19 | Hard remembers every public reveal; Normal remembers its own reveals; Easy has a short unreliable memory. | `memoryOf()` | AI memory tests |
| R20 | Companion sometimes ignores what it knows when it is ahead. | `memoryOf()` | “Companion chooses to forget…” |
| R21 | Hints use public reveals and never point at a matched or face-up card. | `suggest()` | hint tests |
| R22 | A final view still carries the winner/ties and every score. | `view()` | finish tests |
| R23 | LAN sends a separate view to every guest and re-checks the seat on the host. | `flipForSeat()`, `App.tsx` | E2E + manual LAN check |
| R24 | Local/solo autosave stores the state, names and levels; undo restores a previous state. | `storage.ts`, `App.tsx` | E2E autosave/resume + undo |

## Scoring and ties

One point per matched pair. The player with the most pairs wins. A tie for the top
score is a shared win, shown as “A tie: P1 · P3”. There is no hidden tie-break.

## Turn order

The first seat is seat 0. On a miss the engine's `resolve()` advances to
`(turn + 1) % playerCount`. A match never advances the turn. After a match the same
seat chooses again until the board is empty.

## Hidden information

The board's `deck` array exists on the authoritative host and in local state. It is
never included in `SeatView`. Face-down tiles have `value: null`; matched or currently
flipped tiles expose their value. LAN guests receive `view(state, seat)`, never the
full state. The guest sends only `{ type: 'flip', index }`; the host calls
`flipForSeat()` again, so a spoofed turn is rejected.

## AI memory

- **Companion** remembers every public reveal but ignores memory 14% of the time, or
  42% when it leads by two or more pairs. This is the deliberate “give the children a
  chance” rule.
- **Easy** uses only the last six reveals, and only 30% of the time.
- **Normal** remembers reveals made by its own seat.
- **Hard** remembers every reveal by anyone.

All levels prefer unknown cards over known singletons, take a known pair when they
recall one, and choose among equally good options through the injected RNG.

## Local record and save

`familyarcade.pair-up.record` keeps games, solo/AI/hot-seat wins, ties, streak, best streak,
last winner and wins by name. `familyarcade.pair-up.save` keeps a local/solo game after
every action. Both are JSON in `localStorage`; nothing is sent anywhere.

## Verification

`src/game` tests: 35. E2E: full hot-seat game, record update, restart, undo, hint, AI
reply, autosave/resume, mobile flip. Screenshots come from the running app; see
`docs/screenshots`.
