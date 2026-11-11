# Domino Line · rule audit

Every rule is implemented in `src/game/domino.ts`, exercised by a unit test in
`tests/game.test.ts`, and rendered by the UI. The engine is pure: no DOM, network,
clock or `Math.random`; the deal takes an injected RNG. **43 tests** pass with
`npm test`.

## Match and deal

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The set is double-six: 28 unique tiles, each pip 0–6, canonical order `a ≤ b`. | `ALL_TILES`, `makeTile()` | “creates a canonical double-six set of 28 unique tiles” |
| R2 | Two players draw 7; three or four draw 5. All remaining tiles form the boneyard. | `setup()`, `drawCount()` | “deals 7 tiles each…” and “deals 5 tiles each…” |
| R3 | The same seed produces the same deal; a different seed changes it. | `shuffle()`, `makeRng()` | “is deterministic…” / “produces a different deal…” |
| R4 | A round starts with an empty line and seat 0 to play; scores start at zero and the match target is 100. | `setup()` | “starts empty with seat 0…” |
| R5 | The first tile of a round may be any tile in the starter’s hand. | `legalPlays()` | “allows any tile to start the empty line” |

## Playing tiles

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R6 | A tile may be placed only on an open end whose pip it matches. | `legalPlays()`, `applyAction()` | “only lists tiles that match an open end” |
| R7 | Placing on the right keeps the left end and exposes the tile’s other pip; placing on the left does the mirror. | `orientForRight()`, `orientForLeft()` | “places a tile on the right…” / “…on the left” |
| R8 | A double is one tile on the line and exposes the same pip twice. | `legalPlays()` | “offers a matching tile on both ends…” |
| R9 | When both ends show the same pip, symmetric double placements are deduplicated. | `legalPlays()` | same test |
| R10 | A tile that matches both different ends is offered as two distinct choices. | `legalPlays()` | same test |
| R11 | Only the seat whose turn it is may act, and only with a tile in its hand that fits. | `applyAction()` | “rejects a wrong seat, a tile not in hand…” |
| R12 | A finished round or match rejects every action. | `applyAction()` | “rejects moves after the round has ended” |
| R13 | A legal play resets the consecutive-pass counter and advances the turn, wrapping 3 → 0 in a four-player game. | `applyAction()`, `nextSeat()` | “resets the pass count…” / “wraps the turn…” |

## Drawing, passing and scoring

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R14 | If no tile fits, the player draws exactly one tile from the boneyard and keeps the turn. | `applyAction('draw')` | “draws one tile only when no tile fits…” |
| R15 | Drawing is illegal while a tile fits, or when the boneyard is empty. | `applyAction()` errors `must-play` / `boneyard-empty` | “refuses to draw when a tile fits…” |
| R16 | Passing is legal only with no fitting tile and an empty boneyard. | `applyAction('pass')` | “passes only with an empty boneyard…” / “refuses to pass while…” |
| R17 | A pass advances the turn and increments the pass count; a play resets it. | `applyAction()` | “passes only…” / “resets the pass count…” |
| R18 | Playing the last tile ends the round. The winner scores the pip total of every other hand. | `emptyHandRound()` | “scores an empty hand from every other hand…” |
| R19 | When every seat passes with an empty boneyard, the unique lowest pip total wins the round and scores every other hand’s pips. | `blockRound()` | “awards a blocked table to the unique lowest pip total” |
| R20 | If the lowest pip total is tied, nobody scores and the round still ends. | `blockRound()` | “awards no points when the lowest pip total is tied” |
| R21 | Reaching 100 or more at the end of a round ends the match immediately. | `emptyHandRound()`, `blockRound()` | “ends the match when the round score reaches the target” |
| R22 | The round winner starts the next round; after a tied blocked round the starter rotates. | `nextRound()` | “starts the next round with the round winner…” / “rotates the starter…” |
| R23 | The next round re-deals all hands and the boneyard, clears the line and preserves match scores. | `nextRound()` | “starts the next round…” |

## Hidden information and LAN

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R24 | A seat view contains that seat’s hand, hand counts, the public line and its own legal plays — never an opponent’s tiles or pip total while the round is live. | `view()` | “shows a seat only its own hand…” |
| R25 | At round end all pip totals are revealed for the summary. | `view()` | “reveals every pip total in the round summary” |
| R26 | `canDraw` and `canPass` are true only for the stuck seat. | `view()` | “exposes canDraw and canPass…” |
| R27 | Invalid actions return the original state unchanged. | `applyAction()` | “returns the same state object for invalid actions” |

## AI

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R28 | Companion, Easy, Normal and Hard always return a legal action when the seat can act. | `chooseAction()` | “every level returns a legal, applicable action” |
| R29 | The same state, level and injected RNG produce the same action. | `chooseAction()` | “is deterministic for the same state…” |
| R30 | AI never mutates the state. | `chooseAction()` | “only chooses legal moves and never mutates the state” |
| R31 | When stuck, every level draws if the boneyard has tiles, otherwise passes. | `chooseAction()` | “draws when stuck…” / “passes when stuck…” |
| R32 | Hard takes a round-winning play when its hand can be emptied. | `chooseAction()` | “takes a round-winning play…” |
| R33 | Hints are deterministic and carry a reason; Hard’s sampler only sees tiles unseen by its seat. | `hintFor()`, `unseenTiles()` | “produces a deterministic hint…”, “keeps unseen information accurate…” |

## Documented simplifications

- **Block dominoes only.** No spinner play, muggins, all-fives, Sebastian, or
  partnership rules. Doubles stay on the line.
- **Free opening.** The starter may open with any tile; we do not require the
  highest double or a draw to find it.
- **Draw one at a time.** A stuck player may press Draw repeatedly until a tile
  fits or the boneyard is empty, then must pass. This matches the family version
  described in `APP_BRIEF.md`.
- **Boneyard pips are not scored.** At round end only the other players’ hands are
  counted; leftover boneyard tiles are returned for the next deal.
- **Blocked tie.** No score; the next round rotates the starter instead of replaying
  the same deal.
- **Hidden information.** Hot-seat draws only the active hand. LAN guests receive
  only their own `view(state, seat)`; the host re-validates every intent with
  `applyAction`.
