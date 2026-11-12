# Quarto · rule audit

This is standard two-player Quarto: a 4×4 board, 16 unique pieces, four binary
attributes, and a gift-and-place turn. The engine lives in `src/game/quarto.ts` and
uses no DOM, clock, network or `Math.random`. The unit suite has **31 tests** covering
the engine, the four AI levels and hints; `scripts/lan-e2e.mjs` covers the LAN flow.

## The pieces

A piece is a 4-bit number:

| Bit | Attribute | Values |
| --- | --- | --- |
| 0 | Color | light / dark |
| 1 | Shape | round / square |
| 2 | Height | short / tall |
| 3 | Top | solid / hollow |

All 16 combinations exist exactly once. `ALL_PIECES` is `0..15`; `bit(piece, attribute)`
reads one attribute. There are no duplicate or missing pieces.

## Turn state machine

A turn is two actions, not one:

1. The player to move **chooses** any remaining piece and hands it to the opponent.
2. The opponent **places** that piece on any empty square.
3. The player who placed now chooses the next piece for the opponent.

The engine records this with `phase: 'choose' | 'place'` and `turn: 0 | 1`. The player
who chooses is the current `turn`; after choosing, `turn` flips and `phase` becomes
`place`. After placing, `turn` stays the same (the placer becomes the next chooser) and
`phase` returns to `choose`. The first player therefore begins by giving a piece, not by
placing one.

## Rule audit

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | 16 unique pieces, four binary attributes. | `ALL_PIECES`, `bit()` | “sets up sixteen unique pieces…”, “keeps the 16 pieces distinct…” |
| R2 | The board is 4×4 and starts empty. | `setup()` | “sets up sixteen unique pieces and an empty board” |
| R3 | The first player chooses a piece for the opponent. | `setup()` | same |
| R4 | A chosen piece leaves the pool and is marked as selected. | `applyAction()` choose branch | “chooses a piece, flips the turn and moves to placement” |
| R5 | The opponent places the selected piece on an empty square. | `applyAction()` place branch | “places the chosen piece and hands the next choice to the placer” |
| R6 | The placer then chooses the next piece. | `applyAction()` | same |
| R7 | Used, malformed or off-board pieces are rejected. | `piece-used`, `bad-piece` | “rejects a used or malformed piece” |
| R8 | Placement without a selected piece, on a full square or off the board is rejected. | `no-piece`, `occupied`, `bad-cell` | “rejects placement without a piece…” |
| R9 | A quarto is four filled squares in a row, column or diagonal sharing at least one attribute. | `quartoOnBoard()` | “detects rows, columns and diagonals” |
| R10 | A line may share more than one attribute; all are reported. | `quartoOnBoard()` | “reports every shared attribute, not just the first” |
| R11 | Four pieces with no shared attribute are not a quarto. | `quartoOnBoard()` | “does not call a line with no shared attribute a quarto” |
| R12 | The player who places the fourth piece wins, including on the 16th placement. | `applyAction()` | “ends the game when a placement makes a quarto”, “lets a quarto on the sixteenth piece beat the full-board draw” |
| R13 | The game ends immediately and rejects later actions. | `status`, `game-over` | “rejects any action after the game is over” |
| R14 | A full board with no quarto is a draw. | `applyAction()` | “draws when the sixteenth piece fills the board…” |
| R15 | Seat 0 is Player 1 and seat 1 is Player 2; a seat may only act on its turn. | `applySeat()` | “enforces the seat whose turn it is” |
| R16 | Each seat receives the public position and its own `canAct`. | `view()` | “gives each seat a public view…” |
| R17 | Applying or viewing never mutates the previous state. | `applyAction()`, `view()` | “never mutates the state passed into applyAction or view” |
| R18 | Legal actions match the current phase. | `legalActions()` | “offers only empty squares in the placement phase” |
| R19 | The AI returns only legal actions and is deterministic with the same injected RNG. | `chooseAction()` | AI tests |
| R20 | Hard and Companion take an immediate win and avoid an immediate gift when a safe piece exists. | `chooseAction()` | AI tests |
| R21 | A hint is legal and explains a win, a safe gift, a forced gift or a quiet move. | `hintFor()` | hint tests |
| R22 | A LAN intent is re-checked against the host state, including a stale action count. | `applySeat()` / host intent handler | `scripts/lan-e2e.mjs` |

## Multiple shared attributes

A line of four pieces can share two, three or even four attributes. The game does not
need a “double quarto” declaration; any shared attribute ends the game. The state keeps
the full `attributes` array so the result banner can say, for example, “light and solid”.
The optional double-quarto scoring variant is not used.

## Draws

The 16th placement fills the final square. If it creates a quarto, the placer wins; if
not, the game is a draw. The test uses a full-board permutation in which every row,
column and diagonal mixes every attribute, so no earlier placement could have ended the
game.

## AI

Four levels, all with the injected `rng`:

- **Companion** — tactical and gentle. It takes an immediate win, never hands over a
  piece that wins immediately when a safe piece exists, and otherwise prefers the
  placement that leaves the most safe pieces. It does not build deep traps.
- **Easy** — often random, otherwise greedy. A useful first opponent for children.
- **Normal** — a four-ply search with a 14,000-node budget and an occasional (12%)
  random action.
- **Hard** — iterative deepening from 2 to 8 plies, alpha-beta, a 70,000-node budget,
  and a **forced-piece filter**. At a choose node, unsafe gifts (pieces that let the
  opponent win on the next placement) are removed when any safe gift exists. At a place
  node, an immediate winning square is taken. The evaluator counts the chooser’s safe
  pieces; a position with none is treated as a forced loss.

The search is deterministic for a given state, level and RNG. The engine itself never
uses randomness.

## Hints

`hintFor()` runs the Hard search and then names the reason from the position: `win`,
`avoid` (a safe gift when another piece would lose), `forced` (every remaining piece is
unsafe), `setup` (the placement creates a line threat), `quiet`, `open` or `balance`.
Hints and undo are disabled in LAN games so neither seat gets an information advantage.

## LAN

The host owns the authoritative state. The guest receives `view(state, 1)`, which
contains the public board, pool, selected piece, phase, turn, result and `canAct`. A guest
intent is `{type:'choose', piece}` or `{type:'place', cell}` plus `actionCount`; the host
rejects a stale count and then re-checks the seat, phase, piece and square with
`applySeat()` and `applyAction()`. There is no hidden information in Quarto, so both seats
see the same position.

## Family record

No score is kept during play. The local record stores games, Player 1 wins, Player 2
wins, draws, the current and best same-result run, a per-mode split (computer, hot-seat,
LAN) and the eight most recent results. A LAN result is recorded on the host device only.
