# Xiangqi · rule audit

The engine lives in `src/game/xiangqi.ts`. It has no DOM, clock, network or
`Math.random` dependency. The suite has **31 tests** covering the board, every piece,
check and the flying general, checkmate, stalemate, draws, move validation, seat views,
AI legality, hints and the family record.

## Board and setup

- 9 files × 10 ranks = 90 intersections. Index 0 is top-left, 89 bottom-right.
- Red sits at the bottom (rows 5–9) and moves first. Black sits at the top (rows 0–4).
- Each side starts with one general, two advisors, two elephants, two horses, two
  chariots, two cannons and five soldiers (16 pieces each, 32 total).
- The palace is files 3–5 and three ranks deep on each side. The river runs between
  rows 4 and 5.

## Rule audit

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board has 90 points and the standard 32-piece setup. | `initialBoard()` / `setup()` | “has ninety points and the full 32-piece setup” |
| R2 | Red moves first. | `setup('R')` | same |
| R3 | The general moves one orthogonal step inside the palace. | `pseudoMovesFrom` `G` | “keeps the general inside the palace” |
| R4 | The general may not leave the palace. | `inPalace()` | same |
| R5 | The two generals may not face each other on an open file. | `isSquareAttacked()` / `isMoveSafe()` | “forbids a move that leaves the two generals facing” |
| R6 | A general may capture the opposing general along an open file. | `pseudoMovesFrom` `G` | flying-general attack check |
| R7 | Advisors move one diagonal step inside the palace. | `pseudoMovesFrom` `A` | “lets advisors move one diagonal step inside the palace” |
| R8 | Elephants move exactly two diagonals and may not cross the river. | `pseudoMovesFrom` `E` | “moves elephants two diagonals and never across the river” |
| R9 | An elephant is blocked at its eye. | `pseudoMovesFrom` `E` | “blocks an elephant at its eye” |
| R10 | A horse moves in an L and is blocked by its leg. | `pseudoMovesFrom` `H` | “moves the horse in an L and blocks its leg” |
| R11 | A chariot slides orthogonally until blocked. | `pseudoMovesFrom` `R` | “slides rooks until a piece blocks the file or rank” |
| R12 | A cannon slides quietly like a chariot. | `pseudoMovesFrom` `C` | “slides a cannon quietly but captures only over one screen” |
| R13 | A cannon captures only over exactly one screen. | `pseudoMovesFrom` `C` | same |
| R14 | A soldier moves one step forward before the river. | `pseudoMovesFrom` `S` | “marches soldiers forward, then sideways after the river” |
| R15 | A soldier may also move sideways after crossing the river. | `hasCrossedRiver()` | same; “moves black soldiers toward increasing rows” |
| R16 | A soldier never moves backward. | `pseudoMovesFrom` `S` | same |
| R17 | A move may not land on a friendly piece. | `add()` target check | piece-rule tests |
| R18 | A move outside 0–89 is rejected. | `applyMove()` `bad-square` | “rejects wrong turns, empty squares, bad squares and illegal moves” |
| R19 | A move from an empty point is rejected. | `applyMove()` `no-piece` | same |
| R20 | A player may only move their own pieces. | `applyMove()` `wrong-side` | same |
| R21 | A move that exposes the player's own general is illegal. | `isMoveSafe()` | “filters a pinned piece that would expose its own general” |
| R22 | Applying a move never mutates the old state. | `applyMove()` | “never mutates the state handed to applyMove” |
| R23 | Check is detected from soldiers, horses, chariots, cannons and flying generals. | `isSquareAttacked()` | “detects a rook check and an open-file general check” |
| R24 | Checkmate ends the game and names the winner. | `applyMove()` | “detects checkmate and marks the winner” |
| R25 | Stalemate (no legal move, not in check) is a loss in Xiangqi. | `applyMove()` | “treats stalemate as a loss under Xiangqi rules” |
| R26 | A threefold repetition is a draw. | `positionCounts` | “detects threefold repetition as a draw” |
| R27 | Sixty full moves (120 plies) without a capture is a draw. | `halfmoveClock` | “draws after sixty full moves without a capture” |
| R28 | Seat 0 is Red and seat 1 is Black; a seat may only move on its turn. | `applySeat()` | “rejects wrong turns…” |
| R29 | Each seat receives a public view with its own side and `canMove`. | `view()` | “gives each seat a public view with its own side” |
| R30 | The AI returns legal moves at every level. | `chooseMove()` | “returns a legal move on every level” |
| R31 | Hard finds an immediate mate and takes a free chariot. | `chooseMove()` | “finds a mate in one on the Hard level”, “takes a free rook on the Hard level” |
| R32 | Hints explain mate, capture or development and disappear after the game. | `hintFor()` | “explains a mate in one”, “explains a capture…” |
| R33 | The family record counts Red, Black and draws, tracks streaks and keeps eight recent games. | `addResult()` / `normalizeRecord()` | “Xiangqi family record” tests |
| R34 | The position key includes the side to move. | `positionKey()` | “produces a stable position key that includes the side to move” |

## Scoring and draws

There is no point score: the game ends on checkmate or stalemate. In standard Xiangqi a
side with no legal move loses even when it is not in check, so both results are scored
for the mover. Threefold repetition and 120 quiet plies (sixty full moves without a
capture) are draws. The audit deliberately does not implement the tournament rules for
perpetual check/chase; this is documented in `docs/limitations.md`.

The family record stores games, Red wins, Black wins, draws, the current same-winner
run, the best run, a per-mode split and the eight most recent results in `localStorage`.
A guest does not write to the host record; a LAN result is recorded on the host device
only.

## LAN

The host owns the state. The guest receives `view(state, 1)` and may send only
`{type:'move', from, to, moveCount}`. `applySeat` re-checks the seat, turn, piece and
legal move on the host; a stale `moveCount`, spoofed intent or illegal move is ignored.
The four-digit room code doubles as the relay room id.

If a guest reloads, the reconnect token restores the seat. The host sends a fresh `start`
and `view`, so a late join or refresh lands on the live board. Only the host gets a
**Play again** button; the guest result banner waits for the host.

When the host leaves, it sends a `result {kind:'closed'}` notice before closing the
socket. The guest returns to the join card with an honest message. If the host process
crashes without that notice, the guest can rejoin from the invite URL.

## Hints

Hints use the deterministic Hard search and add a reason read from the position:
checkmate, no-legal-reply, capture, check, escaping check, or a developing move. They
are available in local and AI games. LAN play disables undo and hints for both seats so
neither side gets an information advantage.
