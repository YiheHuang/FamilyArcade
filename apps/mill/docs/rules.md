# Mill · rule audit

The engine lives in [`src/game/mill.ts`](../src/game/mill.ts). It is a pure module:
no DOM, no network, no clock and no `Math.random`. Every action returns a fresh
`GameState`; the UI keeps snapshots for undo and the LAN host serialises them.

Tests live in [`tests/game.test.ts`](../tests/game.test.ts) — **33 tests**, all run by
`npm test` / `npm run check`.

## Board

The board is the traditional 24-point Nine Men's Morris grid: three concentric
rings joined by four spokes. There are 32 undirected edges and 16 possible mills.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| B1 | 24 points; each point belongs to one ring or spoke. | `POINTS`, `ADJACENCY` | “has 24 points, 16 mills and a symmetric graph” |
| B2 | The adjacency graph contains 32 undirected edges and is symmetric. | `ADJACENCY` | same |
| B3 | There are 16 distinct three-point mills. | `MILLS` | same / “defines mills as three distinct adjacent-by-line points” |
| B4 | A mill is any complete own line through the placed point. | `millAt`, `millsFor` | “reports every mill and the mill through a point” |

## Placing phase

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| P1 | Each player begins with nine men; White starts. | `setup()` | “starts empty with nine men each and White to place” |
| P2 | Players alternate one placement at a time. | `apply(place)` | “alternates placement and decrements the hand” |
| P3 | A placement must be on an empty point inside 0–23. | `apply()` errors `occupied`, `bad-point` | “rejects occupied points, out-of-range points and malformed moves” |
| P4 | Every placement removes one man from that player's hand and adds one on the board. | `apply(place)` | “alternates placement…” |
| P5 | After the eighteenth placement the game enters the moving phase. | `finishTurn()` | “transitions to moving after the eighteenth placement” |
| P6 | A move action is rejected while placing. | `apply()` `wrong-phase` | “rejects a move action while still placing” |

## Mills and capture

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| M1 | Completing a mill on a placement opens a mandatory capture. | `withCapturePending` | “closes a mill, keeps the turn and offers only captures” |
| M2 | The turn stays with the capturer until the removal is made. | `pendingCapture` | same |
| M3 | While a capture is pending, every non-capture action is rejected. | `apply()` `capture-required` | “rejects captures with no mill…” |
| M4 | A removed man leaves the board and the opponent's count decreases. | `apply(capture)` | “removes the captured man, resets quiet and passes the turn” |
| M5 | Men inside a mill are protected while the opponent has any man outside a mill. | `capturablePoints()` | “protects men inside a mill when a free man exists” |
| M6 | If every opposing man is inside a mill, any one may be removed. | `capturablePoints()` | “allows any man when every rival man is in a mill” |
| M7 | Capturing a protected man is an error, not a silent no-op. | `apply()` `protected` | “protects men inside a mill…” |
| M8 | A capture that leaves the rival with two men ends the game immediately. | `apply(capture)` → `finished(..., 'two-men')` | “wins immediately when a capture leaves the rival with two men” |

Reference rule note: a man may leave a mill and later re-enter it to close the same
mill again. This implementation allows that, as most modern Nine Men's Morris
rules do; it is not treated as a draw.

## Moving phase

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| V1 | After placement, a man moves only along a line to an adjacent empty point. | `apply(move)`, `isAdjacent` | “only steps along a line to an empty point” |
| V2 | A player may not move an opponent's man or step onto an occupied point. | `apply()` `not-own`, `occupied` | same |
| V3 | Stepping into a mill opens a capture exactly like placing. | `millAt` on destination | “allows a move to close a mill and capture” |
| V4 | A player with no adjacent empty point loses immediately. | `hasAnyStep()`, `finishTurn()` | “wins by blocking every legal move” |
| V5 | A seat whose men are reduced to two (with no men in hand) loses. | `finishTurn()` | “wins immediately when a capture leaves the rival with two men” |
| V6 | Fifty quiet moves without a capture is a draw (100 plies). | `QUIET_LIMIT` | “ends a 50-move quiet game in a draw” |
| V7 | A finished game rejects every later action. | `apply()` `game-over` | “refuses further actions after the game ends” |

## Seats, views and LAN

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| S1 | Seat 0 is White, seat 1 is Black. | `applySeat`, `view` | “enforces seat marks for LAN intents” |
| S2 | A seat can act only on its own turn. | `applySeat()` `wrong-turn` | same |
| S3 | Out-of-range seats are rejected. | `applySeat()` `bad-seat` | same |
| S4 | A seat view contains the full public board, its own mark and only its legal actions. | `view()` | “gives each seat its own mark and legality” |
| S5 | A pending capture is visible to both seats; there is no hidden information. | `SeatView.pendingCapture` | “exposes pending capture to both seats…” |
| S6 | The LAN host re-checks every guest intent with `applySeat`; stale or spoofed moves are rejected. | `App.tsx` `host.onIntent` + `applySeat` | manual LAN check |

## AI and hints

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| A1 | Four deterministic levels with an injected RNG: Companion, Easy, Normal, Hard. | `chooseMove(state, level, rng)` | “returns a legal move on every level…” |
| A2 | The same state, level and RNG sequence produce the same move. | `chooseMove` | “is deterministic for an injected RNG” |
| A3 | Companion takes a clear immediate mill and otherwise prefers safe development. | `companionMove` | “takes an immediate mill on Hard, Normal and Companion” |
| A4 | Easy is deliberately noisy and sometimes random. | `chooseMove` easy branch | “returns a legal move on every level…” |
| A5 | Normal searches two actions ahead; Hard searches four with alpha–beta pruning. | `search` | code review + AI tests |
| A6 | A pending capture is treated as a mandatory action by every level. | `chooseMove` pending branch | “chooses captures when a capture is pending” |
| A7 | Hints highlight one legal action and explain the idea (mill, block, capture, development). | `explainMove` | “hints” tests |
| A8 | A complete deterministic game reaches a win or draw, never a stuck position. | engine + `chooseMove` | “plays a complete deterministic game and reaches a result” |

## Draw and record

There is no score. The family record stores finished games, White/Black wins,
draws, the current repeated-winner streak, mode counts and the eight most recent
results in `localStorage`. Autosave stores a full engine state and the human seat;
the LAN guest does not write to the host's record.

## LAN protocol

The host owns the authoritative `GameState`. The guest receives `view(state, 1)`
and may send only a `Move` object (`place`, `move` or `capture`). `applySeat`
checks the seat, turn, phase, adjacency, protection and mill rules on the host. The
relay is a dumb message bus; it never sees or enforces the rules.
