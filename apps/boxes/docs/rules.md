# Boxes · rule audit

Every rule has code, a test and an edge case. The engine is `src/game/boxes.ts`:
TypeScript only, no DOM, network, clock or `Math.random`, and no mutation of the
input state. Tests are in `tests/game.test.ts` (33 tests).

## The board

A 6×6 lattice of dots makes **25 boxes**. There are **60 lines**: 30 horizontal
(`0–29`) and 30 vertical (`30–59`). A box is indexed row-major `0–24`.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board starts empty with 60 lines and 25 boxes, player 0 to draw. | `setup()` | “starts with a 6×6 lattice: 60 edges, 25 boxes…” |
| R2 | Horizontal lines are `row × 5 + col`; vertical lines are `30 + row × 6 + col`. | `hEdge()`, `vEdge()`, `edgePosition()` | “maps horizontal and vertical edge indices…” |
| R3 | Every box has exactly four sides: top, bottom, left, right. | `boxEdges()` | “lists the four sides of corner and interior boxes” |
| R4 | A rim line touches one box; a middle line touches two. | `boxesTouchingEdge()` | “finds one box at a rim edge and two boxes in the middle” |
| R5 | Each turn draws exactly one undrawn line. | `apply()` | “draws an edge, records the pencil owner and passes the turn” |
| R6 | A repeated line, a non-integer or an out-of-range line is rejected. | `apply()` errors `drawn` / `bad-edge` | “rejects bad, repeated and post-game edges” |
| R7 | A finished game rejects every further line. | `apply()` error `game-over` | same |
| R8 | If no box is closed, the turn passes to the other player. | `apply()` | “draws an edge… passes the turn” |
| R9 | Closing the fourth side claims the box, scores one point and keeps the turn. | `apply()` | “claims a completed box and keeps the turn” |
| R10 | One shared line can close two boxes and claims both. | `apply()`, `completedBoxes()` | “claims two boxes with one shared edge…” |
| R11 | A player may draw again immediately after a claim. | `applySeat()` | “lets the same seat move again after a claim” |
| R12 | The game ends when all 60 lines are drawn; the 25 boxes are all owned. | `apply()` | “completes all 60 edges, sums 25 boxes…” |
| R13 | The player with more boxes wins. | `winner`, `resultText()` | same |
| R14 | Seat 0 and seat 1 may only move on their own turn. | `applySeat()` error `wrong-turn` | “enforces seat ownership for both seats” |
| R15 | A guest view is a copy and exposes `canMove` for its own seat only. | `view()` | “gives each seat a view…” and “copies its arrays…” |
| R16 | The AI only returns legal lines. | `chooseMove()` | “returns a legal move…” and “never returns an illegal move…” |
| R17 | AI choices are deterministic with the injected RNG. | `chooseMove(state, level, rng)` | “is deterministic for the same state…” |
| R18 | Hints return a strong legal line plus a reason category. | `hintFor()` | the hint tests |
| R19 | LAN intents are re-checked by the host; a stale or spoofed line is rejected. | `applySeat()` in `App.tsx` `host.onIntent` | manual two-page LAN test |

## Scoring

Each box is one point. The 6×6 dot grid has 25 boxes, an odd number, so a draw is
impossible in this format; the engine still accepts a tied final score and returns
`winner: null` for other board sizes. The result is stored in the local family
record only for solo and hot-seat games.

## Extra turn

The key rule is implemented in one place:

```ts
const nextTurn = claimed.length > 0 ? player : other(player);
```

A double-box line therefore grants one extra turn, not two. The UI reads `turn`
from the state and re-renders the active score card and board.

## AI contract

- **Companion** — takes boxes usually but sometimes leaves one, and hands over only
  short chains when it must open a box.
- **Easy** — uniformly random legal line.
- **Normal** — takes the largest free box, otherwise a safe line; when every line
  gives a box away, prices the shortest chain.
- **Hard** — chain-aware capture/safe/sacrifice heuristics; below 12 remaining lines
  it runs an exact alpha-beta search with memoisation.

## LAN contract

The host owns the full `GameState`. The guest receives `view(state, 1)` and sends
only `{ type: 'draw', edge }`. The host runs `applySeat(state, 1, edge)`; wrong
turns, repeated lines and post-game intents fail before the state changes. The
relay is a dumb message bus and never sees the guest view of the other seat.
