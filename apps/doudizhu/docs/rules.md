# Dou Dizhu · rule audit

The pure engine is [`src/game/doudizhu.ts`](../src/game/doudizhu.ts). It has no
DOM, network, clock or `Math.random`; deal and redeal take an injected RNG. The
audit below maps each rule to the code and to a test in
[`tests/game.test.ts`](../tests/game.test.ts). The suite currently has **47**
meaningful engine, AI and storage tests.

## Table choices

These are the family-table choices where published rules differ. They are also
listed honestly in [`docs/limitations.md`](limitations.md).

1. **One bidding round.** Seats bid in order once: 1, 2, 3 or pass. Each bid must
   beat the current highest bid. A 3 ends bidding immediately. After three actions
   the highest bidder takes the bottom cards. Three passes redeal. The first bidder
   rotates by one seat on a redeal.
2. **Bottom cards.** Hidden to every seat during bidding. Once the landlord is
   fixed they are public and join the landlord's hand (20 cards).
3. **Chains.** A straight is five or more single ranks from 3 through A. A pair run
   is three or more consecutive pairs from 3 through A. Airplanes are two or more
   consecutive triples from 3 through A. 2 and jokers never extend a chain.
4. **Airplane wings.** Bare airplanes are exactly the consecutive triples. Single
   wings add exactly *n* spare cards; pair wings add exactly *n* spare pairs. A
   spare triple is not accepted as single wings (it is an ambiguous extra airplane).
   Wings may include 2s and jokers.
5. **Four with two.** Four of a kind plus two singles may carry a pair as the two
   singles. Both jokers are allowed as those two singles. Four with two pairs
   requires two distinct pair ranks.
6. **Comparison.** Same type and same card count only; the higher primary rank
   wins. A bomb beats any non-bomb. A higher bomb beats a lower bomb. The rocket
   beats every bomb. A rocket cannot be beaten.
7. **Passing.** The leader cannot pass. Two consecutive passes clear the last play
   and return the lead to the last player who actually played.
8. **Spring.** Landlord spring: the landlord wins and neither farmer has made a
   non-pass play. Farmer spring: the farmers win and the landlord has made exactly
   one non-pass play. Either spring doubles the stake.
9. **Scoring.** `multiplier = 2^(bombs + rockets) × (spring ? 2 : 1)`;
   `stake = base bid × multiplier`. The landlord scores `+2 × stake` on a win and
   `−2 × stake` on a loss. Each farmer scores `+stake` when the farmers win and
   `−stake` when they lose. A round is zero-sum.
10. **No carry-over.** The family record counts rounds; it does not carry a running
    score into the next deal.

## Rule-by-rule audit

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The deck is 54 unique cards: 52 suited cards plus two jokers. | `makeDeck()` | “builds a 54-card deck with 52 suited cards and two jokers” |
| R2 | Three players receive 17 cards each and three bottom cards. | `setup()`, `deal()` | “deals 17/17/17 plus three bottom cards with no overlap” |
| R3 | The first bidder starts and the bid board is clean. | `setup()` | “starts bidding at the first bidder with a clean bid board” |
| R4 | Bidding values are 1, 2, 3 or pass; a raise must be higher. | `bid()` | “rejects a bid that is not higher than the current bid” |
| R5 | The highest bid wins the bottom cards and the opening lead. | `bid()`, `startPlaying()` | “gives the bottom cards to the highest bidder” |
| R6 | A bid of 3 ends bidding immediately. | `bid()` | “ends bidding immediately on a three bid” |
| R7 | Three passes redeal; the first bidder rotates. | `bid()`, `newDeal()` | “redeals after three passes” |
| R8 | Bottom cards are hidden during bidding and public after it. | `view()` | “keeps the bottom cards hidden during bidding and shows them after the bid” |
| R9 | A single is one card; a pair is two of one rank; a triple is three. | `detectCombo()` | “recognises single, pair and triple” |
| R10 | Triple + single and triple + pair are distinct combinations. | `detectCombo()` | “recognises triple with a single or a pair” |
| R11 | A straight has five or more consecutive ranks from 3 to A. | `detectCombo()` | “recognises straights of five or more and rejects short, gapped or two-high runs” |
| R12 | Consecutive pairs need three or more pair ranks. | `detectCombo()` | “recognises consecutive pairs of three or more” |
| R13 | A bare airplane is two or more consecutive triples. | `detectCombo()` | “recognises a bare airplane” |
| R14 | Airplane + single wings uses *n* spare cards for *n* triples. | `detectCombo()` | “recognises airplane with single wings” |
| R15 | Airplane + pair wings uses *n* spare pairs for *n* triples. | `detectCombo()` | “recognises airplane with pair wings” |
| R16 | An extra triple is not accepted as ambiguous single wings. | `detectCombo()` | “rejects an extra triple used as single airplane wings” |
| R17 | Four + two singles, including a pair as the two singles. | `detectCombo()` | “recognises four with two singles or two pairs” |
| R18 | Four + two pairs requires two distinct pair ranks. | `detectCombo()` | same |
| R19 | Four of a kind is a bomb; both jokers are the rocket. | `detectCombo()` | “recognises bombs and the rocket” |
| R20 | A duplicate physical card is never a combination. | `detectCombo()` | “rejects a duplicate physical card” |
| R21 | A response needs the same type, the same length and a higher rank. | `beats()` | “requires the same type and card count, and a higher rank” |
| R22 | Bombs beat non-bombs; higher bombs beat lower bombs; the rocket beats all. | `beats()` | “lets bombs beat non-bombs and the rocket beat everything” |
| R23 | A play removes the exact cards, records the combo and advances the turn. | `play()` | “removes played cards, records the play, and advances the turn” |
| R24 | The lead player cannot pass. | `pass()` | “does not allow the leader to pass” |
| R25 | Two passes reset the trick to the last player. | `pass()` | “resets the trick to the last player after two passes” |
| R26 | A play must own every card and form a legal shape. | `validatePlay()` | “rejects cards that are not in the hand and illegal shapes” |
| R27 | A legal shape must beat the last play. | `validatePlay()` | “rejects a legal shape that does not beat the last play” |
| R28 | Hands sort by rank, with jokers at the top. | `sortHand()` | “sorts a hand by rank and keeps every card” |
| R29 | Each seat view exposes its own hand, public counts and action flags only. | `view()` | “exposes seat-specific action flags” |
| R30 | A landlord win scores +2 stakes and −1 stake to each farmer. | `play()`, `finishRound()` | “awards a landlord win and doubles the stake for a spring” |
| R31 | Either farmer emptying wins the farmer side. | `play()`, `finishRound()` | “awards a farmer win when either farmer empties” |
| R32 | A farmer spring applies when the landlord played only once. | `finishRound()` | “counts a farmer spring when the landlord has played only once” |
| R33 | Every bomb and rocket doubles the multiplier. | `play()`, `finishRound()` | “multiplies by every bomb and rocket” |
| R34 | Playing a bomb increments the public bomb count. | `play()` | “increments the bomb counter when a bomb is played” |
| R35 | AI bids are legal and deterministic with the same RNG. | `chooseBid()` | “bids a legal value and is deterministic with the same RNG” |
| R36 | AI plays and passes are legal across a full round. | `choosePlay()`, `play()`, `pass()` | “never returns an illegal play over a complete AI round” |
| R37 | AI finishes when its last card can be played. | `choosePlay()` | “finishes with its last card when it can” |
| R38 | A farmer AI does not beat its farmer partner without need. | `choosePlay()` | “lets a farmer partner keep the lead” |
| R39 | AI preserves a bomb when a cheap answer exists and uses it when forced. | `choosePlay()` | “prefers a cheap answer to a bomb when one exists”; “uses a bomb when it is the only answer” |
| R40 | The hint says why it passes or which combination to play. | `hintPlay()` | “gives a reasoned hint for a partner pass”; “gives a reason for a hinted combination” |
| R41 | Same seed produces the same deal. | `setup()`, `shuffle()` | “is deterministic for the same injected RNG” |
| R42 | Autosave round-trips a valid state and rejects malformed data. | `storage.ts` | `tests/storage.test.ts` “round-trips a valid game and rejects a malformed one” |
| R43 | Family-record arithmetic updates sides, stake, best stake and recent rows. | `storage.ts` | `tests/storage.test.ts` “adds a landlord result and keeps the best stake” |
| R44 | Malformed stored records normalise to a safe record. | `storage.ts` | `tests/storage.test.ts` “normalises malformed stored data to a safe record” |
| R45 | Clearing the record is persistent. | `storage.ts` | `tests/storage.test.ts` “clears the stored record” |

## Scoring examples

| Situation | Base | Bombs | Spring | Multiplier | Stake | Landlord | Each farmer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Landlord wins, no bomb, farmers played | 2 | 0 | No | 1 | 2 | +4 | −2 |
| Farmers win, one bomb | 3 | 1 | No | 2 | 6 | −12 | +6 |
| Landlord wins, two bombs, farmers never played | 1 | 2 | Yes | 8 | 8 | +16 | −8 |

## AI

- **Companion** avoids bombs and jokers when a simple answer exists, and passes
  often to let a child keep the lead.
- **Easy** chooses legal but loose plays, with occasional random passes and bombs.
- **Normal** keeps its shape, prefers the cheapest answer and covers a farmer
  partner by passing when the partner owns the trick.
- **Hard** uses the same honest information, scores each candidate by the estimated
  number of remaining turns, preserves four-of-a-kind groups, and uses a bomb when
  an opponent is nearly out or no cheap answer exists.
- All levels are deterministic with an injected RNG and never read a hidden hand.
  The hint uses the same candidate generator and returns a reason code.

## LAN audit

- The host holds `GameState`; guests receive `view(state, seat)` for their own seat
  only. `view()` copies the seat's hand and **no other hand**.
- During bidding `view().bottom` is empty. After the landlord is fixed, bottom cards
  are public.
- Guest intents are accepted only from a seat currently in `humanSeats`; the host
  re-validates turn, ownership, shape and beat rules before calling `play()` or
  `pass()`.
- A disconnected guest seat is taken over by AI; when the same device rejoins with
  its stored token, the host sends the current seat view again.
- Closing the room sends a `closed` result and returns guests to the join screen.
- Undo and hints are disabled in LAN play.
