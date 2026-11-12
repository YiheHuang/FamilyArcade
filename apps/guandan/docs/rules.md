# Guandan · rule audit

Every rule has code, a test and an edge case. The engine lives in `src/game/guandan.ts`
and has no DOM, clock, network or `Math.random` dependency.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board has nine cells and starts empty. | `setup()` | “has nine empty cells and X starts” |
| R2 | X moves first. | `setup('X')` | “alternates turns and rejects occupied cells” |
| R3 | Players alternate X and O. | `apply()` | same |
| R4 | A cell can only be played once. | `apply()` `occupied` | same |
| R5 | A move outside 0–8 is rejected. | `apply()` `bad-cell` | same |
| R6 | Three marks in a row, column or diagonal win. | `winningLine()` | “detects rows, columns and diagonals” |
| R7 | A finished game rejects further moves. | `apply()` `game-over` | “ends on a win and refuses more moves” |
| R8 | A full board with no line is a draw. | `apply()` | “ends in a draw when the board fills” |
| R9 | Seat 0 is X and seat 1 is O. | `applySeat()` | “enforces the seat mark” |
| R10 | A seat may only move on its own turn. | `applySeat()` `wrong-turn` | same |
| R11 | Each seat gets a view with only its own mark and `canMove`. | `view()` | “gives each seat its own public view” |
| R12 | The AI only returns legal moves. | `chooseMove()` | “only returns legal moves” |
| R13 | Hard and Companion take an immediate win and block an immediate loss. | `chooseMove()` | AI tests |
| R14 | The same board and level produce the same move with the same injected RNG. | `chooseMove(state, level, rng)` | deterministic by construction |

## Scores

No score: the first line wins. The family record stores games, X wins, O wins, draws and
the current win streak in `localStorage`.

## LAN

The host owns the state. The guest receives `view(state, 1)` and may send only
`{type:'place', index}`. `applySeat` re-checks the turn, the cell and the game status on
the host; a stale or spoofed intent is rejected.
