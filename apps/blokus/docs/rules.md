# Rules, data and how this app verifies them

This document records the rule set the app implements, where the game data comes
from, and which tests guard each claim. It is the audit trail for the "rules and
data correctness" requirements.

## Rule set

**Base game: Blokus® (standard 4-player and the 2-player *Duo* variant) as
published by Mattel / Sekkoïa.**

| Rule | Implementation |
| --- | --- |
| 4 players, one corner each (top-left → blue, top-right → yellow, bottom-right → red, bottom-left → green) | `standard` variant, `cornersFor()` |
| 2-player *Duo*: 14×14 board, start corners at the top-left and bottom-right; the two spare corners may not be used for the opening move | `duo` variant, `cornersFor()`, `Game.illegalReason()` |
| The first piece must cover the player's own start corner (monomino allowed) | `Game.fits()` with `frontier === null` |
| Later pieces must touch at least one own piece **corner to corner**, and may **never** share an edge with an own piece | `Game.fits()`, tests in `tests/rules.test.ts` |
| Touching **opponents'** pieces anywhere (edge or corner) is allowed | `tests/rules.test.ts` ("允许与对手棋子边贴边") |
| A player who cannot place a piece must pass; the game ends after every remaining player passed consecutively | `consecutivePasses`, `Game.advanceTurn()` |
| Scoring: 1 point per placed square; **+15** when a player placed all 21 pieces, **+20** instead when the monomino was the last one | `Game.score()` |
| Ranking: total score desc, then fewer leftover pieces, then seat order (display only — the app never declares a single winner on a tie) | `Game.ranking()` |
| No hidden information in Blokus, so no information-asymmetry rules apply (marked N/A) | — |

The 21-piece set (12 pentominoes, 5 tetrominoes, 2 trominoes, 1 domino,
1 monomino = 89 squares) is defined in `src/game/pieces.ts` and cross-checked
against the published piece list; the generated orientation table
(91 distinct placements across the set after de-duplicating symmetric
orientations) is asserted in `tests/pieces.test.ts` and
`tests/orient.test.ts`.

## Sources consulted

- Sekkoïa / Mattel „Blokus" rulebook (4-player and Duo).
- The public piece inventory (12 pentominoes, 5 tetrominoes, 2 trominoes,
  1 domino, 1 monomino) as listed by the publisher and by Wikipedia's Blokus
  article — the set is *not* the complete pentomino family: the app's data file
  encodes exactly the published 21 pieces.
- Cross-check: `tests/pieces.test.ts` asserts the per-shape square counts
  (89 total) and the shape names/duplicates, so a typo in the data file fails
  the suite.

This is an unofficial fan implementation for family use; "Blokus" is a trademark
of its owner (see `CREDITS.md`).

## Determinism and randomness

- The engine is a pure state machine (`src/game/engine.ts`): same config +
  same action list ⇒ same board, so replays and resyncs are exact.
- All randomness (AI tie-breaking and noise, shuffles) comes from the seeded
  `mulberry32` RNG in `src/game/rng.ts`, seeded by the caller. The UI itself
  contains no game randomness.
- Fixed-seed regression tests live in `tests/ai.test.ts` (AI picks the same
  move for the same seed) and `tests/engine.test.ts` (full random games).

## Test map

| Claim | Test |
| --- | --- |
| Opening, touching, passing, end of game, bounds, parameters | `tests/rules.test.ts` |
| Rejection reasons are user-explainable and match `tryApply` | `tests/rules.test.ts` ("非法原因解释") |
| Piece inventory, orientation count, symmetry de-duplication | `tests/pieces.test.ts`, `tests/orient.test.ts` |
| Save/load round-trip, corrupt saves are ignored | `tests/engine.test.ts`, `tests/savegame.test.ts` |
| Scoring, ranking, monomino bonus | `tests/rules.test.ts` ("计分") |
| Full AI-vs-AI games, seeded reproducibility | `tests/ai.test.ts`, `tests/engine.test.ts` |
| LAN protocol, reconnect, state-version guard, room code | `tests/net.test.ts` |
| QR encoder: module-for-module against the reference library + independent decode | `tests/qr.test.ts` |
| Undo voting (unanimous) | `tests/vote.test.ts` |
| Local records / stats / export format | `tests/records.test.ts` |
| Relay server (rust): relay, slots, version handshake, room code, origin check, flood limit, port release | `src-tauri/src/net.rs` tests |
| Room discovery: UDP beacon/probe, `/room-info` (no room code), subnet sweep | `src-tauri/src/net.rs` tests |

Run everything with `npm run check`.
