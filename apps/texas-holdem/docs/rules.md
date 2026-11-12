# Texas Hold'em · rule audit

Every rule has code, a test, and an edge case. The pure engine lives in
`src/game/texas-holdem.ts` and `src/game/evaluator.ts`. It has no DOM, network,
clock or `Math.random` dependency; every shuffle takes an injected RNG.

The suite has **35 tests**. One test is exhaustive over all **2,598,960**
five-card hands; the rest cover deals, blinds, betting legality, short all-ins,
side pots, split pots, odd chips, showdown privacy, AI legality and seeded deals.

## Seats, deal and blinds

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | Two to six seats; a 52-card deck; play money only. | `setup()` / `MIN_SEATS` / `MAX_SEATS` | “deals two unique hole cards to every seat” |
| R2 | Every live seat gets two hole cards; no card is duplicated. | `beginHand()` / `makeDeck()` | same |
| R3 | All shuffles are injected; the same seed deals the same hands and deck. | `setup({ rng })` / `makeRng()` | “is deterministic for the same injected seed” |
| R4 | The button rotates; the seat left of it posts the small blind and the next seat posts the big blind. | `beginHand()` / `nextHand()` | “posts the blinds and enforces a full minimum raise” |
| R5 | Heads-up: the button posts the small blind, acts first pre-flop and last post-flop; the big blind acts first post-flop. | `beginHand()` / `firstPostflopActor()` | “uses heads-up button-small-blind rules…” |
| R6 | With three or more seats the player under the gun acts first; seat 0 is placed under the gun by the app. | `defaultButton()` | “places the button so seat 0 acts first pre-flop” |
| R7 | A player with no chips is out; the button moves to the next seat with chips. | `seatsWithChips()` / `nextHand()` | “rotates the button to the next seat with chips…” |
| R8 | A table ends when only one seat has chips. | `settle()` / `sessionOver` | “ends the table when one seat holds every chip” |

## Streets and betting

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R9 | Streets are pre-flop, flop, turn and river; the flop is three cards, the turn and river one each. | `dealNextStreet()` | “keeps the board and burn count correct street by street” |
| R10 | One card is burned before each community street; burn cards are never in a seat view. | `dealNextStreet()` / `view()` | same + “hides every other hand and the deck…” |
| R11 | Actions are fold, check, call, bet, raise and all-in. Check requires no call; bet requires no live bet. | `legalActions()` / `applyAction()` | “rejects a post-flop bet below the big blind” |
| R12 | A bet or raise uses a “raise to” total street contribution. | `Action.amount` / `applyAction()` | “posts the blinds and enforces a full minimum raise” |
| R13 | A full raise must be at least the previous bet or raise size. | `finishAggression()` | same |
| R14 | A short all-in raise is legal but does not reopen betting for seats that already acted. | `finishAggression()` / `canRaise` | “rejects a bet when a raise is required…” |
| R15 | A full all-in raise reopens betting and resets the minimum raise. | `finishAggression()` | “reopens betting after a full all-in raise” |
| R16 | A player cannot check facing a bet, bet while facing a bet, or raise without a raise right. | `applyAction()` | “rejects a bet when a raise is required…” |
| R17 | When only one player has chips and everyone else is all-in, the board runs out without further betting. | `bettingComplete()` / `progress()` | “runs out the board when everyone is all-in” |
| R18 | Engines never mutate the state passed in. | `cloneState()` | “does not mutate the state passed to an action” |
| R19 | A short all-in call can go to showdown without creating chips. | `settle()` / `totalPot()` | “lets a short all-in call go to showdown without inventing chips” |

## Pots, side pots and odd chips

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R20 | Every contribution, including folded and blind chips, belongs to a pot. | `buildPots()` / `totalPot()` | “builds three pots for unequal all-ins…” |
| R21 | Unequal all-ins create layered main and side pots. | `buildPots()` | same |
| R22 | An uncalled top layer is returned to its contributor, including when a folded bettor put in more than the last live caller. | `buildPots()` / `finishFold()` | “builds three pots…” and “returns a folded bettor’s uncalled excess…” |
| R23 | Split pots divide evenly; an odd chip goes to the first winning seat left of the button. | `buildPots()` | “splits a pot and sends the odd chip…” |
| R24 | Folded chips stay in the pot but a folded seat cannot win any layer. | `buildPots()` | “lets folded chips stay in the pot…” |
| R25 | Payouts always equal the pot and chips are conserved. | `settle()` | “conserves chips through a complete showdown” and “keeps side-pot shares whole…” |

## Hand evaluator

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R26 | Best five of seven wins; categories are royal flush, straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card. | `evaluate()` / `score5()` | “orders every hand category” |
| R27 | A royal flush is an ace-high straight flush and compares as the top straight flush. | `categoryName()` | “names the royal flush and the wheel correctly” |
| R28 | The wheel A-2-3-4-5 is a five-high straight; a six-high straight beats it. | `score5()` | same |
| R29 | A full house from two trips uses the higher trip and the lower trip as the pair. | `evaluate()` | “chooses the best full house from two trips” |
| R30 | The evaluator is exhaustive over every five-card hand. | `score5()` | “is exhaustive for all 2,598,960 five-card hands” |

The exhaustive test expects the standard distribution: 1,302,540 high-card,
1,098,240 one-pair, 123,552 two-pair, 54,912 three-of-a-kind, 10,200 straight,
5,108 flush, 3,744 full house, 624 four-of-a-kind and 40 straight flush hands.

## Showdown, privacy and views

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R31 | A fold ends the hand immediately and awards the pot without a showdown. | `finishFold()` | “ends the hand on a fold and awards the whole pot” |
| R32 | Showdown reveals only seats still in the hand; folded hole cards stay hidden. | `view()` / `revealed` | “never reveals folded hole cards at showdown” |
| R33 | A seat view contains only its own hole cards plus public information; never the deck, burn cards or another hand. | `view()` | “hides every other hand and the deck in a seat view” |
| R34 | Hot-seat covers every hand change; LAN sends one view per connected seat. | app `commit` / `sendViews` | E2E and LAN E2E |

## AI

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R35 | Every level returns a legal action. | `chooseAction()` | “returns a legal action for every level” |
| R36 | The same state + level + injected RNG gives the same decision. | `chooseAction()` / `makeRng()` | “is deterministic with the same injected RNG” |
| R37 | No level reads another seat’s hidden hand or the deck. Equity samples only unknown cards. | `estimateEquity()` | “never reads another seat’s hidden hand” |
| R38 | Hints are legal, deterministic and carry a reason. | `hintFor()` | “gives a legal, reasoned hint” |
| R39 | Companion is gentler than Hard (fewer samples, lower aggression, almost no bluff). | `PROFILES` | “keeps the companion gentler than hard…” |

## Table choices that are explicit

- Blinds are **10 / 20** and the starting stack is **1,000 play chips** in the UI.
  The engine accepts other values for tests and future table settings.
- The AI levels sample 40 / 60 / 110 / 180 unseen runouts (Companion, Easy, Normal,
  Hard). This is a heuristic, not a solver.
- A short all-in raise does not reopen the action. This is the standard no-limit
  rule and is tested.
- The odd-chip rule gives the whole remainder to the first winning seat clockwise
  from the button, not one chip to each winner.
- A session ends when one seat holds every chip. There is no rebuy in the UI.
- In solo play, if the human seat busts, the table ends for that seat and the
  session is recorded honestly; the AI seats do not keep playing behind a modal.
- Network undo and hints are disabled so nobody gains an information advantage.
- A hand is recorded when it ends. A session is recorded when the table ends or
  the solo human busts.

## Hints and comforts

- Hints use the Hard policy with a deterministic seed derived from the state. The
  toast names the recommended action and one reason: strong hand, pot odds,
  position, stack pressure, honest bluff, weak hand, check, call, value or all-in.
- Undo stores full engine snapshots. Solo rewinds through AI replies to the
  human’s previous decision; hot-seat rewinds one action. Undo is unavailable at
  showdown and in LAN play.
- Autosave stores the engine state, mode, level, seat count, seed and the last
  recorded hand number. The home screen offers Continue.
- Sound is a small Web Audio chime set. Reduced motion is a persisted toggle and
  also follows `prefers-reduced-motion`.
- Keyboard: F fold, C check/call, B bet/raise, A all-in, U undo, H hint, N next
  hand, Esc home. Guests can use the action keys; undo and hint stay disabled.
- The family record stores hands, showdowns, tables, tables won, the biggest pot,
  mode split and the eight most recent hands.

## Screen fixtures

`scripts/shots.mjs` uses `?demo=table`, `?demo=showdown` and `?demo=over`. Each
fixture is built by the real engine with a fixed RNG seed; the table shot is a
real flop, the showdown shot is a real seven-card evaluation, and the table-over
shot is a real sequence of all-in hands until one stack remains.
