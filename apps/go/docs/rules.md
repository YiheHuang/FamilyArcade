# Go · rule audit

Every rule below is implemented in the pure engine at `src/game/go.ts` and covered by
`tests/game.test.ts`. The engine has no DOM, network, clock or `Math.random` dependency;
the AI receives its RNG as an argument. The suite has **45 tests**.

## Board and setup

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The default board is 19×19 with 361 empty intersections. | `setup()` | “sets up 19×19 by default…” |
| R2 | 9×9 and 13×13 boards are also supported. | `setup({size})` | “supports 9×9 and 13×13…” |
| R3 | Black moves first by default; White can be made first for tests or variants. | `setup({first})` | “allows White to move first…” |
| R4 | Komi can be 6.5 or 7.5 and is stored on the game. | `setup({komi})` | same setup tests |
| R5 | A move outside the board, a fractional point or an occupied point is rejected. | `apply()` → `bad-cell` / `occupied` | “alternates turns and rejects…” |
| R6 | `apply` and `pass` never mutate the state passed in. | immutable spread | “never mutates the state…” |

## Captures, suicide and ko

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R7 | A single stone with no liberties is captured. | `apply()` | “captures a single stone…” |
| R8 | A whole group with no liberties is captured. | `apply()` group flood fill | “captures a multi-stone group” |
| R9 | Two separate groups can be captured by one point if it fills both last liberties. | `apply()` adjacent-group scan | “captures two separate groups…” |
| R10 | Suicide is illegal. | `apply()` → `suicide` | “forbids suicide…” |
| R11 | A move may fill its own last liberty if it captures first. | `apply()` removals before liberty check | “allows a move that fills…” |
| R12 | A one-stone capture by a lone stone with one liberty sets a simple ko point. | `apply()` `koPoint` | “sets a simple ko point…” |
| R13 | Immediate recapture at the ko point is rejected. | `apply()` → `ko` | “forbids immediate recapture…” |
| R14 | After an intervening move, the ko point is cleared and recapture is legal. | `apply()` | same |
| R15 | A multi-stone capture never creates a ko point. | `apply()` | “captures a multi-stone group” |
| R16 | A pass clears ko, flips the turn and clears the last-move marker. | `pass()` | “records a pass…” |

## Passing and scoring

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R17 | Two consecutive passes finish the game. | `pass()` → `finish()` | “finishes after two consecutive passes…” |
| R18 | A placement resets the consecutive-pass counter. | `apply()` | “resets the pass counter…” |
| R19 | A finished game rejects placements and passes. | `apply()` / `pass()` → `game-over` | “refuses placements and passes…” |
| R20 | A pass is recorded in the move list with its colour. | `moves[]` | “records placements and passes…” |
| R21 | The last placement is tracked; a pass clears it. | `lastMove` | “reports the last placement…” |
| S1 | Every stone still on the board counts one point. | `scoreBoard()` | “scores stones plus surrounded territory” |
| S2 | An empty region touching only one colour is that colour’s territory. | `territoryOwner()` | same |
| S3 | A region touching both colours is neutral. | `territoryOwner()` | “leaves a region neutral…” |
| S4 | A single-point eye is counted for its owner. | `scoreBoard()` | “counts two single-point eyes…” |
| S5 | White adds the selected komi (6.5 or 7.5). | `scoreBoard(board, size, komi)` | “awards an empty finished board…” |
| S6 | Komi can decide a close game. | `scoreBoard()` | “lets komi decide a close game” |
| S7 | The stored final score equals `scoreBoard` at the second pass. | `pass()` | “stores the same score…” |
| S8 | A 19×19 wall is scored as large black/white territories plus neutral points. | `scoreBoard()` | “scores a 19×19 wall…” |
| S9 | A board length that does not match its size throws. | `scoreBoard()` | “throws when a board length…” |

The implementation is **area scoring on the board as it stands**: stones plus empty
points fully surrounded by one colour. Dead stones are not marked, removed or discounted;
dame points that touch both colours stay neutral. That is the documented simplification.

## Seats and views

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| L1 | Seat 0 is Black and seat 1 is White. | `colorForSeat()` | “enforces seat colours…” |
| L2 | A seat may only place or pass on its own turn. | `applySeat()` / `passSeat()` → `wrong-turn` | same / “passes for a seat…” |
| L3 | `view` returns a serialisable public board, size, komi, captures, passes, ko, score and `canMove`. | `view()` | “gives each seat a serialisable view” |
| L4 | Coordinate names use A–T without I; parsing rejects I and out-of-range rows. | `pointName()` / `parsePoint()` | “names and parses coordinates…” |
| L5 | Star points are five on 9×9/13×13 and nine on 19×19. | `starPoints()` | “returns the standard number…” |

Go is a perfect-information game, so the LAN guest view contains the full public board;
there is no hidden information to redact.

## AI and hints

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| A1 | Every level returns a legal placement on an empty 9×9 or 19×19 board. | `chooseMove()` | “returns a legal move at every level…” / “returns a legal opening…” |
| A2 | Normal and Hard take an immediate capture. | `chooseMoveDetailed()` | “takes an immediate capture…” |
| A3 | Easy saves a friendly group in atari. | `chooseMove()` | “saves its own group…” |
| A4 | The AI never chooses suicide. | `legalMoves()` filter | “does not choose a suicide point” |
| A5 | The same state, level and injected RNG stream produce the same move. | `chooseMove(state, level, rng)` | “is deterministic…” |
| A6 | With no legal placement the AI passes. | `chooseMoveDetailed()` | “passes when there is no legal placement” |
| A7 | Hints carry a reason code and a legal point. | `hint()` | “offers a hint…” / “explains a capture hint” |
| A8 | Hints work on a 13×13 midgame. | `hint()` | “offers a legal hint on a 13×13 midgame” |

The shortlist uses liberties, atari, captures, eye avoidance, current territory and local
influence. Normal runs 8 playouts on 19×19 and 12 on smaller boards; Hard runs 24 on
19×19 and 36 on smaller boards. Hard also considers up to eight candidates instead of six.
Playouts are deliberately bounded so a family move does not freeze the table. Companion
avoids big captures and eye-filling; it is gentle, not a teacher.

## LAN

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| N1 | The host owns the authoritative state and sends `view(state, 1)` to the guest after every move. | `App.tsx` `commit` | manual LAN test |
| N2 | A guest intent is re-checked for turn, seat, move count, ko, suicide and occupancy. | `onIntent` + `applySeat` / `passSeat` | manual LAN test |
| N3 | A stale `moveCount` is ignored. | `onIntent` | manual LAN test |
| N4 | The host records a LAN result; the guest never records. | `finish()` | manual LAN test |
| N5 | Undo and hints are disabled for both LAN seats. | game side panel | manual LAN test |
| N6 | Only the host starts the next game; the guest result banner waits. | `restartGame()` | manual LAN test |

## Out of scope (documented simplification)

No superko, triple ko or positional superko; no dead-stone marking; no resignation,
handicap, byo-yomi or clocks; no Japanese/Chinese rule-set selection; no komi bidding;
no online matchmaking, cloud saves or spectators. See
[`docs/limitations.md`](limitations.md).
