# Hex · rule audit

The engine lives in `src/game/hex.ts`. It is pure TypeScript: no DOM, clock,
network, `localStorage` or `Math.random`. All 36 unit tests run with `npm test`;
`npm run check` also type-checks and builds the production bundle.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board is an 11×11 rhombus: 121 cells, all empty at the start. | `setup()` | “creates an 11×11 empty rhombus with Red to move” |
| R2 | Red always moves first. | `setup('R')` / `FIRST_PLAYER` | same |
| R3 | Players alternate placing exactly one stone. | `apply()` | “alternates turns and rejects an occupied cell” |
| R4 | A cell may only be played once. | `apply()` → `occupied` | same |
| R5 | Out-of-range, fractional and non-numeric cells are rejected. | `apply()` → `bad-cell` | “rejects non-integer and out-of-range cells” |
| R6 | Red wins by an unbroken chain from row 0 (north) to row 10 (south). | `winningPath(board, 'R')` | “Red wins by connecting north to south” |
| R7 | Blue wins by an unbroken chain from column 0 (west) to column 10 (east). | `winningPath(board, 'B')` | “Blue wins by connecting west to east” |
| R8 | Crossing the wrong axis is not a win. | `winningPath()` orientation check | “does not give Red a win for crossing west to east”, “does not give Blue a win for crossing north to south” |
| R9 | Corner and edge cells count as part of both adjacent edges. | `isStartCell()` / `isGoalCell()` | “detects a corner-to-corner connection” |
| R10 | The returned winning path is a real, adjacent, monochrome path. | `winningPath()` BFS | “returns a genuinely adjacent winning path in one colour” |
| R11 | A finished game rejects every further move. | `apply()` / `applySeat()` → `game-over` | “refuses moves after the game is over”, “rejects seat moves once the game is won” |
| R12 | Seat 0 is Red, seat 1 is Blue, and a seat may only move on its turn. | `applySeat()` | “enforces seats and turn order” |
| R13 | Each seat gets a copy of the public view, its own mark and `canMove`. | `view()` | “gives each seat a public view without sharing internals” |
| R14 | There is no draw state; a finished board always has one winner. | `GameState['status']` | “reports no winner while the board is still open” + structural invariant |
| R15 | Applying a move never mutates the previous state. | immutable `apply()` | “does not mutate the previous state” |
| R16 | The AI only returns legal moves and is deterministic with the injected RNG. | `chooseMove(state, level, rng)` | “always returns a legal move on every level”, “is deterministic with the same injected RNG” |
| R17 | Companion, Normal and Hard take an immediate win and block an immediate loss. | `findImmediateWin()` / `findImmediateBlock()` | “takes an immediate win on companion, normal and hard”, “blocks an immediate loss on companion, normal and hard” |
| R18 | Shortest-path potential treats own stones as free and empty cells as cost one. | `shortestDistance()` | four tests under “Hex shortest-path potential” |

## No draws

Hex is a connection game with a topological guarantee: on a completely filled
rhombus one of the two colours must connect its edges. The engine therefore has no
`'draw'` status and no draw scoring. A win can only be created by the player who just
placed a stone, so `apply()` checks only the mover’s colour.

## AI levels

| Level | Behaviour | Determinism |
| --- | --- | --- |
| Companion | Immediate win, immediate block, then a gentle choice from a shortlist; 28% of moves wander. | Injected RNG only |
| Easy | 70% random; otherwise a shallow centre/path choice. | Injected RNG only |
| Normal | Immediate win/block, shortest-path one-ply ranking, 10% random slip. | Injected RNG only |
| Hard | Immediate win/block, 20–24 candidate moves, 26–46 random playouts each with union-find win detection, shortest-path tie-break. | Injected RNG only |

The UI supplies `Math.random` like every other Family Arcade game; the unit tests inject
a seeded generator. No engine or AI code reads the clock, DOM or network.

## Scores

There is no score. Each finished local game appends a result to the family record in
`localStorage`: total games, Red wins, Blue wins, current same-winner streak, last
winner and the last 12 results with timestamps. LAN games are not written to the
local record, because both devices would otherwise count the same result.

## LAN

The host owns the authoritative `GameState`. The guest receives
`view(state, 1)` (public board, turn, status, winner, winning path, last move) and may
send only `{ type: 'place', index }`. `applySeat` re-checks the seat, turn, cell and
game status on the host. A stale or spoofed intent is ignored. The relay is a dumb
message bus; no guest can mutate a host board directly.

## Deliberate scope

- Fixed 11×11 board.
- No swap/pie rule; Red has the usual first-player advantage.
- Two players only; no spectators.
- Stones never move and are never captured.
