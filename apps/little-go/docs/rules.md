# Little Go · rule audit

Every rule below is implemented in the pure engine at `src/game/little-go.ts` and
covered by a test in `tests/game.test.ts`. The engine has no DOM, clock, network or
`Math.random` dependency; the AI receives its RNG as an argument.

## Core rules

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board is 9×9 = 81 intersections and starts empty. | `setup()` | “sets up an empty 9×9 board with Black to move and 6.5 komi” |
| R2 | Black moves first. | `setup('B')` | same |
| R3 | Players alternate colours. | `apply()` | “alternates turns and rejects occupied or out-of-range points” |
| R4 | A stone may not be placed on an occupied point. | `apply()` → `occupied` | same |
| R5 | Points outside 0–80 are rejected. | `apply()` → `bad-cell` | same |
| R6 | A single stone with no liberties is captured. | `apply()` | “captures a single stone without liberties” |
| R7 | A whole group with no liberties is captured. | `apply()` | “captures a multi-stone group” |
| R8 | Suicide is illegal. | `apply()` → `suicide` | “forbids suicide” |
| R9 | A move may fill its last liberty if it captures first. | `apply()` | “allows a move that fills its last liberty when it captures” |
| R10 | Simple ko: the point of an immediate single-stone recapture is blocked for one move. | `apply()` `koPoint` | “sets a simple ko point after a one-stone capture” |
| R11 | An immediate recapture is rejected; a recapture after intervening moves is legal. | `apply()` → `ko` | “forbids immediate recapture but allows it after an intervening move” |
| R12 | A multi-stone capture does not create a ko point. | `apply()` | “does not set ko after a multi-stone capture” |
| R13 | A pass flips the turn, clears ko and increments the pass counter. | `pass()` | “records a pass, flips the turn and clears ko” |
| R14 | Two consecutive passes finish the game and run the score. | `pass()` | “finishes after two consecutive passes and stores the score” |
| R15 | A placement resets the pass counter. | `apply()` | “resets the pass counter after a placement” |
| R16 | A finished game rejects further placements and passes. | `apply()` / `pass()` → `game-over` | “refuses moves and passes after the game is finished” |
| R17 | The last move is recorded; a pass clears `lastMove`. | `apply()` / `pass()` | “marks the last move and clears it on a pass” |
| R18 | Move history records colour, type and point. | `moves[]` | “records placements in order with the colour that played them” |

## Scoring

Score = **stones on the board + empty points surrounded by one colour**. White adds
**6.5 komi**. Empty regions that touch both colours are neutral. There is no
dead-stone removal phase and no dame filling: the board is scored exactly as it
stands when the second pass is played.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| S1 | Stones count one point each. | `scoreBoard()` | “scores stones plus surrounded territory” |
| S2 | A fully surrounded empty region belongs to its colour. | `territoryOwner()` | same |
| S3 | A region touching both colours is neutral. | `territoryOwner()` | “leaves a region neutral when it touches both colours” |
| S4 | Two single-point eyes are counted for their owners. | `scoreBoard()` | “counts two single-point eyes for their owners” |
| S5 | An empty finished board is White +6.5. | `scoreBoard()` | “awards an empty finished board to White by komi” |
| S6 | The stored final score equals `scoreBoard(board)`. | `pass()` | “stores the same score used by scoreBoard when the game ends” |

## Seats and LAN

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| L1 | Seat 0 is Black and seat 1 is White. | `applySeat()` | “enforces seat colours and turn order” |
| L2 | A seat may only move on its own turn. | `applySeat()` → `wrong-turn` | same |
| L3 | Passes obey the same seat check. | `passSeat()` | “passes for a seat only on that seat’s turn” |
| L4 | Each seat receives only its own public view. | `view()` | “gives each seat a private, serialisable view” |
| L5 | The host owns the authoritative state; a guest intent is re-checked. | `App.tsx` `onIntent` + `applySeat` | LAN manual test |

The host sends `view(state, 1)` to the guest after every move. The guest can only
send `{type:'place', index}` or `{type:'pass'}`; the host validates the turn, the
seat, the ko point and suicide before committing.

## AI

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| A1 | Every level returns a legal placement (or a pass). | `chooseMove()` | “returns a legal move at every level on an empty board” |
| A2 | Normal and Hard take an immediate capture. | `chooseMoveDetailed()` | “takes an immediate capture” |
| A3 | Easy saves a group in atari. | `chooseMove()` | “saves its own group from atari on Easy” |
| A4 | The AI never chooses a suicide point. | `legalMoves()` filter | “does not choose a suicide point” |
| A5 | The same state, level and RNG stream give the same move. | injected `rng` | “is deterministic for the same injected RNG” |
| A6 | With no legal placement the AI passes. | `chooseMoveDetailed()` | “passes when there is no legal placement” |
| A7 | Hints carry a reason code and a legal point. | `hint()` | “offers a hint with a reason and a legal point” / “explains a capture hint” |

Normal runs **30** random playouts, Hard runs **200**. Both use a liberty/atari/
influence shortlist first. Companion avoids filling eyes and avoids invading a
child’s settled area; Easy is greedy with a little randomness.

## Out of scope (documented simplification)

- No superko, no triple ko, no dead-stone marking, no resignation, no handicap,
  no byo-yomi and no Japanese/Chinese rule selection.
- Komi is fixed at 6.5; there is no bidding.
- A region is territory only when every bordering stone belongs to one colour.
- Hard is a family challenge, not a dan-level Go engine.
