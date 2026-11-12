# Nanchang Mahjong · rule audit

This is an honest audit of the rules implemented in `src/game/nanchang-mahjong.ts`.
The engine is pure TypeScript: no DOM, network, clock or `Math.random`. Every shuffle
and dice roll is injected. The UI is a thin view over the engine; the same engine
drives solo, hot-seat and LAN.

## 1. Tiles and deal

| Rule | Implementation | Test |
| --- | --- | --- |
| 136 tiles: 3 suits × 1–9 × 4 copies, four winds and three dragons × 4 copies. | `makeDeck()`, `TILE_TYPES` | “builds a 136-tile deck with four copies of every tile” |
| No flowers. | Deck has 34 types only. | same |
| Four players, 13 tiles each, dealer starts with 14. | `deal()` deals 13 rounds plus one dealer tile. | “deals 14 to the dealer, 13 to others…” |
| 17 stacks remain as the dead wall. | `deadWall` is the final 34 tiles; `liveWall` starts at 49. | same |
| Dealer rolls two dice and flips a tile from the wall end. | `assignSpirit()`, `stackIndex = diceSum − 1`. | “puts the flipped indicator in the dead wall…” |
| The flipped tile is the true spirit; the next tile in the cycle is the secondary spirit. | `nextTileInCycle()` cycles suits 1→9→1 and honours within winds/dragons. | “cycles suits and honours separately…” |
| The flipped physical tile is not a spirit; seven spirits remain in play, three true and four secondary. | True copies other than the indicator plus four secondary copies. | “has exactly three true and four secondary spirits…” |

The dead wall is not drawable. A hand ends when the live wall is empty; spirit and kong
points still settle.

## 2. Turn, draw, discard

| Rule | Implementation | Test |
| --- | --- | --- |
| Dealer discards first after the 14-tile deal. | `setup()` sets `phase:'discard'`, `turn:dealer`. | “dealer should start ready to discard” (E2E) |
| A normal turn draws one tile, then discards. | `draw()`, `discard()` | “draws and discards, then advances…” |
| Any tile may be discarded, including a spirit. | `discard()` only checks ownership. | “transfers a claimed spirit…” |
| A discard may be claimed by chi (left player only), peng, exposed kong or win. | `claimOptionsFor()`, `buildClaimQueue()` | “exposes claim options only to the seat on the clock” |
| Claim priority is win > kong > peng > chi; ties go to the nearer seat. | `CLAIM_PRIORITY`, `buildClaimQueue()` sort. | same |
| A claimant must discard; a kong claimant draws a replacement. | `claim()` | “transfers a claimed spirit…”, “lets another seat rob an added kong” |
| A passed claim window advances to the next seat. | `passClaim()`, `advanceAfterPass()` | “passes a claim and moves to the next seat” |

Claim decisions are sequential. A seat may decline a win, but then a farther win seat can
still claim. We do not implement the optional 弃先胡后 (pass-first-win) restriction; see
`docs/limitations.md`.

## 3. Melds

| Rule | Implementation | Test |
| --- | --- | --- |
| Chi is a three-tile run in one suit. | `analyseChi()` | “accepts ordinary number chi and peng” |
| Any three different winds, or any three different dragons, form a sequence. | `analyseChi()` honour branch. | “accepts any three different winds…” |
| Mixed wind/dragon sequences are illegal. | group check. | “rejects mixed or repeated honour sequences” |
| Peng is three of a kind; kong is four of a kind. | `analysePeng()`, `analyseGang()` | same |
| A spirit can substitute for any tile in chi, peng or kong. | `assignmentWild()`, spirit-aware analysers. | “uses spirits as wildcards in chi, peng and gang” |
| A spirit that fits naturally does not count as a wildcard effect. | `assignmentWild()` minimises wild use. | “does not count a spirit as a wildcard when it fits naturally” |
| Concealed and added kongs are declared during the discard phase. | `kongOptionsFor()`, `declareKong()` | “provides legal concealed kong options…” |
| An added kong can be robbed. | `declareKong()` builds a win-only claim queue; `claim()` handles `rob-kong`. | “lets another seat rob an added kong” |
| Ordinary kong 2 points; a kong of four spirits 10 points. | `kongPoints` increment in `claim()`/`declareKong()`. | “scores a kong made of four spirits as ten points” |

A kong is one meld structurally; its fourth tile is extra and does not change the
`14 − 3 × melds` hand-size rule.

## 4. Winning patterns

The engine recognises all five published patterns. The best pattern is chosen for
scoring; ties prefer Seven-Star, Big Seven Pairs, Small Seven Pairs, Thirteen Scattered,
then Basic.

| Pattern | Definition in this engine | Test |
| --- | --- | --- |
| Basic | Four melds (sequence, honour sequence, triplet or kong) plus a pair. | “detects four melds and a pair…” |
| Small Seven Pairs | Fourteen concealed tiles forming seven pairs. A four-of-a-kind counts as two pairs. No melds. | “detects small seven pairs…” |
| Big Seven Pairs | Fourteen concealed tiles forming four triplets plus a pair, with no sequence. | “detects big seven pairs…” |
| Thirteen Scattered | Fourteen concealed tiles; each suit's number tiles are at least three apart (difference ≥3); honours are all different. Five to seven honours plus seven to nine spaced numbers. | “detects thirteen scattered…”, “rejects scattered hands…” |
| Seven-Star Thirteen Scattered | All seven honour types must be present as genuine non-spirit tiles, plus seven number tiles spaced as above. Spirits may fill number slots but may not replace the seven honours. | “requires genuine honours for seven-star…” |

Spirits are wildcards in every pattern. A hand is a win if any valid wildcard assignment
exists.

## 5. Scoring table

The score sheet is produced by `scoreHand()`. All payments are zero-sum. The base unit is
1 point. The published table is implemented as follows.

### 5.1 Hand pattern and method

| Item | Value | Notes |
| --- | --- | --- |
| Basic | ×1 | Four melds + pair. |
| Small Seven Pairs | ×2 | |
| Big Seven Pairs | ×2 | Classified only for a fully concealed hand; an exposed all-triplet hand is Basic. |
| Thirteen Scattered | ×2 | |
| Seven-Star Thirteen Scattered | ×4 | Replaces the Thirteen Scattered ×2. |
| Self-draw | ×2 for every payer | |
| Discard win | discarder ×2, other players ×1 | |
| Robbing a kong | kong player ×4, other players ×1 | |
| Dealer | ×2 on the dealer side | If the winner is dealer, all payments double; if the dealer is a payer, that payer's payment doubles. |
| German | ×2 + 5 | No spirit acts as a wildcard in the winning shape. Spirits held naturally still score. |
| German-in-German | ×4 + 5 | German and no player holds a spirit tile in hand or melds. Replaces the German ×2+5, not stacked. |
| Spirit single-wait | ×2 + 5 | Self-draw, winning tile is a spirit, and the other 13 tiles form four melds plus a single pair-wait tile. |
| Kong draw | ×4 | Stacks with self-draw: a self-drawn kong replacement is ×8 in total. |
| Heavenly hand | ×20 | Dealer wins with the opening 14 tiles. No self-draw ×2. |
| Human hand | ×20 | A non-dealer wins on the dealer's first discard. No self-draw ×2. |

`unitValue = 1 × patternMultiplier + flatBonus`. Each payer pays
`unitValue × methodMultiplier × dealerMultiplier`.

### 5.2 Spirit points and kong points

| Item | Value | Notes |
| --- | --- | --- |
| True spirit | 2 points each | Counted in hand and melds after ownership transfer. |
| Secondary spirit | 1 point each | |
| Overlord spirit | spirit points ×2 | Exactly one player has any spirit points. |
| Spirit sprint (冲关) | 5 points ×2, 6 ×3, … 10 ×7 | Multiplier is `spiritPoints − 3` at 5–10 points. |
| Ordinary kong | 2 points | Exposed, concealed or added. |
| Spirit kong | 10 points | A kong whose four physical tiles are all spirits. The four spirits also score normally. |

Spirit and kong points are settled **pairwise**:

```
for every pair of seats (a, b):
  delta[a] += (adjustedSpirit[a] + kongPoints[a]) − (adjustedSpirit[b] + kongPoints[b])
  delta[b] −= the same amount
```

This is the published “own spirit/kong points minus everyone else's” settlement and is
zero-sum. Dealer and hand-pattern multipliers do not apply to this differential.

### 5.3 Worked examples

All examples use the engine's actual arithmetic, including the dealer side.

| Situation | Payer payments | Winner net |
| --- | --- | --- |
| Basic self-draw, dealer is a payer | 2, 2, 4 | +8 |
| Basic discard win from seat 1, dealer is a payer | 2, 1, 2 | +5 |
| Seven-Star discard win from seat 1, dealer is a payer | 8, 4, 8 | +20 |
| German-in-German self-draw, dealer is a payer | 18, 18, 36 | +72 |
| Kong draw self-draw, dealer is a payer | 8, 8, 16 | +32 |
| Robbing a kong, kong player is seat 1, dealer is a payer | 4, 1, 2 | +7 |
| Heavenly hand (dealer winner) | 40 × 3 | +120 |
| Human hand (dealer pays) | 80, 20, 20 | +120 |

## 6. Match, dealer and record

- A match starts at 0 points and targets 100.
- Scores carry from hand to hand.
- The dealer rotates clockwise every hand. The engine does not implement 连庄
  (dealer continuation); see limitations.
- A hand ends when a player wins or the live wall is empty.
- The match ends when exactly one player has at least 100 points after a hand. Ties
  continue for another hand.
- The family record stores hands, wins by seat, best hand, mode counts and the last eight
  hands in `localStorage`.
- Autosave stores the live state for solo and hot-seat. LAN is authoritative on the host
  and is not autosaved.

## 7. AI

Four deterministic levels, all with an injected RNG:

| Level | Behaviour |
| --- | --- |
| Companion | Gentle: passes some claims, occasionally picks a random discard, no defence. |
| Easy | Makes mistakes and passes claims more often. |
| Normal | Uses tile efficiency, exact tenpai waits, spirit value and light danger. |
| Hard | Full heuristic: exact wait counting, wild-tile efficiency, Thirteen Scattered potential, spirit counting, safe-tile defence, kong timing. |

The AI never reads hidden hands. It uses its own hand, public melds, discards, visible
tile counts and the public spirit types. `scatterPotential()` is the explicit
Thirteen Scattered detector; `handPotential()` values wildcards and spirit ownership;
`dangerOf()` is the defence term.

## 8. LAN privacy

- The host owns the wall and the only `GameState`.
- Each guest receives `view(state, seat)` only. A view contains that seat's hand, all
  public melds/discards, hand counts, scores, the spirit, the wall counts and that seat's
  legal actions.
- Other hands are never sent. At hand end, `revealedHands` is included for the score
  sheet.
- Guest intents are re-checked against the host's state. A stale or spoofed intent is
  rejected and the current view is resent.
- Undo and hint are local-only. LAN guests do not get undo; the host does not undo across
  the network.
- The shared relay (`@family-arcade/lan`) keeps guest intents private to the host.

## 9. Audit table

| # | Contract | Code | Tests |
| --- | --- | --- | --- |
| R1 | 136 tiles, four copies, no flowers | `makeDeck`, `TILE_TYPES` | deck test |
| R2 | 13-tile hands, 14 for dealer | `deal` | deal test |
| R3 | 17-stack dead wall | `deal` | deal test |
| R4 | Dealer dice and wall-end flip | `assignSpirit`, `deal` | spirit tests |
| R5 | True/secondary spirits and seven spirit tiles | `spiritKind`, `spiritCounts` | spirit tests |
| R6 | Spirits as wildcards | `analyseChi/Peng/Gang`, `assignmentWild` | meld tests |
| R7 | Claimed spirits change owner | `claim`, `scoreHand` | “transfers a claimed spirit…” |
| R8 | Chi/peng/gang and robbing kong | `claimOptionsFor`, `claim`, `declareKong` | claim/kong tests |
| R9 | Special honour sequences | `analyseChi` | honour tests |
| R10 | Basic, seven pairs, big seven pairs | `evaluateWin` | pattern tests |
| R11 | Thirteen Scattered and Seven-Star | `isScattered`, `evaluateWin` | pattern tests |
| R12 | Self-draw, discard payer, dealer | `scoreHand` | scoring tests |
| R13 | Kong and spirit points | `scoreHand` | spirit/kong tests |
| R14 | Overlord and spirit sprint | `scoreHand` | scoring tests |
| R15 | German and German-in-German | `scoreHand` | scoring test |
| R16 | Spirit single-wait, kong draw, robbing kong | `ScoreInput` flags | scoring tests |
| R17 | Heavenly/human ×20 | `declareWin`, `claim`, `scoreHand` | scoring + heavenly test |
| R18 | Seeded wall determinism | `setup(rng)` | determinism test |
| R19 | Per-seat private views | `view` | privacy test |
| R20 | Full hand terminates | `playAiHand` | full-hand tests |
| R21 | Four AI levels and hint | `chooseAiAction`, `hintFor` | AI tests |
| R22 | Autosave/record | `storage.ts` | storage tests |
| R23 | LAN four seats, disjoint hands | `App.tsx`, `scripts/lan-e2e.mjs` | LAN E2E |

## 10. Table choices

The following are deliberate table choices, not hidden rules:

- No 抄庄 (copy-dealer) first-discard penalty.
- No 下翻 (bottom-flip) extra spirit score.
- No 连庄 (dealer continuation); the dealer rotates every hand.
- No 弃先胡后 (pass-first-win) restriction.
- One winner per discard (closest win seat in the priority order), not 一炮多响.
- Kong draw stacks with self-draw.
- Big Seven Pairs is concealed-only.
- The spirit single-wait bonus requires a self-drawn spirit used as the pair wait.
- Spirit and kong differentials settle even on a drawn hand.
- Match target 100; ties continue.

See `docs/limitations.md` for the same list with the family-table alternatives.
