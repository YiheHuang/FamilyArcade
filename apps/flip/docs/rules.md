# Flip · rule audit

Every rule has code and a test (or an explicit code-review note). The engine lives in
`src/game/flip.ts` and has no DOM, clock, network or `Math.random` dependency.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board is 8 × 8 (64 indices, row-major). | `setup()` | “starts with 64 cells and the standard four-disc centre” |
| R2 | The standard opening has White on d4/e5 and Black on e4/d5. | `setup()` | same |
| R3 | Black moves first. | `setup('B')` | same |
| R4 | A move must be on an empty board square. | `apply()` `occupied` | “rejects occupied squares, off-board indices and moves that flip nothing” |
| R5 | Indices below 0 or above 63 are rejected. | `apply()` `bad-cell` | same |
| R6 | A move must bracket at least one opponent disc in a straight line. | `flipsFrom()` / `apply()` `illegal` | same, plus “flips a contiguous line and stops at the first own disc” |
| R7 | Every bracketed disc flips, in all eight directions. | `flipsFrom()` | “flips in all eight directions from one square” |
| R8 | The turn alternates after a normal move. | `apply()` | “places a disc, flips one disc and hands the turn to White” |
| R9 | If the opponent has no legal move, the turn passes back automatically. | `apply()` `passed` | “passes the turn back when the opponent has no legal reply” |
| R10 | The game ends when neither player can move. | `apply()` | “ends the game when neither player can move after a pass” |
| R11 | The player with more discs wins; equal counts are a draw. | `finalResult()` | “calls a tied board a draw”, “completes a full random playout with a consistent result” |
| R12 | A finished game rejects further moves. | `apply()` `game-over` | “ends the game when neither player can move after a pass” |
| R13 | Seat 0 is Black and seat 1 is White. | `applySeat()` / `view()` | “gives seat 0 Black and seat 1 White” |
| R14 | A seat may only move on its own turn. | `applySeat()` `wrong-turn` | “enforces the seat mark and the turn” |
| R15 | Views carry counts, legal moves, last move and `canMove`. | `view()` | “describes counts, legal moves, last move and move count in a view” |
| R16 | A view gets its own board copy. | `view()` | “returns a board copy so a guest cannot mutate the host view” |
| R17 | AI returns only legal moves, or −1 when there is none. | `chooseMove()` | “always returns a legal move at every level”, “returns −1…” |
| R18 | AI is deterministic with an injected RNG. | `chooseMove(state, level, rng)` | “is deterministic for a fixed RNG on every level” |
| R19 | Companion leaves extra early corners for the child. | `companionMove()` | “Companion leaves extra corners for the child early in the game” |
| R20 | Hard searches four plies with corner, edge, mobility and frontier terms. | `search()` / `evaluate()` | “Hard prefers a corner when corners are available” + code review |
| R21 | Hints explain a real reason (corner, safety, flips, mobility or best shape). | `chooseHint()` | “hints with a real reason and honest numbers”, “explains a corner hint as a corner” |
| R22 | An AI-vs-AI game always finishes. | `chooseMove()` + `apply()` | “finishes an AI-vs-AI game without stalling” |

## Scoring and the record

The engine returns `status: 'won' | 'draw'`, `winner` and both disc counts. The UI
counts a game for the local family record only in solo and hot-seat modes. LAN games
remain on the table and are not written to either device's record. The record stores
games, Black wins, White wins, draws, the current streak and the best streak in
`localStorage`.

## Undo and autosave

Solo and hot-seat games save after every placement. In solo mode Undo rewinds to the
last Black turn (both the AI reply and the human move), so the human never receives an
immediate AI re-reply. Undo is disabled after the final position because the family
record has already been counted. LAN games do not offer undo, because the host is
authoritative and two devices must stay in sync.

## AI

- **Companion** plays one-ply, often quietly, and once it holds a corner in the first
  26 moves it leaves other corners for the child.
- **Easy** is one-ply with a 45% random move.
- **Normal** is a two-ply alpha-beta search with a 16% random move.
- **Hard** is a four-ply alpha-beta search. Evaluation combines the classic corner and
  X-square weights, legal-move mobility, frontier discs and a late-game disc count.
  It is strong, not perfect.
- All four take an injected RNG; the tests use a fixed LCG to prove determinism.

## LAN

The host owns the state and seat 0 (Black). The guest receives `view(state, 1)` and may
send only `{type:'place', index}`. `applySeat` re-checks the seat, the turn, the square
and the bracket on the host; stale or spoofed intents are rejected. Since Reversi has
perfect information, the view contains the full board — but the guest still cannot
mutate the host state or move out of turn.
