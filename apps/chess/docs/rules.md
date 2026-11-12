# Chess · FIDE rule audit

The engine lives in `src/game/chess.ts`. It is pure TypeScript: no DOM, network,
clock or `Math.random`. It is validated by 37 unit tests, FEN round-trips and
known perft counts (starting position, Kiwipete and position 3).

Squares are indexed `0..63` from `a8` (top-left) to `h1` (bottom-right), matching
the rendered board. White starts on ranks 1–2, Black on ranks 7–8.

| # | FIDE rule | Code | Test evidence |
| --- | --- | --- | --- |
| R1 | 8×8 board; standard initial array; 32 pieces | `setup()` / `fromFen()` | “sets up the standard 32-piece position…” |
| R2 | White moves first; players alternate | `apply()` / `makeMove()` | same test; “alternates turns…” |
| R3 | Pawn: one forward, optional two from its start rank, diagonal capture | `pseudoMoves()` / `pushPawnMove()` | “allows a pawn double push but not a triple push” |
| R4 | Knight jumps in an L; blocked squares irrelevant | `pseudoMoves()` | “moves knights over pieces and blocks bishops…” |
| R5 | Bishop slides diagonally; rook orthogonally; queen both | `pseudoMoves()` | “finds sliding moves and captures for a queen” |
| R6 | King moves one square | `pseudoMoves()` | “does not let a king step into an attacked square” |
| R7 | A move may not leave your own king in check (pins, king safety) | `leavesKingInCheck()` | “does not let a pinned rook leave the pin line”; king test |
| R8 | Check is an attack on the king | `isAttacked()` / `makeMove()` | “detects check” |
| R9 | Castling: king two squares, rook jumps; empty path; unmoved king and rook; king may not start, pass through or land in check | `pseudoMoves()` castling block | “castles on both sides and moves the rook”; “does not castle through an attacked square”; “does not castle with a piece in the way” |
| R10 | Castling rights are lost when the king moves, the rook moves, or the original rook is captured | `makeMove()` rights update | “loses castling rights after the king or rook moves, or a rook is captured” |
| R11 | En passant: only immediately after a two-square pawn push; captured pawn removed from its square | `pseudoMoves()` / `placeMove()` | “captures en passant and removes the passed pawn”; “expires the en passant right after one move” |
| R12 | Promotion to queen, rook, bishop or knight, including capture-promotion | `pushPawnMove()` / `placeMove()` | “offers all four promotions…”; “supports a capture promotion” |
| R13 | Checkmate: side to move is in check and has no legal reply | `apply()` replies | “ends in Fool’s Mate”; “detects a checkmate position from FEN” |
| R14 | Stalemate: side to move is not in check and has no legal move | `apply()` replies | “detects stalemate” |
| R15 | Fifty-move rule: 100 half-moves without a pawn move or capture | `halfmove` / `apply()` | “draws on the fifty-move rule” |
| R16 | Threefold repetition: same position (pieces, side, castling, legal en passant) three times | `positionKey()` / `positions` | “draws on threefold repetition” |
| R17 | Insufficient material: no possible mate | `insufficientMaterial()` | “draws on insufficient material” |
| R18 | Checkmate on the 100th half-move takes priority over a fifty-move draw | `apply()` ordering | “makes checkmate take priority over the fifty-move counter” |
| R19 | Algebraic notation with capture, promotion, check, mate and disambiguation | `sanFor()` | “writes SAN disambiguation for two knights”; record test |
| R20 | FEN parse/serialise for setup, tests and saved positions | `fromFen()` / `toFen()` | “round-trips FEN with castling and an en passant square” |
| R21 | Legal move generation matches published perft counts | `legalMoves()` / `perft()` | “matches Kiwipete and position-3 perft counts” |
| R22 | Seat 0 is White, seat 1 is Black; each seat sees its own permission; host rejects wrong turns and stale intents | `applySeat()` / `view()` | “gives each seat a public view…”; “enforces seat, turn, staleness…” |
| R23 | AI only chooses legal moves | `chooseMove()` | “returns a legal move at every level” |
| R24 | Hard finds mate in one and searches with alpha-beta | `searchRoot()` / `negamax()` | “finds mate in one on Hard” |
| R25 | Same state + level + RNG sequence produces the same move | `chooseMove(state, level, rng)` | “is deterministic…” |
| R26 | Hints are legal and explain a mate/capture/etc. reason | `hintFor()` | “explains a mating hint”; “explains a capture hint” |
| R27 | Family record stores result, mode, level, move count and streak | `addResult()` | two storage tests |

## Draw claims

FIDE treats the fifty-move rule and threefold repetition as claimable draws. This
family implementation **claims them automatically** when the engine detects them,
so a game can always finish without a claim dialog. That simplification is
documented in [`limitations.md`](limitations.md). Checkmate always wins first.

## Scores

There is no points system or ELO. The family record stores games, White wins,
Black wins, draws, mode (computer / hot-seat / local network), level for computer
games, move count, date, current streak and best streak. All data stays in
`localStorage` on the device that finished the game; a LAN game is recorded on the
host only.

## LAN

The host owns the state. The guest receives `view(state, 1)` containing the public
board, move record and legal moves for its turn. The guest can send only
`{type:'move', from, to, promotion?, moveCount}`. The host revalidates with
`applySeat(state, seat, move, moveCount)`: wrong seat, wrong turn, stale move count
and illegal moves are rejected. There is no hidden information in chess, so the
seat view is a convenience and an authority boundary, not a card-hiding device.

## Engine guarantees

- No `Date`, `performance`, `localStorage`, `fetch`, DOM or `Math.random` in
  `src/game/chess.ts`.
- AI receives an injected RNG; tests use a fixed sequence.
- Board copies are immutable; `apply` never mutates its input.
- `makeMove` is a fast search primitive; public UI moves go through `apply`.
