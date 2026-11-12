# Spades · rule audit

Every rule has code, a test, and an edge case. The engine lives in
`src/game/spades.ts` and has no DOM, network, clock or `Math.random` dependency.
The suite has **43 unit tests** across the engine, the four AI levels, hints and the
family record.

## Seats and deal

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | Four seats, fixed partnerships: 0 + 2 (South–North) versus 1 + 3 (West–East). | `teamOf()` / `partnerOf()` | views and AI partner tests |
| R2 | A 52-card deck is dealt 13 cards to each seat; cards are unique. | `setup()` / `deal()` | “deals 52 unique cards…” |
| R3 | All shuffles take an injected RNG; the same RNG seed deals the same hands. | `setup({rng})` / `nextRound(state, rng)` | “is deterministic for a given RNG…” |
| R4 | The dealer rotates; bidding begins to the dealer’s left and the dealer bids last. | `setup()` / `nextRound()` | “runs bidding in order…” and “rotates the dealer…” |
| R5 | The first trick is led by the dealer’s left-hand seat. | `bid()` completion | “runs bidding in order…” |
| R6 | The deal starts at dealer 3 in the app so the human at seat 0 bids and leads first; later rounds rotate. | app `setup` call | seat 0 in the view tests |

## Bidding

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R7 | Each seat bids once, 0–13; 0 is nil. | `bid()` | “runs bidding in order…” |
| R8 | A normal bid requires the seat to have looked at its hand. | `bid()` `not-seen` | “requires a look before a normal bid…” |
| R9 | Blind nil is a 0 bid declared before looking; it is rejected after a look or when the table disallows it. | `bid(..., blind)` | same + “rejects blind nil…” |
| R10 | A bid outside 0–13 or out of turn is rejected. | `bid()` | “rejects bids outside…” |
| R11 | When all four bids are in, play starts and every seat has seen its hand. | `bid()` | “runs bidding in order…” |
| R12 | A per-seat view hides the hand until that seat looks, and never contains another seat’s cards. | `reveal()` / `view()` | “hides the hand…” and “never exposes…” |

## Play and tricks

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R13 | Follow the led suit if possible; otherwise any card. | `legalCards()` | “must follow the led suit…” |
| R14 | Spades may not be led until broken, unless the hand holds only spades. | `legalCards()` / `play()` | “cannot lead spades until broken…” |
| R15 | Any spade played — as trump or discard — breaks spades. | `play()` | “breaks spades…” |
| R16 | Highest spade wins; otherwise the highest card of the led suit. Off-suit non-trump cards never win. | `trickWinner()` | “lets the highest spade win…” |
| R17 | A played card leaves that seat’s hand; the trick is completed after four cards; the winner leads. | `play()` | “completes a trick…” |
| R18 | A card not in hand, an out-of-turn play, and a follow-suit violation are rejected. | `play()` | “rejects a card…” |
| R19 | The engine never mutates the state passed in. | `play()` / `bid()` | “does not mutate…” |

## Scoring

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R20 | A made contract pays 10 per bid plus 1 per overtrick. | `scoreRound()` | “pays a made contract…” |
| R21 | A set contract loses 10 per bid. | `scoreRound()` | “sets a contract…” |
| R22 | Nil pays +100 when the bidder takes no trick and −100 when they take one. | `scoreRound()` | “adds a nil bonus…” and “penalises a failed nil…” |
| R23 | Blind nil pays ±200. | `scoreRound()` | “pays blind nil at ±200” |
| R24 | A nil bidder’s tricks do not count toward the partnership contract and do not become bags. | `scoreRound()` | “penalises a failed nil…” |
| R25 | Overtricks become bags; every ten bags costs 100 and removes ten bags. | `scoreRound()` | “charges 100 when ten bags accumulate…” |
| R26 | Both partners can bid nil; each is scored separately. | `scoreRound()` | “handles both partners going nil” |
| R27 | The first partnership to 500 wins; if both pass 500, the higher score wins; an exact tie continues. | `matchWinner()` / `finishRound()` | “ends the match at the target…” |
| R28 | The engine completes 13 tricks, scores once, and exposes a round summary. | `finishRound()` / `nextRound()` | “finishes a round…” |
| R29 | A full match can reach a winner and stop. | `play()` / `nextRound()` | “plays a full match…” |

## AI

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R30 | Every level returns a legal bid and card. | `chooseBid()` / `chooseCard()` | “returns a legal bid…” |
| R31 | All levels follow suit. | `chooseCard()` | “follows suit with every AI level” |
| R32 | Hard is deterministic with the same injected RNG. | `chooseCard(..., rng)` | “is deterministic…” |
| R33 | Companion and Normal duck when the partner already wins the trick. | `cardScore()` | “ducks when partner…” |
| R34 | AI covers a partner who went nil. | `cardScore()` | “covers a partner…” |
| R35 | A nil bidder avoids winning a trick. | `cardScore()` | “keeps a nil bidder away…” |
| R36 | AI lets an opponent’s nil bid take the trick. | `cardScore()` | “lets an opponent’s nil…” |
| R37 | Hard samples only unseen cards for its deterministic trick simulation; it never reads hidden hands. | `winChance()` | view and AI tests; code audit |
| R38 | Hints are legal and carry a reason. | `hintBid()` / `hintPlay()` | “offers a nil hint…” and “gives a legal card hint…” |

## Bags, nil and the chosen variant

The engine uses one common family-table variant and documents it clearly:

- The partnership contract is the sum of **non-nil** bids.
- A nil bidder must take zero tricks. Their tricks do **not** count toward the
  partnership contract and do **not** become bags. Taking one fails the nil and pays
  −100 (or −200 for blind nil).
- A made contract adds 10 per bid plus 1 per overtrick; overtricks become bags.
- At the end of a round, while a team has 10 or more bags, subtract 100 points and
  remove 10 bags. The remainder carries into the next round.
- Scores may go negative. The match ends after scoring a round when at least one team has
  reached 500; if both have, the higher score wins; an exact tie continues.
- Blind nil is only offered before a seat has looked at its cards. The UI presents
  “Look at my cards” and “Blind nil” behind a cover; `seen` is tracked in the engine and a
  blind bid after looking is rejected. AI seats always look before bidding, so blind nil
  is a human option.

## Privacy

- `view(state, seat)` returns only that seat’s hand, plus public bids, current/last trick,
  trick counts, scores, bags, dealer, target, round summary and legal card IDs.
- During bidding, a seat’s hand is empty in its own view until it reveals.
- Hot-seat play uses a hand cover on every change of seat during play, and the blind/reveal
  cover before a bid. The underlying hand is not rendered while covered.
- LAN play sends one view per connected guest seat. Intents are accepted only for the
  guest’s assigned seat and are re-validated by the engine on the host. Undo and hints are
  disabled in LAN play.

## Hints and comforts

- Hints use the Hard player with a fixed neutral RNG. Bidding hints explain nil, partner
  cover, strong spades, side aces, bag risk or a balanced hand. Card hints explain win,
  lead, follow, duck, trump, nil cover, bag guard or a low card.
- Undo stores full engine snapshots locally. In solo it steps back to the human’s previous
  decision; in hot-seat it steps back one action. LAN undo is disabled.
- Autosave stores the engine state, mode and AI level in `localStorage`; the home screen
  offers Continue. A completed match clears the save and writes one record entry on the
  host/local device. Guests never write the host record.
- The family record stores matches, wins for each partnership, rounds played, mode split
  and the eight most recent results.

## Screen fixture note

`scripts/shots.mjs` uses `?demo=round` and `?demo=end`. Each builds a valid engine state
with the real engine (the end fixture plays a complete AI-vs-AI match to 500) so the
round-summary and match-end screenshots are genuine renders rather than mockups.
