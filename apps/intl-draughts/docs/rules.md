# International Draughts · rule audit

Every rule below has code, a unit test and at least one edge case. The engine
lives in `src/game/intl-draughts.ts` and has no DOM, network, clock or
`Math.random` dependency.

Board indexing: 100 cells, `index = row * 10 + col`, row 0 at the top. Only
dark squares `(row + col) % 2 === 1` are used. White men start on rows 6–9,
black men on rows 0–3, and White moves first.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board is 10×10 with exactly 50 playable dark squares. | `setup()`, `isDark()` | “sets up 20 men each on 50 dark squares…” |
| R2 | Each side starts with 20 men on its four home rows. | `setup()` | same |
| R3 | White moves first. | `setup('W')` | same |
| R4 | A man moves one square diagonally forward only. | `simpleMovesFrom()` | “offers the nine standard White opening moves”, “does not let men move backwards…” |
| R5 | A man captures by jumping an adjacent enemy into the empty square beyond. | `jumpOptions()` | “forces a capture when a quiet move is also available” |
| R6 | Men may capture forwards and backwards. | `jumpOptions()` | “lets men capture backwards as well as forwards” |
| R7 | Capturing is mandatory when any capture exists. | `legalMoves()` | “forces a capture when a quiet move is also available” |
| R8 | When several captures exist, only the sequences taking the maximum number of pieces are legal. | `legalMoves()` | “keeps only capture sequences with the maximum number of pieces” |
| R9 | Equal-length maximum sequences are all legal; the player chooses. | `legalMoves()` | “keeps every equal-length maximum capture as a legal choice” |
| R10 | A multi-capture continues with the same piece until no jump remains. | `captureSequencesFrom()` | “plays a three-piece chain and never captures a square twice” |
| R11 | Captured pieces stay on the board until the whole move ends, so they block later jumps and cannot be captured twice. | `captureSequencesFrom()` uses a captured set and the unchanged board | “keeps only capture sequences…”, “turns a corner during a flying-king multi-capture” |
| R12 | A king moves any distance along an empty diagonal. | `simpleMovesFrom()` | “flies any distance along an empty diagonal” |
| R13 | A king captures a distant piece and may land on any empty square beyond it. | `jumpOptions()` | “captures a distant piece and may land on any empty square beyond it” |
| R14 | A king may turn corners between jumps in a multi-capture. | `captureSequencesFrom()` | “turns a corner during a flying-king multi-capture” |
| R15 | A king cannot jump over its own piece or a captured piece. | `jumpOptions()` | “cannot jump over its own piece to reach a piece behind it” |
| R15b | A second piece immediately behind a target leaves no landing square, so the jump is illegal. | `jumpOptions()` | “cannot capture a piece when another piece leaves no landing square” |
| R16 | A man that finishes a move on the far row becomes a king. | `simpleMovesFrom()`, `advance()` | “crowns a man that finishes a quiet move on the far row” |
| R17 | Passing through the far row during a capture does not crown a man. | `captureSequencesFrom()` keeps the piece a man while recursing | “does not crown a man that only passes through…” |
| R18 | A man that ends a capture on the far row is crowned. | `promote` on the completed Move | “crowns a man that ends a capture on the far row” |
| R19 | The opponent loses when every piece has been captured. | `advance()` `winReason: 'all-captured'` | “wins by capturing every opposing piece” |
| R20 | The opponent loses when it still has pieces but no legal move. | `advance()` uses `hasAnyMove()`; `winReason: 'blocked'` | “wins by blocking an opponent that still has pieces” |
| R21 | 25 moves by each side without a capture or a man move is a draw. | `QUIET_LIMIT = 50` half-moves | “draws after 25 moves each without a capture or a man move” |
| R22 | The quiet counter resets on any man move or capture. | `advance()` | “resets the quiet counter on a man move and on a capture” |
| R23 | Threefold repetition is a draw. | `positionKey()` and `repetitions` | “draws on threefold repetition” |
| R24 | A 500-ply ceiling is a draw. | `MAX_PLIES = 500` | “draws at the 500-ply ceiling” |
| R25 | A finished game rejects further moves. | `apply()`, `applyPath()` | “rejects … a finished game” |
| R26 | Seat 0 is White, seat 1 is Black, and each may move only on its turn. | `applySeat()` | “enforces the seat colour and the turn on the host” |
| R27 | A guest view carries only its own legal moves and `canMove`. | `view()` | “gives seat 1 a public view…” |
| R28 | The AI only chooses legal moves and is deterministic with an injected RNG. | `chooseMove(state, level, rng)` | “returns a legal move for every level”, “is deterministic…” |
| R29 | Hints explain a tactical reason, not just a square. | `hintFor()` | “explains a long mandatory capture…”, “explains a promotion hint…” |
| R30 | A complete deterministic game from the opening reaches a terminal result with only legal moves. | full engine loop | “plays a full deterministic game…” |

## Scoring and record

No points are counted. A win is a win; the family record stores the result,
mode, AI level, ply count and date in `localStorage`. The record is local to the
device. A hosted LAN game is written on the host only; the guest keeps its own
separate record.

Draw reasons shown in the UI are:

- `quiet` — the 25-move king-only rule above;
- `repetition` — the same board and side to move appeared three times;
- `limit` — the 500-ply safety ceiling.

The last two and the ceiling are family-table conventions, not FMJD tournament
regulations. They keep very long browser games finite and are documented in
[`limitations.md`](limitations.md).

## LAN

The host owns the authoritative `GameState`. It sends `view(state, 1)` to the
guest after every move. A guest intent is:

```ts
{ type: 'move', from: number, path: number[], moveCount: number }
```

The host checks that `moveCount` equals the host's current `plies`, then calls
`applySeat(current, 1, from, path)`. `applySeat` re-checks the turn, the piece,
the complete landing path and the maximum-capture rule. A stale, spoofed or
illegal intent is ignored; it cannot mutate the host position.

The guest never receives a local restart control. Only the host starts a new
round. When the host closes the room, the guest returns to the join panel with
an honest “the host closed the room” message.

## AI notes

- **Companion** — 1-ply scoring with frequent safe random choices; takes an
  immediate win, otherwise leaves room for mistakes.
- **Easy** — 1-ply greedy, with a 30% chance of a legal random move and a 25%
  chance of missing an immediate win.
- **Normal** — 3-ply alpha-beta with capture quiescence and an 8% random move.
- **Hard** — 4-ply alpha-beta, rising to 6 ply when eight or fewer pieces
  remain; capture quiescence looks three forced captures ahead. It is strong
  but honest: no external engine, no tablebase and no hidden information.
- Every level receives its randomness through an injected `rng` function. The
  same position, level and seed produce the same move.
