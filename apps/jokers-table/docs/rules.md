# Joker's Table · rules and implementation audit

Joker's Table is an original poker roguelike for Family Arcade. The engine is pure
TypeScript in `src/game/` and never touches the DOM, the network, a clock or
`Math.random`. Every shuffle, shop roll and AI decision receives a seed. The unit suite
has **81 tests** covering hand detection, the chip × mult pipeline, all 24 jokers, all
8 bosses, all deck and enhancement effects, the shop, seeded determinism and
competitive elimination.

This document is the rule contract and the audit trail. Where the genre leaves a
family-table choice, the choice is stated explicitly.

## 1. Cards and hands

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | A run uses one complete 52-card deck with four suits and thirteen ranks. | `makeDeck()` | “builds 52 unique cards…” |
| R2 | Ranks order 2–10, J, Q, K, A. A is high except in the A-2-3-4-5 wheel, which is a five-high straight. | `RANK_VALUE`, `straightHighValue()` | “supports the wheel…” |
| R3 | Card chips: 2–10 use their rank, J/Q/K are 10, A is 11. | `rankChip()` | “scores a high card…” |
| R4 | Each blind deals eight cards. Playing or discarding draws back to eight while cards remain. | `beginBlind()`, `drawToSize()` | “deals eight cards…”, “removes played cards…” |
| R5 | A play is one to five cards. Zero, six, duplicate or foreign cards are rejected. | `playCards()` | “rejects more than five…” |
| R6 | A discard is one to five cards and costs one discard. | `discardCards()` | “discards selected cards…” |
| R7 | Straights and flushes require exactly five cards. Pairs, two pair, trips and quads may be made with fewer than five. | `evaluateHand()` | “poker hand detection” group |
| R8 | Prism cards are wild for suit only. A five-card play is a flush when every non-Prism card shares one suit (or all five are Prism). | `isFlush()` | “treats Prism cards…” |
| R9 | A Royal Flush is a 10-J-Q-K-A straight flush. A wheel straight flush is an ordinary straight flush. | `evaluateHand()` | “detects full houses…” |
| R10 | There is no five-of-a-kind because a single 52-card deck has no duplicate cards. | `makeDeck()` | R1 test |

Base hand values:

| Hand | Chips | Mult |
| --- | ---: | ---: |
| High Card | 5 | 1 |
| Pair | 10 | 2 |
| Two Pair | 20 | 2 |
| Three of a Kind | 30 | 3 |
| Straight | 30 | 4 |
| Flush | 35 | 4 |
| Full House | 40 | 4 |
| Four of a Kind | 60 | 7 |
| Straight Flush | 100 | 8 |
| Royal Flush | 150 | 9 |

## 2. Chip × mult scoring

The scoring pipeline is:

1. Evaluate the poker hand from all played cards.
2. Add the hand’s base chips and mult.
3. Add card chips from each scored card, except chips removed by a boss.
4. Add enhancement chips and mult.
5. Add joker chips and mult in slot order.
6. Multiply by every ×mult effect.
7. `score = floor(chips × mult)`.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R11 | A hand’s score is chips × mult, floored. | `scorePlayedCards()` | “scores a pair…” |
| R12 | Enhancement contributions are visible separately in the score breakdown. | `ScoreBreakdown` | “applies Gilt, Cinder, Tally…” |
| R13 | Joker order matters only for display; additive and ×mult effects are accumulated deterministically. | `scorePlayedCards()` | all joker tests |
| R14 | A debuffed card still counts for the poker pattern but gives no chips, no enhancement and no suit-based joker trigger. | `scorePlayedCards()` | “fog debuffs hearts…” |
| R15 | Face cards stopped by the Auditor still count for the pattern but give no base card chips. Enhancements still apply. | `scorePlayedCards()` | “auditor removes base chips…” |

## 3. A run, antes and blinds

A run has **six antes × three blinds = 18 blinds**. Every ante has a Small Blind, a
Big Blind, and a Boss Blind in that order.

Base targets:

| Ante | Small | Big | Boss |
| ---: | ---: | ---: | ---: |
| 1 | 140 | 210 | 280 |
| 2 | 320 | 480 | 640 |
| 3 | 700 | 1,050 | 1,400 |
| 4 | 1,400 | 2,100 | 2,800 |
| 5 | 2,800 | 4,200 | 5,600 |
| 6 | 5,200 | 7,800 | 10,400 |

The Big Blind is `1.5 × base` and the Boss Blind is `2 × base`, rounded to the
nearest 10. The Crimson deck multiplies every target by 1.15 and rounds to the
nearest 10.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R16 | Every blind gives four hands and three discards. | `handLimit()`, `discardLimit()` | checked through run tests |
| R17 | The Short Bell boss gives three hands. The Extra Drawer voucher adds one. | `handLimit()` | “short bell gives three hands” |
| R18 | Sapphire and Velvet Glove add discards. | `discardLimit()` | “applies each deck modifier” |
| R19 | Clearing the target ends the blind immediately, even with hands left. | `playCards()` | “clears a blind…” |
| R20 | Running out of hands ends the blind as failed. | `playCards()` | “fails when four hands…” |
| R21 | Boss blinds carry exactly one restriction, active only for that blind. | `beginBlind()` | eight boss tests |
| R22 | The six bosses in a core run are distinct and chosen by seed. | `createBlindPlan()` | “builds eighteen blinds…” |
| R23 | A solo run is won after clearing the Ante 6 Boss Blind. | app `continueAfterBlind()` | E2E real-blind clear |

## 4. Money and the shop

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R24 | A cleared blind pays its base reward: $4 Small, $5 Big, $6 Boss. | `blindReward()` | “clears a blind…” |
| R25 | A cleared blind also pays $1 per unused hand. | `blindReward()` | same |
| R26 | Interest pays $1 per $5 held, capped at $5. Coin Press changes this to $1 per $4, capped at $7. | `blindReward()` | “pays interest…”, “Coin Press raises…” |
| R27 | A failed blind pays interest only. | `blindReward()` | “fails when four hands…” |
| R28 | Treasurer pays +$2 and Patron pays +$1 per unused hand when a blind is cleared. | `blindReward()` | “treasurer and patron pay money…” |
| R29 | The shop opens after a cleared or failed blind and shows three offers. | `enterShop()` | “moves from a cleared blind…” |
| R30 | Reroll costs $2 and advances the deterministic shop roll. | `rerollShop()` | “sells a joker… and rerolls…” |
| R31 | Jokers cost $5–$7, enhancements $4, vouchers $8, Patron’s Mark reduces each price by $1 (minimum $1). | `generateOffers()` | shop tests |
| R32 | There are four joker slots. A fifth joker and a duplicate are rejected. | `buyOffer()` | “refuses a fifth joker…” |
| R33 | Selling an owned joker pays $3. | `sellJoker()` | “sells a joker…” |
| R34 | Buying an enhancement requires an unenhanced target card and modifies that card for the rest of the run. | `buyOffer()` | “requires a target…” |
| R35 | A voucher can be bought once and applies for the rest of the run. Patron’s Mark also lowers the listed price of the remaining offers immediately. | `buyOffer()` | “buys a voucher once…”, “reprices the remaining shop…” |
| R36 | Shop offers are deterministic for the same seed, blind and reroll. | `generateOffers()` | “generates the same shop offers…” |

Starting money: Ivory $8, Crimson $12, Sapphire $6, Brass $7.

## 5. The 24 original jokers

All names, effects and glyphs are original to Joker's Table.

| Joker | Effect |
| --- | --- |
| The Understudy | +30 chips. |
| Velvet Curtain | +3 mult. |
| Brass Compass | +4 mult when a spade is scored. |
| Paper Lantern | +18 chips per heart scored. |
| Ledger Keeper | +3 mult when no discards remain. |
| Twin Mirrors | +35 chips when the hand contains a pair. |
| The Orator | ×1.5 mult when every scored card shares a suit. |
| Backstage Key | +2 mult per discard left. |
| Clockwork Finch | +50 chips when exactly five cards are played. |
| Quiet Ember | +15 chips and +1 mult when exactly three cards are played. |
| The Collector | +1 mult per owned joker. |
| Marble Bust | +55 chips when no face card is played. |
| Red Thread | +4 mult when the hand is a straight. |
| Inkwell | +3 mult when the hand is a flush. |
| Sundial | +20 chips per ace scored. |
| Salt Cellar | +30 chips on two pair or better. |
| The Doorman | +5 mult when exactly one card is played. |
| Candlewick | +2 mult per discard used this blind. |
| Glass Harmonica | +10 chips per distinct rank scored. |
| Night Watch | +45 chips when exactly two cards remain in hand. |
| The Alchemist | +2 mult per enhanced card scored. |
| The Heir | ×3 mult on four of a kind or better. |
| The Treasurer | +$2 when a blind is cleared. |
| The Patron | +$1 per unused hand when a blind is cleared. |

Every joker is exercised by its own unit test. The engine skips the first joker
entirely under The Mirrorwright.

## 6. The 8 original bosses

| Boss | Restriction for that blind |
| --- | --- |
| The Auditor | J, Q and K give no base card chips. Enhancements still apply. |
| The Fog | Hearts are debuffed: no card chips and no enhancements. |
| The Pale Widow | Spades are debuffed: no card chips and no enhancements. |
| The Rulebook | No discards. |
| The Tax Collector | Every hand played costs $2, to a minimum of $0. |
| The Mirrorwright | The first joker slot is inactive. |
| The Short Bell | Three hands instead of four. |
| The Sphinx | Straights and flushes use High Card’s base chips and mult. Joker conditions still see the real pattern. |

## 7. The 4 decks

| Deck | Effect |
| --- | --- |
| Ivory Standard | No modifier. Start with $8. |
| Crimson Cut | Start with $12. Every blind target is 15% higher. |
| Sapphire Drift | Start with $6. One extra discard each blind. |
| Brass Foundry | Start with $7. Two random cards begin with Gilt. |

All four decks keep the complete 52-card deck.

## 8. The 6 enhancements

| Enhancement | Effect |
| --- | --- |
| Gilt | +40 chips when scored. |
| Cinder | +3 mult when scored. |
| Prism | Counts as any suit for flush detection. |
| Bramble | +2 mult for each other scored card of the same suit. |
| Tally | +12 chips for each scored card. |
| Keystone | +1 mult for each scored card. |

## 9. Vouchers

| Voucher | Effect |
| --- | --- |
| Extra Drawer | +1 hand each blind. |
| Velvet Glove | +1 discard each blind. |
| Coin Press | Interest pays $1 per $4, up to $7. |
| Patron’s Mark | Shop prices are $1 lower, minimum $1. |

## 10. Solo and competitive play

Solo: clear all six antes to win. A failed blind ends the run.

Competitive (rivals, hot-seat and LAN) uses one shared seed and one shared blind
plan. Each player runs the same sequence on their own board.

After every blind:

- The **unique** lowest blind score loses one of three hearts.
- If the lowest score is tied, nobody loses a heart. Ties are safe.
- Players at zero hearts are eliminated.
- Eliminated players stop playing but may watch the remaining table.
- The last player with hearts wins.

The competitive plan includes 18 core blinds plus **six escalating finale blinds**.
A finale starts from the Ante 6 Boss target, multiplies by 1.3 each time and cycles
through the eight bosses. If all 24 blinds are exhausted with more than one survivor,
the winner is chosen by most hearts, then highest cumulative score, then lowest seat
index. This fallback is documented in `docs/limitations.md`.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R37 | The unique lowest blind score loses one heart. | `compareBlind()` | “removes one heart…” |
| R38 | A tie for lowest is safe for every player. | `compareBlind()` | “is safe when…” |
| R39 | Zero hearts eliminates a player; the last survivor wins. | `compareBlind()` | “declares the last standing…” |
| R40 | Eliminated seats are ignored in later comparisons. | `compareBlind()` | “handles four players…” |
| R41 | Rival seats use the same seed, blind plan and blind deck as the human. | `makeSeats()`, `createRun()` | deterministic run tests + LAN E2E |
| R42 | LAN clients derive the same plan from the host’s seed and never receive hands. | `startLanHost()`, `guestViewRef` | LAN E2E shared-seed check |
| R43 | Hot-seat hides the hand behind a cover until that seat looks. | app handoff screen | E2E hot-seat privacy checks |

## 11. Four AI levels

| Level | Behaviour |
| --- | --- |
| Companion | Often plays a strong hand, sometimes picks a lesser legal play, and never rerolls. Gentle. |
| Easy | Often makes a random legal play and buys loosely. |
| Normal | Uses the best immediate play, discards three or four weak cards when the blind ratio is poor, saves money, and takes more risk at one heart. |
| Hard | Uses the best immediate play, discards four or five weak cards when needed, considers a single reroll, shops for jokers, vouchers and enhancements, and becomes more aggressive (more discards, earlier rerolls) at one heart. |

All levels use only public information, return legal actions and are deterministic
with the same injected RNG. The hint button uses the Hard search and reports the hand
name, chips × mult, total, and whether that play clears the blind.

## 12. Lan wiring and privacy

- The host opens the shared relay, creates a four-digit room, and shares an invite
  URL/QR code.
- Two to four people join. The host starts with a seed (typed or generated) and a
  deck. The host derives a 24-blind competitive plan and broadcasts it with the
  player list.
- Each device runs its own local `RunState`. The broadcast contains no cards, no
  draw piles and no shop state.
- When a guest finishes a blind, the guest sends `{type:'score', blindIndex, score}`
  as a LAN intent. The host validates the blind index and records the score.
- When every active seat has submitted, the host compares scores, updates hearts,
  and broadcasts a verdict with the scores, totals, hearts, eliminations and winner.
- Shops and the next blind are local. The host’s tracker advances its blind index at
  verdict time, so a fast guest can submit the next blind without blocking the table.
- If a player disconnects, the match is paused for that seat; the host must restart
  the room to continue cleanly. See `docs/limitations.md`.

## 13. Comfort and persistence

| Feature | Rule |
| --- | --- |
| Autosave | Solo, rival and hot-seat sessions save after every action to `localStorage`. LAN sessions do not autosave. |
| Resume | The home screen offers the latest local save. The full run, seats, hearts, shop and current screen are restored. |
| Undo | Available during a solo, rival or hot-seat blind, before the blind ends. Disabled in LAN and after a blind resolves. |
| Hint | Hard-level best play, with a reasoned sentence. |
| Record | Local family record of runs, wins, losses, best score, best ante, mode counts and recent results. |
| Sound | Synthesised Web Audio tones; persisted on/off. |
| Reduced motion | Toggle persisted in `localStorage`, plus `prefers-reduced-motion`. |
| Keyboard | 1–8 select, P/Enter play, D discard, H hint, U undo, N/Enter continue, Esc home. |
| Mobile | 390 px layout with the full eight-card hand and no horizontal overflow. |

## 14. Determinism and test coverage

- `hashSeed()` maps text or a number to a 32-bit seed.
- `createBlindPlan()` and every shuffle use sub-seeds derived from the run seed.
- The shop roll is derived from seed + blind index + reroll count.
- The full draw pile is stored in the run state, so a resume is exact.
- Tests: **81**. E2E: **52 checks**. LAN E2E: host + three guests, shared seed,
  score submission, comparison and shop.

## 15. Deliberate family-table choices

These are choices, not accidental omissions:

1. A failed competitive blind still produces a score; the comparison is by score,
   not by whether the target was met. Solo fails the run.
2. Ties for lowest are fully safe; no “lowest two” penalty.
3. Finale blinds are an extension for tables that still have multiple hearts after
   six antes. They are not part of the solo six-ante win.
4. The Sphinx changes the base chips/mult only. Joker conditions still read the real
   straight/flush pattern, so Red Thread and Inkwell still trigger.
5. The Auditor removes base chips only; enhancements on face cards still apply.
6. The shop is sequential in hot-seat. Hands are private; shops are public once the
   device reaches that seat.
7. Undo cannot rewind a resolved blind, a shop purchase, or a LAN action.
