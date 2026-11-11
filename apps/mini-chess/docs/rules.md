# Mini Chess · rule audit

Mini Chess is an original 5×6 chess variant. The pure engine lives in
`src/game/chess.ts`; it has no DOM, clock, network or `Math.random` dependency.
The AI lives in `src/ai/ai.ts` and takes an injected RNG. The suite in
`tests/game.test.ts` has **42 tests**.

## Board model

- Five files (`a`–`e`) by six ranks (`1`–`6`), 30 squares.
- Row 0 is rank 6 (Black's home rank); row 5 is rank 1 (White's home rank).
- `index = row * 5 + col`; `squareName(0) = "a6"`, `squareName(25) = "a1"`.
- White pawns move toward row 0; Black pawns move toward row 5.
- State is immutable: every move returns a new `GameState`.

## Starting array

```
rank 6   r n b k r
rank 5   p p p p p
rank 4   . . . . .
rank 3   . . . . .
rank 2   P P P P P
rank 1   R N B K R
```

Each side has 10 pieces: king, two rooks, one knight, one bishop, five pawns.
There are no queens in the variant.

## Rule audit

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | 5×6 board, 30 squares, 20 starting pieces. | `setup()` | “builds a 5×6 board…” |
| R2 | Compact army: K, 2R, N, B, 5P each; no queen. | `setup()` | “uses the compact army…” |
| R3 | White moves first; turns alternate. | `setup()` `apply()` | “alternates turns…” |
| R4 | Twelve legal opening moves. | `legalMoves()` | “offers twelve opening moves…” |
| R5 | Pawn steps one forward; two only from its starting rank. | `pseudoMoves()` | “allows the double pawn step…” |
| R6 | A blocked pawn cannot move or capture forward. | `pseudoMoves()` | “blocks a pawn behind…” |
| R7 | Pawns capture diagonally, never straight ahead. | `pseudoMoves()` | “captures diagonally…” |
| R8 | Knight moves in an L and jumps. | `pseudoMoves()` | “moves the knight…” |
| R9 | Bishop slides diagonally until a blocker. | `pseudoMoves()` | “slides the bishop…” |
| R10 | Rook slides orthogonally until a capture. | `pseudoMoves()` | “slides the rook…” |
| R11 | King moves one square and may not enter attack. | `isSquareAttacked()` | “never lets a king step…” |
| R12 | A pinned piece may not expose its king. | `legalMoves()` | “freezes a pinned rook…” |
| R13 | Every legal reply must answer a check. | `legalMoves()` | “requires every legal reply…” |
| R14 | Illegal moves are rejected, not silently fixed. | `apply()` | “rejects a move that would expose…” |
| R15 | Pawn promotes to rook, bishop or knight; default rook. | `apply()` | “offers … promotion…” |
| R16 | Queens are rejected by the engine and FEN parser. | `apply()` `fromFen()` | “defaults a promotion…” |
| R17 | Check is detected and noted with `+`. | `isInCheck()` `notationFor()` | “detects check…” |
| R18 | Checkmate wins and blocks further moves. | `apply()` | “finds checkmate…” |
| R19 | Checkmated FEN positions parse as checkmate. | `fromFen()` | “parses a checkmated position…” |
| R20 | Stalemate is a draw without check. | `apply()` `fromFen()` | “detects stalemate…” |
| R21 | Fifty quiet moves (100 plies) draw automatically. | `apply()` | “draws by the fifty-move rule…” |
| R22 | Bare kings plus a single minor draw. | `insufficientMaterial()` | “draws with insufficient material…” |
| R23 | Halfmove and fullmove counters update. | `apply()` | “keeps fullmove and halfmove…” |
| R24 | Captures are exposed in a per-colour tray. | `view()` | “captures material into…” |
| R25 | Seat 0 is White, seat 1 is Black; wrong seat/turn rejected. | `applySeat()` | “enforces seat ownership…” |
| R26 | Per-seat view includes colour, check, legal moves, last move. | `view()` | “gives each seat its own colour…” |
| R27 | Bad squares, empty squares, illegal moves and bad promos error. | `apply()` | “reports bad squares…” |
| R28 | FEN round-trips and rejects malformed boards/queens. | `fromFen()` `toFen()` | “round-trips…” / “rejects bad FEN…” |
| R29 | The engine never mutates its input. | all functions | “does not mutate the state…” |
| R30 | AI returns only legal moves on all four levels. | `chooseMove()` | “returns a legal move…” |
| R31 | Hard finds mate in one. | `searchRoot()` | “finds mate in one…” |
| R32 | Normal and Hard take a hanging rook. | `evaluateBoard()` | “takes a hanging rook…” |
| R33 | AI is deterministic with the same injected RNG. | `chooseMove()` | “is deterministic…” |
| R34 | Easy is uniform over legal moves with a fixed RNG. | `chooseMove()` | “lets easy pick uniformly…” |
| R35 | Companion avoids early checks. | `companionMove()` | “makes the companion avoid…” |
| R36 | Hints explain mate and capture reasons. | `hint()` | “explains a mating hint…” / “explains a capture hint…” |
| R37 | AI does not mutate the position while thinking. | all AI | “does not mutate the position…” |
| R38 | A full random game reaches a terminal result. | `apply()` | “plays a complete random game…” |

## Deliberate simplifications

These are documented, not accidental:

- **No castling.** The compact back rank puts the king on d1/d6 with rooks on the
  wings; there is no safe two-square castling geometry on five files.
- **No en passant.** The variant's pawn game is deliberately simple.
- **No threefold-repetition draw or draw agreement.** The engine auto-draws on
  the fifty-move rule and on insufficient material instead.
- **Fifty-move draw is automatic**, not claim-based.
- **No chess clock, resignation or arbiter.** The game ends on the board.
- **FEN is a test/debug format**, not a tournament interchange format. It sets up
  mate/stalemate but does not auto-apply material or fifty-move draws on parse.

All of these are repeated honestly in [`limitations.md`](limitations.md).

## Scoring and family record

No points are counted during play. A finished local or AI game increments one of
White wins / Black wins / Draws in `localStorage`. The record also stores the
current streak. LAN games are not added to the local record because they belong
to the two devices that played them. Undo is disabled after a terminal position,
so a finished game cannot be recorded twice.

## LAN

The relay in `packages/lan` is a dumb message bus. The host holds the only
`GameState`; the guest receives `view(state, 1)` and sends only:

```ts
{ type: 'move', from: number, to: number, promotion?: 'R' | 'B' | 'N' }
```

`applySeat` re-checks:

- the sender's seat (0 = White, 1 = Black),
- the turn,
- the source piece and owner,
- the geometry and any promotion choice,
- that the mover's king is not left in check.

A stale, spoofed or illegal intent is rejected without changing the host state.
The guest is Black; the board is rotated 180° for them. Chess is perfect
information, so the per-seat view contains the full board and move list, plus
that seat's legal-move list.

## AI design

- **Material:** pawn 100, knight 320, bishop 340, rook 500, king 0.
- **Piece-square tables** for all five piece types, mirrored for Black.
- **Pawn structure:** doubled and isolated pawn penalties; bishop pair bonus.
- **Hard:** negamax alpha–beta at depth 5, capture/promotion ordering, and a
  quiescence search that also searches all evasions when in check.
- **Normal:** depth 2, with a small chance of a random legal move.
- **Easy:** uniform random legal move.
- **Companion:** depth-1 evaluation, avoids giving check for the first ten plies,
  avoids walking into mate in one, and adds RNG noise so it is gentle and varied.
- Mate scores are `100000 - ply`, so shorter mates are preferred. Ties use the
  injected RNG where applicable.

## Verification

```bash
npx tsc --noEmit
npx vitest run          # 42 tests
npm run check           # tsc + tests + vite build
node scripts/e2e.mjs    # dev server at :5198
node scripts/shots.mjs  # 10 screenshots per language
node scripts/e2e-lan.mjs # optional: relay on :8098, dev at :5198
```

The AI search is intentionally single-threaded and synchronous inside the pure
module; the React layer schedules it after a short delay and shows a thinking
state. Hard is roughly one second per move from the opening on the reference
machine.
