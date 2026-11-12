# Jungle Chess · rule audit

Dou Shou Qi on a 7 × 9 board. The engine lives in `src/game/jungle-chess.ts` and uses
no DOM, network, clock or randomness. Every row below names the implementation point
and the matching test in `tests/game.test.ts`.

## Board and setup

- Row 0 is Blue's back row; row 8 is Red's back row.
- Column 3 is the centre land column between the two rivers.
- Dens: `(0,3)` for Blue and `(8,3)` for Red.
- Traps: `(0,2)`, `(0,4)`, `(1,3)` for Blue; `(8,2)`, `(8,4)`, `(7,3)` for Red.
- Rivers: rows 3–5, columns 1–2 and 4–5.
- Starting layout (rotationally symmetric, one of each animal per side):

| Row | Squares |
| --- | --- |
| 0 | Lion c0, trap c2, den c3, trap c4, Tiger c6 |
| 1 | Dog c1, trap c3, Cat c5 |
| 2 | Rat c0, Leopard c2, Wolf c4, Elephant c6 |
| 6 | Elephant c0, Wolf c2, Leopard c4, Rat c6 |
| 7 | Cat c1, trap c3, Dog c5 |
| 8 | Tiger c0, trap c2, den c3, trap c4, Lion c6 |

Red moves first in this family version.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board is 7 × 9 (63 squares) with 16 animals. | `initialBoard()`, `setup()` | “builds the 7×9 board with sixteen animals…” |
| R2 | The classic eight animals start on their marked squares. | `initialBoard()` | “places the classic eight animals per side” |
| R3 | Dens, traps and both 2 × 3 rivers are fixed. | `DENS`, `TRAPS`, `isWater()` | “marks the dens, traps and two rivers” |
| R4 | The two sides start in a 180° rotational layout. | `initialBoard()` | “is rotationally symmetric at the start” |
| R5 | Red moves first. | `setup('X')` | “builds the 7×9 board…” |
| R6 | Animals move one square orthogonally, never diagonally. | `movesFrom()` | “moves one orthogonal square and never diagonally” |
| R7 | Own pieces block movement; enemy pieces are captured. | `movesFrom()`, `canCapture()` | “captures equal or weaker animals…” |
| R8 | A player cannot enter their own den. | `movesFrom()` | “never lands a river jump on its own den”, “rejects moves into your own den…” |

## The river

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R9 | Only the rat may enter the river. | `movesFrom()` | “lets only the rat enter the river” |
| R10 | A rat swims one square at a time; it cannot cross bank-to-bank in one move. | `movesFrom()` | “makes the rat swim one square at a time…” |
| R11 | Lions and tigers jump straight across a river to the first land square beyond. | `movesFrom()` | “lets a lion jump horizontally…”, “lets a tiger jump vertically…” |
| R12 | A jumping lion/tiger may capture on arrival. | `canCapture()` | “lets a lion capture on a river jump” |
| R13 | Any rat of either colour in the water blocks a jump. | `jumpBlocked()` | “blocks a lion jump when any rat sits in the water”, “blocks a tiger jump when a friendly rat…” |
| R14 | Lions/tigers cannot jump over land. | `movesFrom()` | “does not jump across land” |

## Captures and traps

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R15 | An animal captures an equal or lower rank. | `canCapture()`, `RANKS` | “captures equal or weaker animals but not stronger ones” |
| R16 | Rank order: elephant 8, lion 7, tiger 6, leopard 5, wolf 4, dog 3, cat 2, rat 1. | `RANKS` | used throughout |
| R17 | A rat on land may capture an elephant. | `canCapture()` | “lets a rat on land capture an elephant” |
| R18 | An elephant may never capture a rat. | `canCapture()` | “lets the elephant never capture a rat” |
| R19 | A rat in water may only capture another rat in water. | `canCapture()` | “does not let a rat capture an elephant from the water”, “lets water rats capture each other”, “does not let a land rat capture a water rat” |
| R20 | A rat in water cannot be captured from land. | `canCapture()` | “protects a rat in the water from land animals” |
| R21 | A piece on an opponent trap has effective rank 0. | `effectiveRank()` | “lets any piece capture an enemy standing in its trap” |
| R22 | A piece on its own trap keeps its normal rank. | `effectiveRank()` | “does not weaken a piece standing in its own trap” |
| R23 | An attacker standing on an enemy trap is also rank 0. | `effectiveRank()` | “weakens an attacker standing in the enemy trap” |

## Winning and drawing

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R24 | Entering the enemy den wins immediately. | `apply()` | “wins by entering the enemy den” |
| R25 | Capturing the last enemy animal wins. | `apply()` | “wins by capturing the last enemy animal” |
| R26 | A side with no legal move draws (stalemate). | `apply()`, `hasAnyMove()` | “draws a stalemate position with no legal move” |
| R27 | Sixty full moves without a capture draw. | `apply()`, `QUIET_LIMIT` | “draws after the quiet-move limit” |
| R28 | A finished game rejects further moves. | `apply()` | “rejects moves into your own den and after the game ends” |
| R29 | A move from an empty square is rejected. | `apply()` | “rejects empty sources, wrong turns and illegal moves” |
| R30 | A piece may only move on its own turn. | `apply()`, `applySeat()` | same |
| R31 | Illegal destinations are rejected. | `apply()` | same |

## Seats and LAN

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R32 | Seat 0 is Red, seat 1 is Blue. | `sideForSeat()` | “enforces seat ownership” |
| R33 | Each seat receives the full board and its own `side`/`canMove`. | `view()` | “gives each seat the same board and its own side” |
| R34 | Move encoding round-trips and rejects nonsense. | `encodeMove()`, `decodeMove()` | “encodes and decodes moves, rejecting nonsense” |
| R35 | No legal moves remain after the game ends. | `legalMoves()` | “has no legal moves after the game is over” |

The LAN host owns the authoritative state. It sends `view(state, 1)` to the guest and
accepts only `{type:'move', from, to, moveCount}`. `applySeat` re-checks the seat, the
turn, the move count and the full rule set before applying anything. A stale or spoofed
intent is ignored.

## AI

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| A1 | Every level takes an immediate game-ending move. | `chooseMove()` | “takes an immediate den win at every level” |
| A2 | Every level returns only legal moves. | `chooseMove()` | “returns only legal moves for every level” |
| A3 | The same position, level and injected RNG give the same move. | `chooseMove(state, level, rng)` | “is deterministic with the same injected RNG” |
| A4 | Hard search finds material and forced den threats. | `evaluate()`, `search()` | “finds a hanging elephant on Hard” |
| A5 | Evaluation is from the requested side. | `evaluate()` | “scores material and terminal positions…” |
| A6 | Hints explain a den, capture, jump, trap or advance. | `hintFor()` | “explains a hint to the den”, “explains a capture hint” |

## Chosen variations

Dou Shou Qi has many local variations. This implementation fixes the common family set:

- Lion and tiger jump both horizontally and vertically.
- A rat in water can only capture a water rat; it cannot capture a land animal, and no
  land animal can capture it.
- The elephant can never capture a rat; the rat can capture the elephant only from land.
- Traps only weaken a visitor, never the defending side.
- Threefold repetition is not implemented; a 120-ply (60 full-move) no-capture limit
  and stalemate provide the draw paths. See `docs/limitations.md`.
