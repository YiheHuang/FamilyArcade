# Hive · rule audit

The engine lives in `src/game/hive.ts` and has no DOM, clock, network or `Math.random`
dependency. Randomness is injected into the AI. The board is an axial hex grid keyed as
`q,r`; each occupied cell is a bottom-to-top stack, so a beetle can sit on another piece.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The base set has 22 pieces: per player one queen, three ants, two beetles, three grasshoppers, two spiders. | `PIECE_COUNTS`, `handCounts()` | “starts empty with eleven pieces in each hand and Amber first” |
| R2 | Amber starts; the first piece may be placed anywhere. | `setup('W')`, `isPlacementLegal()` | same |
| R3 | Onyx’s first piece must touch Amber’s first piece. | `placementTargets()`, `isPlacementLegal()` | “lets the first player open anywhere and the second player open beside it” |
| R4 | Later placements must touch one or more own pieces and must not touch an enemy piece. A mixed stack is treated as the colour of its top piece for this rule. | `placementTargets()`, `isPlacementLegal()` | “requires a new piece to touch your own hive and never an enemy”, “uses the top piece colour for placement next to a mixed stack” |
| R5 | Occupied cells, malformed coordinates and empty hands are rejected without mutation. | `apply()`, `validatePlacement()` | “rejects occupied cells, empty hands and malformed coordinates”, “does not mutate the state passed to apply” |
| R6 | The queen must be placed on or before the player’s fourth turn; no piece may move until the queen is on the board, and other placements and moves are blocked on the fourth turn until the queen is down. | `mustPlaceQueen()`, `turnNumber()`, `queenOnBoard()`, `legalMoves()`, `apply()` | “forces the queen onto the board on the fourth turn”, “does not let a piece move before the queen is placed” |
| R7 | The queen moves one adjacent empty space and may not squeeze through a closed gate. | `destinationsFor()`, `gateOpen()` | “moves the queen one space and respects a closed gate” |
| R8 | The hive must remain one connected group after every move; a move that splits it is rejected. | `isSingleHive()`, `destinationsFor()` | “rejects a move that would split the hive” |
| R9 | Freedom to move: a ground-level slide into an empty cell needs at least one of the two shared neighbouring cells to be open. For beetles the doorway is height-aware: both gate stacks must be no taller than the moving beetle’s travel plane. | `gateOpen()` | “moves the queen one space and respects a closed gate”, “slides an ant around the perimeter and blocks a sealed gap”, “blocks a beetle climb through a height-two gate” |
| R10 | The ant may travel any distance around the outer edge, never through a sealed gap and never off the perimeter. | `antReach()` | “slides an ant around the perimeter and blocks a sealed gap”, “lets an ant reach a distant edge space” |
| R11 | The spider moves exactly three distinct spaces around the edge; two or four spaces are not legal. | `spiderReach()` | “moves the spider exactly three spaces and no fewer”, “refuses a spider move when no three-step edge path exists” |
| R12 | The grasshopper jumps in a straight line over one or more contiguous pieces and lands on the first empty space; it never steps one cell. | `destinationsFor()` (`grasshopper`) | “makes the grasshopper jump a straight line of pieces”, “only jumps and never steps into an adjacent empty space” |
| R13 | The beetle moves one space on the ground or climbs onto the hive, including onto an enemy piece. The top piece is the only movable piece of a stack, and climbing uses the height-aware gate. | `destinationsFor()` (`beetle`), `topPiece()`, `gateOpen()` | “lets the beetle climb onto the hive and pin the piece underneath”, “blocks a beetle climb through a height-two gate” |
| R14 | A queen is surrounded when all six adjacent cells contain at least one piece. The surrounding move wins; a move that closes the last gap around your own queen loses. | `surroundedIn()`, `buildNext()` | “wins by moving the last piece around the enemy queen”, “loses when the move closes the last gap around your own queen” |
| R15 | A beetle on top of a queen pins it but does not itself count as one of the six surrounding sides. | `surroundCount()` | “does not count a beetle on top of the queen as one of the six sides” |
| R16 | A finished game rejects further moves and has no legal moves. | `apply()`, `legalMoves()` | “refuses moves after the game has ended” |
| R17 | Seat 0 is Amber, seat 1 is Onyx, and a seat may only move on its own turn. | `applySeat()` | “maps seats to Amber and Onyx and rejects the wrong turn” |
| R18 | Each seat gets a public view with its own seat and `canMove`. | `view()` | “gives each seat a public view with only that seat able to act” |
| R19 | A player with no placement or movement must pass. If both sides are shut out in succession, the game is a draw. | `normalMoves()`, `legalMoves()`, `apply()` (`pass`) | “forces a shut-out player to pass without changing the board”, “records a mutual shut-out draw” |

## Turn and win sequence

1. The first player places any piece anywhere. In the digital board the empty hive is
   centred on the origin; because Hive is translation-invariant, the seven offered
   opening cells represent “anywhere” without an infinite scroll.
2. The second player places any piece beside the first player’s first piece.
3. On each later turn, a player either places a new piece from hand or moves one top piece.
4. The queen must be placed by the player’s fourth turn. No piece may move until the
   queen is on the board; on the fourth turn, if it is still in hand, only a queen
   placement is legal.
5. After every move the remaining hive is checked for one connected group, and the move
   must leave the hive connected when the piece arrives.
6. If the enemy queen has all six sides occupied, the mover wins. If the mover’s own queen
   is surrounded and the enemy queen is not, the opponent wins.
7. A player with no legal placement or move must pass. If the opponent is also shut out,
   the game is a draw.

## AI

`chooseMove(state, level, rng)` never uses `Math.random`; callers inject an RNG.

- **Companion** — legal, gentle static choices with randomness and a safety filter.
- **Easy** — mostly random, occasional one-ply preference.
- **Normal** — two-ply ordered search plus a one-move safety filter.
- **Hard** — three-ply ordered alpha-beta with a bounded beam, immediate wins first and a
  one-move loss filter. It is strong but not solved.

`hintFor(state)` runs the Hard search and returns the move plus a reason kind (`win`,
`defend`, `queen`, or the piece type).

## Scores and record

There is no in-game score; the first surround wins, and a mutual shut-out is a draw. The
family record stores games, Amber wins, Onyx wins, draws, current and best same-winner
streaks, mode split and the eight most recent games in `localStorage` under
`familyarcade.hive.record`.

## LAN

The host owns the state. The guest receives `view(state, 1)` (Hive is perfect-information)
and may send only `{type: 'hive-move', move, moveCount}`. The host checks the seat, turn,
move-count freshness and `applySeat` legality again; a stale or spoofed intent is ignored.
The host sends the view after every accepted move and a result view when the queen falls.

## Edge cases

- **No legal fourth-turn queen placement.** The rulebook assumes a legal queen placement
  exists. In the pathological position where all own-adjacent cells touch an enemy, the
  engine does not deadlock: it allows the remaining legal moves and the queen can be placed
  later. This is documented in `docs/limitations.md`.
- **Both queens surrounded by one move.** The mover’s surround of the enemy queen takes
  precedence, matching “first to surround wins”.
- **Beetle on a queen.** The queen is pinned and cannot move until the beetle leaves, but
  the beetle is not one of the six surrounding pieces.
- **Stacks.** Only the top piece of a stack may move; the pieces underneath are revealed
  when the top piece climbs off. For placement adjacency a mixed stack takes the colour of
  its top piece.
- **Height-aware beetle gates.** A beetle climbing, crossing or descending compares its
  travel plane with the two neighbouring stacks. If both rise above that plane, the
  doorway is closed even though the beetle is on top of the hive.
- **Pass and shut-outs.** A player with no legal placement or movement must pass. If the
  opponent also has no legal move, the game is recorded as a draw. This is the app’s
  implementation of the agreed-draw escape from a permanent shut-out.
- **No repetition draw.** Repeated positions are not automatically adjudicated; players
  can continue, pass when shut out, or start a new game.
