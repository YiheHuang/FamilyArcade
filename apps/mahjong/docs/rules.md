# Mahjong · rule audit

The engine lives in `src/game/mahjong.ts`. It is pure TypeScript: no DOM, network,
clock or `Math.random`. Every shuffle takes an injected RNG. The test suite has
**51 unit tests** in `tests/game.test.ts`, covering the deck, deal, turn flow, calls,
kongs, robbing a kong, all three winning shapes, the fan table, minimum fan, claims,
per-seat views, shanten, tile efficiency, four AI levels, hints, seeded walls and
full-game completion.

## Deal and seats

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | 136 tiles: 1–9 in three suits, four winds and three dragons, four copies each. No flowers. | `makeWall()` | “builds 136 unique physical tiles…” |
| R2 | Four seats receive 13 tiles; the dealer receives a fourteenth tile. | `setup()` | “deals 13 tiles each…” |
| R3 | The wall holds the other 83 tiles; every tile is unique in the deck. | `setup()` | same |
| R4 | The dealer is East; seat winds follow the dealer order. | `windOf()` | “assigns seat winds…” |
| R5 | Shuffles are deterministic for an injected RNG. | `setup({ rng })` | “is deterministic for an injected RNG seed” |
| R6 | The app deals seat 0 as dealer so the human starts on the solo table; the engine accepts any dealer. | app `setup` call | engine + view tests |

## Turn, draw and discard

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R7 | A turn draws one tile, then discards one. | `discard()` / `drawFor()` | “removes the discarded tile…” |
| R8 | A seat may discard only a tile in its own hand. | `discard()` | “rejects an out-of-turn discard…” |
| R9 | A discard leaves the hand and appears in the river. | `discard()` | same |
| R10 | If nobody claims, the next seat draws automatically. | `afterDiscard()` | same |
| R11 | When the wall is empty at the next draw, the hand is a draw. | `afterDiscard()` / `finishDraw()` | “ends in an exhaustive draw…” |
| R12 | The engine never mutates the state passed in. | all actions | “does not mutate the state…” |

## Calls

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R13 | Chi is offered only to the seat immediately after the discarder (its left-hand neighbour in turn order). | `claimOptionsFor()` | “lets the next seat chi…” and “does not offer chi…” |
| R14 | Peng is offered to any other seat holding two copies. | `claimOptionsFor()` | “forms a peng…” |
| R15 | An exposed kong is offered to any seat holding three copies and draws a replacement tile. | `claimOptionsFor()` / `executeMeldClaim()` | “forms an exposed kong…” |
| R16 | A concealed kong is declared on the active seat’s turn and draws a replacement. | `declareConcealedKong()` | “declares a concealed kong…” |
| R17 | An added kong upgrades an existing peng and draws a replacement. | `declareAddedKong()` | “upgrades a peng…” |
| R18 | An added kong can be robbed by any seat that would win on the tile. | `declareAddedKong()` / `claim()` | “offers a robbing-kong win…” |
| R19 | A concealed kong cannot be robbed. | `declareConcealedKong()` | “does not offer a robbing win…” |
| R20 | A kong cannot be declared when the wall is empty. | `kongCandidates()` | engine guards |
| R21 | Claims wait for every eligible seat to decide; win beats kong, kong/peng beat chi, and the nearest seat wins ties. | `resolveClaims()` / `claim()` | “prefers a win…” and “nearest peng…” |
| R22 | Passing a claim lets the next seat draw; the discard stays in the river. | `resolveClaims()` | “passes a claim…” |

## Winning hands

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R23 | Standard hand: four melds (sequences or triplets) and one pair. | `decomposeStandard()` | “detects a standard…” |
| R24 | Seven pairs: seven pairs, with a quad allowed as two pairs. | `sevenPairsEvaluation()` | “detects seven pairs” and “allows a quad…” |
| R25 | Thirteen orphans: all 13 terminal/honour kinds, plus one duplicate. | `thirteenOrphansEvaluation()` | “detects thirteen orphans” and “rejects…” |
| R26 | A hand below the table minimum cannot be declared. | `winSelf()` / claim options | “rejects a low-fan win…” |
| R27 | Self draw adds the winning tile and settles against all three opponents. | `winSelf()` / `completeWin()` | “wins by self-draw…” |
| R28 | A discard win adds the claimed tile and is paid by the discarder. | `claim()` / `completeWin()` | “wins on a discard…” |
| R29 | A robbing-kong win is paid by the kong player. | `claim()` / `completeWin()` | “offers a robbing-kong win…” |
| R30 | The settlement is zero-sum. | `completeWin()` | self-draw and discard tests |

## Fan table

| Fan | Value | Notes |
| --- | --- | --- |
| Self draw | 1 | Winning on your own drawn tile. |
| Concealed hand | 1 | No exposed chi, peng, kong or added kong; concealed kongs are allowed. |
| All simples | 1 | Every tile is 2–8, no terminals or honours. |
| All triplets | 2 | Every set is a triplet or kong. |
| Mixed one suit | 2 | One numbered suit plus at least one honour. |
| Pure one suit | 4 | Every tile is from one numbered suit. |
| Pure straight | 2 | 123, 456 and 789 in one suit, concealed or exposed. |
| Seven pairs | 2 | Seven pairs, quads count as two pairs. |
| Thirteen orphans | 13 | All thirteen terminal/honour kinds plus a duplicate. |
| Seat wind | 1 | A triplet or kong of your seat wind. A pair does not count. |
| Prevalent wind | 1 | A triplet or kong of the round wind. A pair does not count. |
| Dragon triplet | 1 each | One point for every dragon triplet/kong. |
| Kong draw | 1 | Self draw on the replacement tile after a kong. |
| Last tile | 1 | Winning on the final tile of the wall. |
| Robbing a kong | 1 | Winning on an added-kong tile. |

Fan stacks. The best standard decomposition is chosen by total fan. The UI offers a
minimum of 1, 2 or 3 fan; the engine also accepts 0.

### Settlement

- Self draw: each opponent pays `fan`; the winner receives `3 × fan`.
- Discard win: the discarder pays `3 × fan`.
- Robbing a kong: the kong player pays `3 × fan`.

This is a family-table payment choice, not a claim that every regional table uses the
same points. The fan values are the contract.

## AI

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R31 | Shanten covers standard, seven pairs and thirteen orphans. | `shanten()` | “complete hand as -1…”, “seven pairs…” |
| R32 | Tile efficiency counts useful draws with visible-tile depletion. | `usefulTiles()` / `ukeire()` | AI tests |
| R33 | Visible counting uses the AI hand, discards and all public melds; it never reads a hidden hand. | `visibleCounts()` | “counts visible tiles honestly…” |
| R34 | Hard uses a public-information danger estimate for defence. | `dangerScore()` | “counts four visible copies…” |
| R35 | Claim decisions evaluate the post-claim shanten and preserve seven pairs / thirteen orphans. | `chooseClaim()` | claim tests |
| R36 | Every level returns a legal action and all levels finish a full game. | `chooseAction()` | “returns a legal discard…”, “finishes a full game…” |
| R37 | Companion is gentler, Easy makes mistakes, Normal uses efficiency, Hard adds defence and kong/meld judgment. | `chooseDiscard()` / `chooseClaim()` / `chooseKong()` | level and full-game tests |
| R38 | Hints are legal and carry a reason with shanten, useful tiles or fan. | `hint()` | “produces a hint…” |

The AI never sees another seat’s hand. The hard discard test deliberately swaps two
hidden hands with equal public information and checks that the choice does not change.

## Privacy and LAN

- `view(state, seat)` returns only that seat’s concealed hand. Other seats appear as
  counts, public melds and river tiles.
- Claim options are included only for the viewing seat.
- Hot-seat covers the hand when the active seat changes; it is family etiquette, not a
  security boundary against a determined peek.
- LAN host is authoritative. Each device receives `view(state, seat)` and may send only
  its own discard, win, claim or kong intent. The host re-checks every intent with
  `applyAction`.
- A guest is never sent a hidden hand, the wall order or another seat’s claim options.

## Deliberate table choices

- Dealer is seat 0 for every app hand; the round wind is selectable and the dealer does
  not rotate. See `docs/limitations.md`.
- A hand is one deal. There is no dealer rotation, match target or renchan rule.
- One winner is selected from simultaneous win claims: nearest to the discarder in turn
  order.
- Concealed kongs cannot be robbed; added kongs can.
- Seven pairs permits quads; thirteen orphans requires a duplicate.
- The minimum-fan check rejects a legal shape below the table minimum rather than paying
  a reduced score.
