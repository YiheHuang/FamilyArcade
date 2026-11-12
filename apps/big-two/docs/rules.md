# Big Two · rule audit

The engine is `src/game/big-two.ts`. It has no DOM, network, clock or
`Math.random` dependency; dealing and AI tie-breaks use the injected RNG. The
suite is three files and **40 tests**:

- `tests/game.test.ts` — 30 engine, AI, hint and privacy tests.
- `tests/storage.test.ts` — 6 autosave and family-record tests.
- `tests/i18n.test.ts` — 4 bilingual-copy and language tests.

## Core rules

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | One standard 52-card deck; ranks 3 low … 10, J, Q, K, A, 2 high. | `DECK`, `RANKS`, `rankLabel` | “has 52 unique cards with the Big Two rank and suit order” |
| R2 | Suit order is diamonds < clubs < hearts < spades. | `SUITS`, `SUIT_VALUE`, `compareCard` | same |
| R3 | Four seats receive thirteen cards each. | `setup()`, `deal()` | “deals thirteen cards to each seat and finds the 3 of diamonds” |
| R4 | The holder of 3♦ leads the first trick. | `setup()` `starter` | same |
| R5 | The first play must include 3♦. | `checkPlay()` `must-lead-diamond`, `legalCombos()` | “forces the holder of 3D to lead with it” |
| R6 | A first lead that includes 3♦ is legal, even as part of a pair, triple or five-card hand. | `checkPlay()`, `legalCombos()` | “accepts a first lead that includes 3D”, “legalCombos returns only beating plays and only D3 first leads” |
| R7 | A single is one card. | `classify()` | “classifies singles, pairs and triples and rejects mixed ranks” |
| R8 | A pair is two cards of one rank; a triple is three of one rank. | `classify()` | same |
| R9 | Four cards of one rank are not a legal four-card play. | `classify()` size guard | same |
| R10 | A straight is five consecutive ranks from 3 through Ace. | `classify()` `consecutive` | “classifies straights and rejects gaps and the 2” |
| R11 | Ace is high in a straight; the 2 is never part of a straight and there is no A-2-3-4-5 wheel. | `classify()` `ranks[4] <= 14` | same |
| R12 | A flush is five cards of one suit. | `classify()` `sameSuit` | “classifies flushes, full houses, four plus one and straight flushes” |
| R13 | A full house is three of one rank plus a pair. | `classify()` | same |
| R14 | Four plus one is four of one rank plus any fifth card. | `classify()` | same |
| R15 | A straight flush is five consecutive cards of one suit. | `classify()` | same |
| R16 | Five-card order is straight < flush < full house < four plus one < straight flush. | `category` in `classify()`, `beats()` | “orders five-card hands straight < flush < full house < four < straight flush” |
| R17 | Five-card hands of the same category compare by main rank; full houses use the triple rank then the pair rank; flushes and straights use the high card, then its suit. | `beats()` | “compares five-card hands inside the same category” |
| R18 | Singles, pairs and triples compare by rank, then by the highest suit in the group. | `beats()` | “compares singles, pairs and triples by rank then suit” |
| R19 | A follower must play the same number of cards as the table and beat it. | `checkPlay()`, `beats()` | “legalCombos returns only beating plays and only D3 first leads” |
| R20 | A player may pass only when there is a trick to beat. | `pass()` `no-trick` | “applySeat enforces the seat and action shape” |
| R21 | A player who passes cannot re-enter until the trick clears. | `passed[]`, `checkPlay()` | “passes, locks the seat out and clears the trick after three passes” |
| R22 | When every other seat passes, the last player to play leads the next trick. | `pass()`, `nextEligible()` | same |
| R23 | If the last player has emptied their hand, the round is already over, so no ghost lead is created. | `play()` round-over guard | “ends immediately when a hand empties and scores the remaining cards” |
| R24 | A play removes exactly the selected cards and advances to the next eligible seat. | `play()`, `nextEligible()` | “plays a card, removes it and advances the turn” |
| R25 | `play()`, `pass()` and `applySeat()` never mutate the old state. | immutable updates | “rejects illegal plays without mutating the state” |
| R26 | The first seat to empty its hand wins immediately. | `play()` `round-over`, `winner` | “ends immediately when a hand empties and scores the remaining cards” |
| R27 | Every loser pays one point per remaining card. | `penaltyForCount()` | “ends immediately …”, “doubles at ten cards and triples at thirteen” |
| R28 | Ten to twelve cards left pays double. | `penaltyForCount()` | same |
| R29 | Thirteen cards left pays triple. | `penaltyForCount()` | same |
| R30 | The winner collects the sum of the three penalties. | `scoreRound()` `gain` | “ends immediately …” |

## Comparison notes

The five-card categories are compared across categories, as required by the
“five-card order” in the brief. A flush therefore beats a straight; a full house
beats a flush. Some family tables require the same five-card type to follow; this
app uses the published hierarchy instead. The choice is called out in
`docs/limitations.md`.

The 40-test suite asserts more than one rule in several cases; the table below
cross-references behaviour rather than claiming one test per row.

For the final tie-break, the highest card in the combination decides the suit:
spades > hearts > clubs > diamonds. A pair or triple of the same rank is ordered
by its highest suit, so `S3 H3` beats `C3 D3`.

## Turn engine in detail

1. Shuffle the deck with the injected RNG and deal round-robin. Sort each hand by
   rank and suit so the lowest card is leftmost.
2. Find the seat holding 3♦, make it the starter and set `mustLeadDiamond`.
3. A lead may be any legal combination. `legalCombos()` enumerates singles, pairs,
   triples and the four kinds of five-card combinations, then filters the lead for
   combinations containing 3♦.
4. A follower gets only combinations of the table's size that `beats()` the table.
   Passing is a separate action.
5. A play records the trick, removes the cards to the public discard and advances
   to the next seat that is active and has not passed.
6. A pass marks the seat. If the next eligible seat is the player who owns the
   current trick, the trick clears and that player leads again.
7. When a hand reaches zero, the phase becomes `round-over`, the winner is stored
   and `scoreRound()` freezes the counts, multipliers and penalties.

## Privacy, LAN and comfort rules

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R31 | A seat view contains only that seat's hand plus public table data. | `view()` | “view exposes only the requested hand and public counts” |
| R32 | The view never contains another hand or a `hands` array. | `view()` | same |
| R33 | The host re-checks seat, turn, ownership, combination and stale action count. | `applySeat()`, `App.tsx` intent guard | “applySeat enforces the seat and action shape” |
| R34 | A LAN guest receives its own view after every host action. | `sendViews()` | LAN E2E |
| R35 | A disconnected guest seat is played by a safe fallback after a short wait. | `fallbackAction()` | “fallbackAction always returns a legal action” |
| R36 | AI returns a legal action at every level. | `chooseAiAction()` | “AI returns a legal action at every level” |
| R37 | AI is deterministic with an injected RNG. | `chooseAiAction(…, rng)` | “AI is deterministic with an injected RNG” |
| R38 | AI never reads a hidden hand; it uses only its own cards, public counts and the discard. | `ai/ai.ts` | “Companion avoids spending a 2 …”, “Hard leads a multi-card …” |
| R39 | Hard uses hand decomposition, danger counting, suit control and endgame leads. | `chooseAiAction()` `playValue()`, `decomposeHand()` | “Hard leads a multi-card combination …”, “decomposeHand covers every card …” |
| R40 | A hint is a legal action and explains its reason. | `hintFor()` | “hint explains the forced diamond lead”, “hint recommends a legal beat or pass” |
| R41 | A hint is unavailable out of turn or after the round. | `hintFor()` | “hint returns null out of turn and after the round” |
| R42 | The record stores winner, gain, counts, penalties, mode, level and time. | `addGame()` | “records a finished game with mode, winner, gain and recent list” |
| R43 | Only the eight newest games and the all-time winner tally are kept. | `addGame()` | “increments human wins only for seat zero” |
| R44 | Malformed records and saves are rejected or normalized. | `normalizeRecord()`, `loadSave()` | “normalizes malformed records safely”, “saves and loads a game, and rejects malformed saves” |
| R45 | English UI has no Chinese except the language switch. | `MESSAGES.en` | “keeps Chinese out of the English UI except the language switch” |
| R46 | Chinese UI has no English words except the switch and card ranks. | `MESSAGES.zh` | “keeps English words out of the Chinese UI except the switch and card ranks” |

## AI notes

- **Companion** prefers low cards, avoids spending a 2 when a smaller card is
  enough, and steps aside when a child has one or two cards left.
- **Easy** mixes cheap plays with random choices and occasional passes.
- **Normal** scores each candidate after the play: remaining hand size, greedy
  decomposition, control cards, broken groups and the danger of the next seat.
  It saves high cards for later and passes when the table is not worth beating.
- **Hard** ranks candidates cheaply, then spends a decomposition lookahead on the
  best 44. It counts how many cards each opponent holds, leads pairs/triples/five-
  card hands when a short opponent can only follow with one card, avoids spending
  a 2 early, and prefers low safe leads when it owns the top card in a suit.
- All levels are deterministic for a given state and injected RNG. The app supplies
  a state-derived seed at the UI edge; tests supply their own seed.
- `decomposeHand()` extracts up to two five-card blocks when they reduce the number
  of plays, then groups the rest into triples, pairs and singles. It is used for
  hand planning and the endgame score, never to read another player's cards.

## LAN protocol

- The host owns the authoritative `GameState`.
- A guest sends only `{type:'play', cards:[ids], actions}` or
  `{type:'pass', actions}`. The host ignores a stale `actions` count, a spoofed
  seat, a wrong turn or an illegal combination.
- After every action the host sends each connected seat `view(state, seat, names)`.
  No message ever contains the `hands` array.
- Hot-seat uses the same `view()` function with the current seat and shows a
  pass-the-device curtain before revealing a hand.
- A guest who reloads reconnects with the same client token and receives the
  current private view. A guest joining after the deal may take over an empty AI
  seat; a human seat is never taken over.
- Closing the room broadcasts `{kind:'closed'}` before the socket closes.
