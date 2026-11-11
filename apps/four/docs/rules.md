# Four · rule audit

Every rule has code, a test and an edge case. The engine lives in
`src/game/four.ts` and has no DOM, clock, network or `Math.random` dependency.
There are **35 unit tests** in `tests/game.test.ts` (21 engine tests and 14 AI
tests). The board is a 42-cell row-major array (row 0 is the top, row 5 the
bottom); a move is a column number 0–6.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board is 7 × 6 = 42 empty slots at the start. | `setup()` | “starts with 42 empty slots and red to move” |
| R2 | Red moves first; a yellow opening is also supported. | `setup(first)` | same + “honours a yellow opening when asked” |
| R3 | A disc falls to the lowest empty slot in its column. | `dropRow()`, `apply()` | “drops a disc to the lowest slot in a column” |
| R4 | Discs stack and column height is tracked. | `columnHeight()` | “stacks discs and reports column height” |
| R5 | Players alternate red and yellow. | `apply()` | “alternates red and yellow” |
| R6 | Only integer columns 0–6 are accepted. | `apply()` `bad-column` | “rejects columns outside 0–6 and non-integers” |
| R7 | A full column rejects a drop and leaves state unchanged. | `apply()` `full-column` | “rejects a full column without changing state” |
| R8 | Four horizontally wins. | `lineThrough()` | “detects a horizontal four” |
| R9 | Four vertically wins. | `lineThrough()` | “detects a vertical four” |
| R10 | Four on the down-right diagonal wins. | `lineThrough()` | “detects a diagonal four going down-right” |
| R11 | Four on the up-right diagonal wins. | `lineThrough()` | “detects a diagonal four going up-right” |
| R12 | Yellow wins are attributed to yellow. | `apply()` | “detects a yellow win and sets the winner correctly” |
| R13 | A gap breaks a line; it is not a win. | `winningLine()`, `lineThrough()` | “does not report a line when a gap breaks it” |
| R14 | The winning line contains exactly the four connected cells. | `lineThrough()` | “finds a four through the last drop and only that line” |
| R15 | A finished game rejects further moves. | `apply()` `game-over` | “ends the game on a win and refuses more moves” |
| R16 | A full board with no four is a draw. | `apply()` | “fills the board to a draw with no four” |
| R17 | Draw positions have no winner and no line. | `winningLine()` | same |
| R18 | Row/column helpers round-trip every index. | `indexAt()`, `rowOf()`, `colOf()` | “maps row and column helpers consistently” |
| R19 | Seat 0 is red and seat 1 is yellow. | `applySeat()` | “limits a seat to its own disc” |
| R20 | A seat may only move on its own turn. | `applySeat()` `wrong-turn` | same |
| R21 | Each seat gets a view with its own disc and `canMove`. | `view()` | “gives each seat its own view and canMove flag” |
| R22 | Views copy the board and never alias engine state. | `view()` | same |
| R23 | Replay is exactly equal to successive `apply()` calls. | `replay()` | “replays a sequence exactly like successive applies” |
| R24 | Every move in a full draw replayed inside 0–6. | `replay()` | “keeps every move in the replay inside the board” |
| R25 | Every AI level returns a legal column or −1. | `chooseMove()` | “returns a legal column for every level”, “returns -1 when the game is over” |
| R26 | Normal and Hard take an immediate win. | `chooseMove()` | “takes an immediate win on normal and hard” |
| R27 | Companion takes an immediate win when its RNG agrees. | `chooseMove()` | “takes a win on companion when the RNG agrees” |
| R28 | Companion can decline a non-central win, leaving a chance for a child. | `chooseMove()` | “declines a non-central win on companion when the RNG says so” |
| R29 | Normal and Hard block an immediate loss. | `chooseMove()` | “blocks an immediate loss on normal and hard” |
| R30 | Companion blocks most immediate losses but sometimes lets one through. | `chooseMove()` | “blocks an immediate loss on companion most of the time” |
| R31 | Easy is random but deterministic with the same injected RNG. | `chooseMove()` | “easy is random but deterministic with an injected RNG” |
| R32 | Normal and Hard repeat the same move with the same RNG. | `chooseMove()` | “normal and hard repeat the same move with the same RNG” |
| R33 | Hard and Normal prefer the centre on an empty board. | `chooseMove()` | “hard prefers the centre on an empty board” |
| R34 | Hints explain a win, a block or a building move. | `hintMove()` | three hint tests |
| R35 | Hints never suggest an illegal column. | `hintMove()` | “never suggests an illegal column” |

## AI levels

| Level | Behaviour |
| --- | --- |
| Companion | Takes a win only sometimes; blocks an immediate loss 70% of the time; otherwise plays the centre-first gentle move. The injected RNG makes every choice reproducible. |
| Easy | Uniform random choice among legal columns. |
| Normal | Two plies: own drop plus the opponent's best reply, scored with the same window evaluation. |
| Hard | Five plies of alpha-beta search with centre-first move ordering, immediate win/block shortcuts and a window heuristic (three-with-a-gap is valuable, centre control is a small bonus). It is strong, not a solved-game oracle. |

No level uses `Math.random` inside the engine. `chooseMove(state, level, rng)`
defaults to `Math.random` only when the UI calls it without a stub; every test
injects a deterministic RNG.

## Record and saves

Finished local games (vs AI or hot-seat) update the family record:
games, red wins, yellow wins, draws, current win streak and the last eight
results. The record and the current autosave live in `localStorage` under
`familyarcade.four.record` and `familyarcade.four.save`. LAN games are not added to the
family record on either device; only finished AI/hot-seat games are counted.

## LAN

The host owns `GameState`. Seat 0 (host) is red, seat 1 (guest) is yellow.
After every accepted drop the host sends `view(state, 1)` to the guest. The
guest may send only `{ type: 'place', column }`; the host calls
`applySeat(state, seat, column)`, which re-checks the turn, the column range,
the column capacity and the game status. A stale or spoofed intent is rejected
without changing the board. The guest views are perfect-information (Connect
Four has no hidden state), but they are still per-seat so `canMove` and the
seat's disc are correct.
