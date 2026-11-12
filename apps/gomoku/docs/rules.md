# Gomoku · rule audit

The engine is `src/game/gomoku.ts`. It is pure: no DOM, network, clock or
`Math.random`. The board is a flat row-major array of 225 cells; Black (`B`)
moves first and White (`W`) replies. The UI only renders a view returned by the
engine.

## Rules

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board is 15×15 = 225 points and starts empty. | `setup()` | “creates a 15×15 empty board with Black to move” |
| R2 | Black moves first. | `setup('B')` | same |
| R3 | Players alternate Black and White. | `apply()` | “alternates Black and White and records moves” |
| R4 | A stone can only be placed on an empty point. | `apply()` `occupied` | “rejects occupied points, out-of-range points and fractional points” |
| R5 | Points outside 0–224 and fractional indices are rejected. | `apply()` `bad-cell` | same |
| R6 | Any empty point may be played; there is no centre-only opening. | `apply()` | “accepts any empty opening point, not only the centre” |
| R7 | Five or more contiguous stones horizontally win. | `lineThrough()` | “detects a horizontal five” |
| R8 | Five or more contiguous stones vertically win. | `lineThrough()` | “detects a vertical five” |
| R9 | Five or more contiguous stones diagonally win in both directions. | `lineThrough()` | “detects a diagonal down-right five”, “detects a diagonal down-left five” |
| R10 | A line may touch the board edge. | `lineThrough()` | “detects an edge horizontal five”, “detects an edge vertical five” |
| R11 | Freestyle overlines (six or more) count as a win. | `lineThrough()` | “counts an overline of six or more as a win in freestyle” |
| R12 | Four, a gap, or a row that wraps to the next row do not win. | `lineThrough()`, `winningLine()` | “does not win with four, a gap, or a non-contiguous row”, “does not wrap a row into the next row” |
| R13 | A gap may be filled to complete five. | `apply()` | “detects a five through a gap once the gap is filled” |
| R14 | A finished game refuses further moves. | `apply()` `game-over` | “ends the game and refuses every later move” |
| R15 | A full board with no five is a draw. | `apply()` | “declares a full board with no five a draw” |
| R16 | Seat 0 is Black and seat 1 is White. | `applySeat()` | “maps seats to Black and White” |
| R17 | A seat may only move on its own turn; other seats are rejected. | `applySeat()` `wrong-turn` / `bad-seat` | same |
| R18 | Each seat receives its own view with `mark`, `canMove`, `last` and copies of the board. | `view()` | “gives each seat its own public view and canMove flag”, “returns copies in views…” |
| R19 | Moves do not mutate the previous state or board. | `apply()` | “does not mutate the previous state or board” |
| R20 | Results are reported as Black, White or draw. | `resultText()` | “reports results for both colours and a running game” |

## AI contract

| Level | Behaviour |
| --- | --- |
| Companion | Takes an immediate win and blocks an immediate five, then prefers quiet moves near the stones. It deliberately avoids building fours/open fours unless needed. |
| Easy | Takes a win, often blocks a five, otherwise mixes random nearby points with a greedy score. |
| Normal | Takes wins and blocks, then runs a two-ply lookahead with a small chance of the second-best move. |
| Hard | Takes wins and blocks, then runs a six-ply threat-space search over nearby points. Its node budget is deterministic; it is strong but not a proof solver. |

All levels use `chooseMove(state, level, rng)` and always return a legal point or
`-1`. The tests cover immediate wins, immediate blocks, one-ended fours, legal
moves, centre opening, determinism with the same injected RNG, and tactical move
reading.

## Hint reasons

`src/ai/hint.ts` asks Hard for a move, then reads the board back to produce one of:
`win`, `block`, `openFour`, `four`, `openThree`, `center` or `balance`. The UI
localises every reason. Tests cover win, block, centre, open three, open four,
closed four and the finished-game null case.

## LAN authority

The host owns `GameState`. The guest gets `view(state, 1)` only and may send
`{type:'place', index, moveCount}`. The host verifies the seat, turn, point and
current move count before applying. A stale or spoofed intent is ignored. The
guest's screen has no restart button; only the host calls `setup()` for the next
round.

## Record

The family record counts games, Black wins, White wins, draws, current and best
same-winner runs, mode split and the eight most recent results. It is stored in
`localStorage` on the device that finished the game. A guest never writes the
host's record.
