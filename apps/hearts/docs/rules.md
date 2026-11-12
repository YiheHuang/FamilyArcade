# Hearts · rule audit

Every rule has code, a test and an edge case. The engine lives in `src/game/hearts.ts`
and has no DOM, clock, network or `Math.random` dependency. Cards are integers 0–51:
clubs `0–12`, diamonds `13–25`, spades `26–38`, hearts `39–51`, with ranks 2–14.
`TWO_CLUBS = 0` and `QUEEN_SPADES = 36`.

## Deal, passing and the opening lead

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | A 52-card deck is dealt face down: 13 cards to each of four seats. | `deal()`, `setup()` | “deals 52 unique cards, 13 to each seat” |
| R2 | Pass direction rotates left, right, across, then hold on the fourth hand. | `passDirectionFor()` | “rotates pass direction left, right, across, hold” |
| R3 | Left sends to seat+1, right to seat+3, across to seat+2. | `passTarget()`, `passCards()` | same test and “passes across for the third hand” |
| R4 | A pass is exactly three distinct cards that are in the passing seat's hand. | `passCards()` | “records a pass only after exactly three cards from the hand” |
| R5 | A seat can pass only once per hand. | `passCards()` → `already-passed` | same test |
| R6 | After all four seats choose, the three cards move to the target hands and each hand still has 13. | `passCards()` | “passes left, keeps 13 cards and gives the two of clubs the first lead” |
| R7 | The fourth hand is a hold: no pass phase. | `passDirectionFor()`, `dealState()` | “starts a hold hand directly in play with the previous winner leading” |
| R8 | The first hand is opened by the holder of the two of clubs, and that card must be played. | `dealState()`, `legalCards()` | “forces the two of clubs on the first lead of the first hand” |
| R9 | Later hands are opened by the winner of the previous hand's last trick. | `resolveTrick()`, `nextHand()` | “completes a hand after thirteen tricks…” plus the hold test |
| R10 | A hold hand is opened by the previous hand's last-trick winner. | `dealState()` via `nextHand()` | “starts a hold hand directly in play with the previous winner leading” |

## Following suit, tricks and hearts

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R11 | A player must follow the led suit when able. | `legalCards()` | “requires following the led suit” |
| R12 | A void player may discard any card, subject to the first-trick restriction. | `legalCards()` | “allows any discard when void in the led suit” |
| R13 | On the first trick of a hand, hearts and the queen of spades may not be led, followed with, or discarded if a safe card exists. | `legalCards()` | “forbids hearts and the queen of spades on the first trick” and “keeps the queen of spades out of the first trick…” |
| R14 | If only point cards remain, the first-trick exception allows them. | `legalCards()` | same test, second half |
| R15 | Hearts cannot be led until a heart has been played. | `legalCards()`, `playCard()` | “does not allow leading hearts until they are broken” |
| R16 | A player holding only hearts may lead hearts, which then breaks them. | `legalCards()` | same test, second half |
| R17 | The highest card of the led suit wins the trick; off-suit cards never win. | `resolveTrick()` | “awards the trick to the highest card of the led suit only” |
| R18 | The trick winner leads the next trick. | `resolveTrick()` | same test; `turn === lastTrickWinner` |
| R19 | A hand is 13 tricks, then it is scored. | `resolveTrick()` | “completes a hand after thirteen tricks and carries scores into the next hand” |
| R20 | Off-suit discards mark a public void in the led suit. | `playCard()` → `voids` | “marks a public void when a player discards off-suit” |
| R21 | The first trick is followed by normal point play. | `resolveTrick()` → `firstTrick=false` | “lets point cards be discarded once the first trick is over” |

## Scoring, the moon and the 100-point finish

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R22 | Each heart taken in tricks is 1 point. | `cardPoints()`, `resolveTrick()` | “scores one point for each heart taken” |
| R23 | The queen of spades is 13 points and belongs to the trick winner. | `cardPoints()`, `resolveTrick()` | “scores thirteen for the queen of spades…” |
| R24 | Hand points accumulate across all 13 tricks. | `resolveTrick()` | heart and queen tests |
| R25 | A player who takes all 26 points shoots the moon: they score 0, the other three score 26. | `resolveTrick()` | “moves all 26 points when one seat shoots the moon” |
| R26 | Scores carry into the next hand. | `nextHand()` | “completes a hand…” and moon test |
| R27 | The game ends when any total reaches 100 or more. | `resolveTrick()` | “ends the game at 100 and picks the lowest total” |
| R28 | The lowest total wins; every tied lowest seat is listed. | `resolveTrick()` → `winners` | “lists every tied lowest seat as a winner” |
| R29 | Card point values are exactly 1 / 13 / 0. | `cardPoints()` | “scores cards correctly” |

## Privacy views

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R30 | A seat view contains only that seat's hand; other seats contribute public counts only. | `view()` | “shows a seat only its own hand and public counts” |
| R31 | `canAct`, `canPass` and legal cards are computed for the viewed seat only. | `view()`, `legalCards()` | “updates canAct and legal cards only for the seat to move” |
| R32 | A spoofed wrong-seat move, a card outside the hand and an illegal follow are rejected by the engine. | `playCard()` | “rejects a move from the wrong seat…” |
| R33 | Passing after the pass phase is rejected. | `passCards()` → `phase` | “rejects passing after the pass phase is over” |

## AI, hints and determinism

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R34 | Every AI level only returns a legal card. | `chooseMove()` | “only returns legal cards at every level” |
| R35 | Every AI level passes three distinct cards from its own hand. | `choosePass()` | “passes exactly three cards from its own hand at every level” |
| R36 | Same state, level and injected RNG always produce the same move. | `seededRng()`, `chooseMove()` | “is deterministic for the same state and RNG seed” |
| R37 | The hint returns a legal playing card or three legal pass cards, with a reason. | `hintFor()` | “returns a legal hint and a pass hint” |
| R38 | A hard AI asked out of turn returns `-1`. | `chooseMove()` | “never returns a move out of turn” |
| R39 | A full deal-driven game reaches a legal game-over state without getting stuck. | `setup()`, `passCards()`, `playCard()`, `nextHand()` | “finishes a full deal-driven game without a stuck state” |

## LAN and hot-seat integration

- `App.tsx` hosts keep the full engine state. `LanHost.onIntent` maps the sender to its
  actual seat and calls `passCards` or `playCard`; the payload's `handNumber` (and
  `trickNumber` for a play) is checked against the live state to reject stale intents.
- Only `view(state, seat)` is sent to each connected guest through `LanHost.sendView`.
  Other hands never appear in the payload.
- Empty or disconnected LAN seats are played by the same AI used in solo mode.
- Hot-seat never renders another seat's hand: an opaque curtain is shown until the named
  seat opens it. Undo from the curtain returns to the previous seat with the curtain
  still closed.
- The host records a finished LAN game locally. Guests do not write a duplicate result.

## Verification

`npm test` runs 32 meaningful unit tests in `tests/game.test.ts`. The production build
also type-checks the engine, components and LAN wiring with `tsc --noEmit`.
