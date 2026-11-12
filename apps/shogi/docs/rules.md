# Shogi · rule audit

Every implemented rule has code, a test and an edge case. The engine lives in
`src/game/shogi.ts` and has no DOM, clock, network or `Math.random` dependency. The
suite has **27 tests** covering movement, promotion, drops, check, mate, repetition,
seats, views, attack detection, AI and hints.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board is 9×9 and starts with 40 pieces. | `setup()` | “sets up the traditional 9×9 position with Black to move” |
| R2 | Black moves first; sides alternate. | `setup('b')`, `apply()` | same, and “alternates turns, rejects occupied squares and bad shapes” |
| R3 | Pawns, lances, knights, silvers, golds, bishops, rooks and kings move by their shogi patterns. | `stepsFor()`, `targetsFor()` | “moves silver, gold, knight, lance, rook and bishop correctly” |
| R4 | Promoted rooks and bishops gain king-style steps. | `stepsFor()` | “gives promoted rooks and bishops their extra steps” |
| R5 | Promotion is legal only when the move starts or ends in the last three ranks. | `promotionOptions()` | “offers promotions only inside or into the last three ranks” |
| R6 | A promotable piece may promote or stay unpromoted; `apply` stores the choice. | `promotionOptions()`, `apply()` | same |
| R7 | Pawns and lances must promote on the last rank; knights on the last two. | `mandatoryPromotion()` | “forces promotion for pawn, lance and knight when they would be stuck” |
| R8 | A captured promoted piece reverts and joins the mover’s hand. | `makeMoveUnchecked()` | “returns captured pieces to the hand and reverts promotion” |
| R9 | A hand piece can be dropped on an empty legal square instead of moving. | `canDrop()`, `pseudoMoves()` | “drops a captured piece, removes it from hand and passes the turn” |
| R10 | Nifu: no two unpromoted pawns of one side on a file. | `nifu()` | “enforces nifu and the pawn, lance and knight drop ranks” |
| R11 | Pawns and lances cannot be dropped on the last rank; knights not on the last two. | `canDrop()` | same |
| R12 | A drop may block a check, and must leave the king safe. | `legalMoves()` | “can block a check with a drop” |
| R13 | Uchifuzume: a pawn drop that is immediate checkmate is illegal. | `givesPawnCheck()`, `hasAnyLegalMove()` | “rejects a pawn drop that is immediate checkmate (uchifuzume)” |
| R14 | A pawn drop that gives check is legal when the king can answer. | `legalMoves()` | “allows a checking pawn drop when the king can answer” |
| R15 | A side may not leave or move its king into check; pinned pieces cannot expose it. | `kingSafeAfter()` | “detects check and forbids moving a pinned piece” |
| R16 | Checkmate ends the game and further moves are rejected. | `apply()` | “delivers checkmate and refuses further moves” |
| R17 | A side with no legal move loses. | `hasAnyLegalMove()`, `apply()` | “ends the game when a move leaves the opponent with no legal move” |
| R18 | Fourfold repetition is a draw. | `positionKey()`, `positionCounts` | “declares a draw on the fourth occurrence of a position” |
| R19 | `apply` never mutates its input. | `apply()` | “does not mutate the state passed into apply” |
| R20 | Seat 0 is Black, seat 1 is White; each seat sees the public board and hand. | `applySeat()`, `view()` | “enforces seats and exposes the correct side to move” |
| R21 | A LAN view round-trips into a state with the same legal moves. | `stateFromView()` | “round-trips a seat view for LAN clients” |
| R22 | Attack detection sees all piece types and respects blocking. | `isSquareAttacked()` | “sees pawn, knight, lance, gold, silver and sliding attacks” |
| R23 | Every AI level returns a legal move; Hard is deterministic under an injected RNG. | `chooseMove()` | “returns only legal moves at every level”, “is deterministic with the same injected RNG” |
| R24 | Companion, Normal and Hard take mate in one. | `chooseMove()` | “takes mate in one on Companion, Normal and Hard” |
| R25 | A hint is legal and explains mate, capture, promotion, drop, defence or development. | `hintFor()` | “offers a legal hint and explains a mate” |
| R26 | No AI or hint move is produced after the game ends. | `chooseMove()`, `hintFor()` | “never chooses a move when the game is over” |

## Scoring and record

There is no point score. Checkmate wins; a side with no legal move loses; fourfold
repetition draws. The family record stores games, Black wins, White wins, draws, the
current same-winner run, the best run, a per-mode split and the eight most recent
results in `localStorage`.

## LAN

The host owns the authoritative state. The guest receives `view(state, 1)` and may send
only `{ type: 'move', move, moveCount }`. `applySeat` re-checks the seat, turn, game
status and the full move legality on the host. A stale `moveCount` or spoofed intent is
ignored. Both hands and the full move list are public information in shogi, so no hidden
information is exposed.

If a guest reloads, the reconnect token restores the seat. The host resends `start` and
the live view. Only the host gets a **Play again** button; the guest result banner waits
for the host. When the host leaves, it sends `result {kind:'closed'}` before closing.

## Hints

Hints use the same Hard search and add a reason read from the position: mate in one,
capture a piece, promote, drop, answer a check, or improve the position. Hints and undo
are local/AI only; LAN games disable both so neither seat gains an information
advantage.

## Deliberate simplifications

- Impasse (`jishogi`) declaration and the 27-point rule are not implemented. Fourfold
  repetition is a draw.
- Perpetual check is treated as ordinary fourfold repetition, not as an automatic loss
  for the checking side.
- Handicap games, two-piece exchange and competitive clock rules are not included.
