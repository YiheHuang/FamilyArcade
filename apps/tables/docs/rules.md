# Tables · rule audit

Every rule below has code, a unit test and an edge case. The engine lives in
`src/game/tables.ts` and is pure: no DOM, clock, network or `Math.random`. Dice are
passed in by the caller, which makes tests and AI reproducible.

**Test suite:** `tests/game.test.ts` — 31 tests, run with `npx vitest run`.
The last test plays a complete game from the standard opening to a 15-off finish.

## Board model

- 24 points indexed `0..23`. Point 0 is White's 1-point, point 23 is White's 24-point.
- White travels `23 → 0`, bears off below 0, and homes on points `0..5`.
- Black travels `0 → 23`, bears off above 23, and homes on points `18..23`.
- Checkers are stored signed: positive White, negative Black. Bar and off counts are
  separate. White opens by default.

## Rule table

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | Standard opening: 15 checkers each, 167 pips each. | `setup()` | “starts with the standard 15 checkers and 167 pips each” |
| R2 | Traditional opening point counts. | `setup()` | “sets up the traditional point counts” |
| R3 | Two dice; doubles expand to four moves. | `roll()` | “stores a normal roll and expands doubles to four moves” |
| R4 | Dice must be 1–6 and a player cannot roll twice. | `roll()` `bad-dice` / `wrong-phase` | “rejects bad dice and rolling twice” |
| R5 | White moves toward 0; Black moves toward 23. | `atomicMoves()` | “moves white toward point 0 and black toward point 23” |
| R6 | A source point must hold your own checker; landing must match the die. | `validateAtomic()` | “rejects a move from an empty point and a wrong landing point” |
| R7 | A point with two or more enemy checkers is blocked. | `validateAtomic()` `blocked` | “enforces points held by two or more enemy checkers” |
| R8 | Landing on one enemy checker hits it to the bar. | `applyRaw()` | “hits a blot and sends it to the bar” |
| R8b | A caller-supplied hit flag is ignored; the board decides. | `applyMove()` | “derives the hit flag from the board instead of trusting the intent” |
| R9 | While the bar is occupied, only bar-entry moves are legal. | `atomicMoves()` | “makes bar re-entry the only legal source” |
| R10 | White enters at 18–23; Black enters at 0–5. | `atomicMoves()` | “enters black from the bar in white’s home board” |
| R11 | A move reduces the mover's pip count by the die used. | `pipCount()` | “updates the pip count by the die actually used” |
| R12 | Moves are recorded with side, turn and hit flag. | `applyRaw()` | “records moves in the log with the turn number” |
| R13 | Bear-off requires all 15 checkers home and an empty bar. | `allHome()` `canBearOff()` | “refuses to bear off while a checker is outside home” |
| R14 | An exact die bears off; 15 off finishes the game. | `applyMove()` | “bears off with an exact die and finishes at 15 off” |
| R15 | An overroll may only remove the furthest occupied home checker. | `canBearOff()` | “allows an overroll only from the furthest occupied home point” |
| R16 | A checker on the bar cannot bear off directly. | `validateAtomic()` | “never allows bearing off directly from the bar” |
| R17 | Finished games reject rolls, moves and seat intents. | `roll()` `applyMove()` `applySeat()` | “rejects any action after the game is finished” |
| R18 | Doubles can play four consecutive moves, then pass the turn. | `legalSequences()` `applyMove()` | “plays all four doubles moves and then hands over the turn” |
| R19 | If only one die can be played, the higher die must be used. | `legalSequences()` | “forces the higher die when only one die can be played” |
| R20 | A turn cannot end while a legal move exists. | `endTurn()` `must-move` | “refuses to end a turn while a legal move remains” |
| R21 | A roll with no legal entry passes automatically once the player ends the turn. | `endTurn()` | “passes automatically when a roll has no legal entry” |
| R22 | Seat 1 cannot move on White's turn; seat 0 can. | `applySeat()` `wrong-turn` | “does not let a player move out of turn” |
| R23 | Per-seat views expose the correct side and roll/move flags. | `view()` | “exposes the correct roll and move flags per seat” |
| R24 | Legal sequences are complete and finish on the other side's turn. | `legalSequences()` | “generates only complete, legal sequences” |
| R25 | Every AI level returns a legal complete turn. | `chooseTurn()` | “returns a legal turn at every level” |
| R26 | The same state + level + RNG produces the same turn. | `chooseTurn()` | “is deterministic with the same injected RNG” |
| R27 | Hard takes an immediate winning bear-off. | `chooseTurn()` | “takes a winning bear-off at Hard” |
| R28 | Companion avoids a hit when a gentle turn exists. | `chooseTurn()` | “lets Companion avoid a hit when a gentle turn exists” |
| R29 | A hint returns a playable first move and a reason code. | `hint()` | “hints with a reason and a playable first move” |
| R30 | A complete standard game can be played to 15 off. | all of the above | “plays a complete deterministic game to a finish” |

## Turn length rule

`legalSequences()` enumerates all complete turns for the dice on the table, then keeps
only sequences that use the maximum number of dice. If the maximum is one, only the
highest die is kept. `applyMove()` rejects a geometrically legal move that is not a
prefix of an optimal turn (`suboptimal`). When the last die is used, or when no legal
continuation exists, the turn passes automatically.

## Hitting and the bar

A blot is a single checker. Landing on it sets the point to zero, increments the victim's
bar, and places the mover's checker. `atomicMoves()` will not offer a point with two or
more enemy checkers. Bar entry is generated from the bar only, so no other checker can
move until the bar is empty.

## Bearing off

`allHome()` checks the bar and every point outside `0..5` (White) or `18..23` (Black).
An exact die is always accepted. A larger die is accepted only when there is no own
checker further from the off tray. The 15th checker sets `status: 'finished'` and the
winner; no further roll or move is accepted.

## Scores and record

There is **no score multiplier**: no doubling cube, no gammon/backgammon bonus and no
match play. The first side to bear off all 15 checkers wins one game. The local family
record stores games, White wins, Black wins, current streak and the eight most recent
results in `localStorage`.

## LAN

The host owns the state. The guest receives `view(state, 1)` and may send only
`{type:'roll'}`, `{type:'move', move}` or `{type:'pass'}`. The host re-checks the phase,
the seat and the turn with `applySeat`/`endTurn`; stale or spoofed intents are rejected.
Backgammon has no hidden information, so the seat view contains the full public position
plus the guest's `canRoll` / `canMove` flags.

