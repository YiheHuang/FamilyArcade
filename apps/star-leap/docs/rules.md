# Rules, data and how this app verifies them

This is the audit trail for **Star Leap / 星跃** (v0.2). Every rule should have a code
location and a test.

## Rule set

Star Leap is a family implementation of **Chinese Checkers** (traditional, public
domain). The board, move rules and scoring are implemented from public descriptions;
the five-line summary and the “home marbles stay” house rule are our own wording.

| Rule | Implementation | Test |
| --- | --- | --- |
| 2–4 players, ten marbles each | `setup()` in `src/game/engine.ts`; `START_MARBLES` | `tests/engine.test.ts` setup |
| 121-hole star: rows 1,2,3,4,13,12,11,10,9,10,11,12,13,4,3,2,1 | `src/game/board.ts` `HOLES`, `ROW_LENGTHS` | `tests/board.test.ts` |
| Six 10-hole triangles + 61-hole centre | `TRIANGLES`, `CENTRAL` | `tests/board.test.ts` |
| A step moves to an adjacent empty hole | `movesForMarble()` step branch | `tests/engine.test.ts` |
| A jump hops over one adjacent marble into the empty hole beyond | `JUMP` table + `movesForMarble()` jump branch | `tests/board.test.ts`, `tests/engine.test.ts` |
| Chain jumps are allowed; the player may stop anywhere | DFS in `movesForMarble()` | `tests/engine.test.ts` chain test |
| A marble that reaches its target triangle stays there | `movesForMarble()` filter | `tests/engine.test.ts` |
| First to fill the opposite triangle wins | `isHome()`, `applyUnchecked()` | `tests/engine.test.ts` win test |
| Ranking: most marbles home, then shortest distance, then seat | `ranking()`, `distanceSum()` | `tests/engine.test.ts` ranking test |
| Stalemate after 80 turns without a marble entering home | `STALEMATE_TURNS` | `tests/engine.test.ts` stalemate test |
| Hard cap: 300 moves | `MAX_MOVES` | `tests/engine.test.ts` cap test |
| 2/3/4-player start triangles and opposite targets | `START_TRIANGLES`, `targetTriangle()` | `tests/board.test.ts` |

## Board data

The star is generated, not hand-drawn:

- 17 rows with lengths `1,2,3,4,13,12,11,10,9,10,11,12,13,4,3,2,1`.
- Holes sit on a triangular lattice (row spacing `sqrt(3)/2`, half-offset rows).
- Adjacency is “distance 1”; `JUMP[a][b]` is the hole directly beyond `b` from `a`.
- Triangles: top (rows 0–3), bottom (rows 13–16), and the four side tips (10 holes each).
- Centre: the remaining 61 holes.
- Start triangles:
  - 2 players: top / bottom.
  - 3 players: top / lower-right / lower-left.
  - 4 players: top / upper-right / bottom / lower-left.
- Each player’s target is the opposite triangle (`OPPOSITE` in `board.ts`).

`tests/board.test.ts` checks counts, disjointness, symmetry, jump geometry and target
mapping. `npm run data:verify` is intentionally not separate: the board is generated,
so the tests are the data check.

## Move validation

`apply(state, move)`:

1. Rejects if the game is over, or the move is from the wrong seat.
2. Rejects a pass if any legal move exists.
3. Rejects a landing hole that is occupied.
4. Finds the exact `from → to` path among `legalMoves(state, seat)`; if not present,
   returns `illegal-move`.
5. Applies the move, updates `noProgress`, checks win/stalemate/cap, and advances turn.

Error codes: `game-over`, `not-your-turn`, `no-marble`, `illegal-move`, `occupied`,
`pass-not-allowed`, `no-legal-moves`, `bad-seat`, `bad-config`. UI translates them with
`src/i18n.ts` (`error.*`).

## Determinism and replay

- The engine has no clock, network, DOM or bare randomness.
- `serialize()` stores the full state with `version: 1`; `deserialize()` validates the
  board length and seat config.
- `replay(config, moves)` reconstructs a game move by move.
- `tests/simulation.test.ts` plays 60 random games and 2 AI-vs-AI games to completion,
  checking marble counts and the 300-move cap.

## AI

- Four levels: `companion`, `easy`, `normal`, `hard` (`src/game/types.ts`).
- AI only uses the public state; there is no hidden information.
- `companion` removes the opponent term and adds noise; it still advances its own
  marbles.
- `normal` orders up to 12 candidate moves and scores each with one opponent reply
  (up to 8 candidates); the app gives it a 300 ms cap.
- `hard` orders up to 20 candidates with one reply (up to 12 candidates) and no random
  noise; the app gives it an 800 ms cap.
- AI runs in `src/ai/worker.ts`; the UI uses `src/ai/client.ts`.
- `tests/ai.test.ts` checks legal moves, determinism with a seed, turn ownership and
  the hint.
- `npm run calibrate` runs 200 seeded self-play games per match-up; the method, table
  and caveats live in [`ai-calibration.md`](ai-calibration.md).

## Known rule choices

These are house rules, not claims about every Chinese Checkers variant:

1. **Home marbles stay.** Once a marble enters its target triangle it may step within
   that triangle but cannot leave. This prevents endless shuffling and shortens games.
2. **First finisher wins.** Other players are ranked by progress; the game does not
   continue for second place.
3. **Stalemate/cap.** 80 turns without progress, or 300 total moves, ends the game by
   progress ranking.
4. **4-player start triangles.** Top / upper-right / bottom / lower-left; the other two
   triangles stay neutral.

## LAN rule

The rules do not change over the network. The host owns the authoritative
`GameState`; a guest only sends `{ from, to }` (or a pass intent) for their own
seat. The host looks the move up in `legalMoves(state, seat)`, applies it with
`apply()`, and sends each guest `viewFor(state, seat)` (for this perfect-information
game, the full state). Guests cannot move out of turn, forge a path, undo or hint.
Every selected guest seat must be connected before the host starts. There is no
hidden information in Chinese Checkers, so every guest could technically see the
whole board; the host still sends per-seat views to keep the protocol ready for
hidden-information games.

## Sources

- Traditional Chinese Checkers rules, as described by public rule pages and common
  family sets (board shape, 10 marbles, step/jump/chain, opposite triangle).
- No copyrighted rulebook text, board art or piece design is reproduced; the board,
  colours, marks and UI are original code-drawn work.
- “Chinese Checkers” is a generic name for a traditional game; “Star Leap / 星跃” is an
  original working title.
