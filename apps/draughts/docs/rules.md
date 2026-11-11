# Draughts · rule audit

This is **English draughts** (American checkers) on an 8×8 board, not
international draughts. The pure engine lives in `src/game/draughts.ts`; it has
no DOM, clock, network or `Math.random` dependency. The tests are in
`tests/game.test.ts`.

## Board and pieces

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board has 64 cells; only dark squares are playable. | `isDark()`, `setup()` | “places twelve men per side on the dark squares and gives Red the first turn” |
| R2 | Each side starts with twelve men: White on rows 0–2, Red on rows 5–7. | `setup()` | same |
| R3 | Red moves first; players alternate. | `setup('red')`, `apply()` | “places twelve…”, “applies a simple move…” |
| R4 | A man moves one dark square diagonally forward. | `simpleMovesFrom()` via `legalMoves()` | “opens with seven legal Red moves” |
| R5 | A man promotes to a king on the far row. | `apply()` + `kingOf()` | “promotes on a quiet move to the far row” |
| R6 | A king moves one dark square in any diagonal direction. | `directionsFor()` | “lets a king move one square in every diagonal direction” |
| R7 | A king captures backwards as well as forwards. | `jumpOptions()` | “lets a king capture backwards” |

## Captures

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R8 | A capture jumps an adjacent enemy into the empty square beyond. | `jumpOptions()` | “makes captures mandatory” |
| R9 | Captures are mandatory: if any capture exists, only captures are legal. | `legalMoves()` | “makes captures mandatory” |
| R10 | A multi-jump must continue while the same piece can capture again. | `captureSequencesFrom()` | “continues a multi-jump until no more captures remain” |
| R11 | A man that reaches the far row mid-jump is crowned and the move ends. | `captureSequencesFrom()` | “crowns a man on the far row and ends the jump immediately” |
| R12 | A king may continue a multi-jump in any direction, including backwards. | `captureSequencesFrom()` | “lets a king continue the same jump backwards…” |
| R13 | Captured pieces are removed; the moving piece leaves its old square. | `apply()` | “wins by capturing the last enemy piece” |
| R14 | Malformed, illegal or stale moves are rejected. | `isMove()`, `apply()`, `sameMove()` | “rejects an illegal destination and a wrong seat”, “refuses moves after the game has ended” |

English draughts does **not** require the maximum capture. Any legal capture is
allowed; once a capture is chosen, the jump must be continued. Men capture
forward only; kings are one-step (not flying kings).

## Winning and drawing

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R15 | Capture the last enemy piece to win. | `apply()` `all-captured` | “wins by capturing the last enemy piece” |
| R16 | Leave the opponent with no legal move to win. | `apply()` `blocked` | “wins by leaving the opponent with no legal move” |
| R17 | 40-move king rule: 80 plies with no capture and no man move are a draw. | `quietPlies`, `QUIET_LIMIT` | “draws on the 40-move king rule” |
| R18 | Threefold repetition is a draw. | `repetitions`, `positionKey()` | “draws on threefold repetition” |
| R19 | A 300-ply safety limit guarantees a result. | `MAX_PLIES` | “draws at the safety move limit” |
| R20 | A finished game rejects further moves. | `apply()` `game-over` | “refuses moves after the game has ended” |

## Seats, LAN and AI

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R21 | Seat 0 is Red and seat 1 is White. | `applySeat()` | “lets seat 1 make the White reply after Red moves” |
| R22 | A seat may only move on its own turn. | `applySeat()` `wrong-turn` | same |
| R23 | A seat view exposes the public board, the seat's own `canMove` and only its own legal moves. | `view()` | “gives each seat its own canMove flag and the same public board” |
| R24 | Every AI level returns a legal move. | `chooseMove()` | “returns only legal moves at every level” |
| R25 | Every level takes an immediate winning capture. | `chooseMove()` | “takes an immediate winning capture on every level” |
| R26 | Companion prefers the smallest capture (gentle to children). | `chooseWithReason()` | “keeps Companion gentle by preferring the smaller capture” |
| R27 | The same position and RNG produce the same move. | `chooseMove(state, level, rng)` | “is deterministic for a fixed RNG” |
| R28 | Hints carry a translatable reason. | `reasonFor()` | “returns a translatable hint reason for every choice” |
| R29 | A deterministic self-play game reaches a result within the move limit. | `apply()` loop | “plays a complete deterministic self-play game…” |
| R30 | Material evaluation values kings above men. | `evaluate()` | “values material and kings…” |

## Record

The family record stores games, Red wins, White wins, draws, the current streak
and the last twelve results in `localStorage` (`familyarcade.draughts.record`). LAN
games are not counted on the guest device.

## LAN

The host owns the state. The guest receives `view(state, 1)` and may send only
`{type:'move', move}`. `applySeat` re-checks the turn, the game status and the
complete move path against the host's `legalMoves` before applying it. A stale,
spoofed or malformed intent is rejected and does not change the host state.
