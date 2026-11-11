# Sowing · rule audit

Every rule has code, a test and an edge case. The engine lives in `src/game/sowing.ts`
and has no DOM, clock, network or `Math.random` dependency. `GameState.pits` is a
14-slot board: slots 6 and 13 are the store mouths (always `0`), and the real store
totals live in `stores[0..1]`. That keeps the counter-clockwise path readable.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | Each player has six pits and a store. Every pit starts with four seeds. | `setup()` | “sets up twelve pits with four seeds and empty stores” |
| R2 | 48 seeds exist; the total never changes. | `setup()` / `apply()` | “keeps 48 seeds through a complete deterministic game” |
| R3 | Seat 0 is the bottom row (pits 0–5); seat 1 is the top row (pits 7–12). | `ownPits()` `isOwnPit()` | “maps local pit numbers and opposite pits” |
| R4 | A move starts by lifting every seed from one legal pit. | `apply()` | “sows one seed per pit and does not mutate the input” |
| R5 | Seeds are placed one per following pit, counter-clockwise. | `apply()` | same test; “sows a full lap back into the starting row” |
| R6 | The opponent's store is skipped. | `apply()` | “skips the opponent store while sowing” |
| R7 | Landing the last seed in your own store grants another turn. | `apply()` → `last.extra` | “grants another turn when the last seed lands in the store” |
| R8 | Landing the last seed in an empty pit on your side captures it and the opposite pit. | `apply()` → `last.capture` | “captures the landing seed and the opposite pit” |
| R9 | An empty opposite pit still yields the landing seed. | `apply()` | “captures the single seed even when the opposite pit is empty” |
| R10 | A landing pit that already held seeds never captures. | `apply()` | “does not capture when the landing pit already held seeds” |
| R11 | A landing on the opponent's side never captures. | `apply()` | “does not capture on the opponent side” |
| R12 | The game ends the moment either row is empty, including after a capture. | `finish()` | “ends when a row empties…” and “can end the game by capturing the opponent row empty” |
| R13 | Remaining seeds are swept to their owners' stores (family convention). | `finish()` | same test |
| R14 | The larger store wins; equal stores are a draw. | `finish()` / `winner` | “declares a draw…” and “awards the win to the bigger store” |
| R15 | No further move is accepted after the game ends. | `apply()` `game-over` | “rejects moves after the game has ended” |
| R16 | Bad slots, stores, non-integers, empty pits and opponent pits are rejected. | `apply()` errors | “rejects out-of-range, store and opponent pits”; “rejects an empty pit” |
| R17 | Seat helpers refuse an out-of-turn or invalid seat. | `applySeat()` | “enforces the seat and the turn” |
| R18 | Each seat receives a cloned view with its own `canMove`. | `view()` | “gives each seat a public view with canMove” |
| R19 | A preview simulates one move without mutating the state. | `previewMove()` | “previews a move without changing the state” |
| R20 | Hints can state capture, extra-turn, finish and quiet reasons. | `moveReason()` | “reasons about captures, extra turns and quiet moves” |
| R21 | AI returns only legal moves and is deterministic with an injected RNG. | `chooseMove()` | “only returns legal moves on every level”; “is deterministic…” |
| R22 | Companion prefers a quiet sowing over a capture and an extra turn. | `chooseMove('companion')` | “Companion favours a quiet sowing…” |
| R23 | Hard finds an immediate game-winning capture. | `chooseMove('hard')` | “Hard takes a move that ends the game as a win” |
| R24 | A full Normal-vs-Normal game reaches a legal finish. | `chooseMove()` / `apply()` | “plays a whole Normal vs Normal game to a finish” |

## Scores and the family record

There is no hidden score: stores hold the score. At the end, remaining pits are swept
to their owner's store and the larger store wins. The record stores games, P1 wins,
P2 wins, draws, the current result streak and the last result in `localStorage`
(`familyarcade.sowing.record`). It counts finished solo and hot-seat games. LAN results are
kept on the host only.

## AI

- **Companion** — 45% random, otherwise a quiet sowing with no capture and no extra
  turn. If every move captures or keeps the turn, it picks the smallest capture. It
  deliberately has no search.
- **Easy** — 45% random, otherwise one-ply store gain with a bonus for an extra turn
  and a finishing win.
- **Normal** — 12% random, otherwise three plies with alpha-beta.
- **Hard** — eight plies including the chosen move, alpha-beta, ordered captures and
  extra turns; deterministic.

All levels use the injected RNG; the UI passes `Math.random` only at the boundary.
The engine itself never calls it.

## LAN

The host owns the state. The guest receives `view(state, 1)` (a cloned 14-slot board,
stores, turn, status, winner and last move) and may send only `{type:'sow', pit}`.
`applySeat` re-checks the seat, turn, pit ownership, non-empty pit and game status on the
host; stale or spoofed intents are rejected. The guest's board is rotated so its own
pits are on the bottom and its store is bottom-right.

## Simplifications

- Fixed four seeds per pit and six pits per side (no variant selector).
- Capture-on-empty includes the landing seed even if the opposite pit is empty.
- Finish-and-sweep is applied immediately when a row empties.
- No “must feed opponent” rule; legal moves are simply the mover's non-empty pits.
