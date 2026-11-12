# Zheng Shangyou · rule audit

The engine is `src/game/zheng-shangyou.ts`, the four opponents are
`src/ai/ai.ts`, the reasoned hint is `src/ai/hint.ts`, and the suite is
`tests/game.test.ts` with **53 tests**. The rules layer has no DOM, network,
clock or `Math.random` dependency; dealing and AI sampling use the injected RNG.

## Core rules

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | One standard 52-card deck, no jokers. | `DECK`, `SUITS`, `RANKS` | “has 52 unique cards and the classic climbing ranks” |
| R2 | Rank order is 3 low … Ace, 2 highest; suits never compare for play strength. | `RANKS`, `detectCombo`, `canBeat` | R1 test and “compares only same type and length, strictly higher” |
| R3 | 3–6 players receive all 52 cards, dealt as evenly as possible. | `setup()`, `deal()` | “deals all 52 cards as evenly as possible to 3/4/5/6 players” |
| R4 | The holder of 3♣ leads the first trick of every deal. | `setup()`, `nextRound()`, `beginRound()` | deal tests and “returns any card and then starts with the 3♣ holder” |
| R5 | That first play must include 3♣. | `checkPlay()`, `legalPlays()` | “enforces the 3♣ opening lead” |
| R6 | A single is one card. | `detectCombo()` | “detects every supported combination” |
| R7 | A pair is two cards of one rank. | `detectCombo()` | same |
| R8 | A triple is three cards of one rank. | `detectCombo()` | same |
| R9 | Triple + single is three of a rank plus any one other card. | `detectCombo()` | same |
| R10 | Triple + pair is three of a rank plus a pair of another rank. | `detectCombo()` | same |
| R11 | A straight is five or more consecutive single ranks from 3 to Ace. | `detectCombo()`, `allCombos()` | “allows long straights and pair roads up to the ace” |
| R12 | Consecutive pairs are three or more consecutive pairs from 3 to Ace. | `detectCombo()`, `allCombos()` | same |
| R13 | A bomb is exactly four cards of one rank. | `detectCombo()` | “detects every supported combination” |
| R14 | A 2 may be played in singles, pairs, triples and their kickers, but not in a straight or pair road. | `detectCombo()` | “rejects malformed, gapped and two-containing roads” |
| R15 | Followers must use the same type and length. | `canBeat()` | “compares only same type and length, strictly higher” |
| R16 | The follow must be strictly higher; an equal rank does not beat. | `canBeat()` | same |
| R17 | A bomb beats any non-bomb. | `canBeat()` | “lets a bomb beat any non-bomb and higher bombs beat lower bombs” |
| R18 | Bombs compare only by rank with other bombs. | `canBeat()` | same |
| R19 | Invalid shapes are rejected before comparison. | `detectCombo()`, `checkPlay()` | “rejects malformed, gapped and two-containing roads” |
| R20 | Wrong seat, empty selection, duplicate card and foreign card are rejected. | `checkPlay()` | “rejects wrong turns, foreign cards, empty plays and weaker combos” |
| R21 | A legal play removes the cards and advances to the next active seat. | `play()` | “removes played cards and advances to the next active seat” |
| R22 | A pass is illegal on a fresh trick. | `pass()` | “refuses a pass on a fresh trick” |
| R23 | Two consecutive passes clear the trick. | `pass()`, `passes` | “clears the trick after two consecutive passes” |
| R24 | The two-pass rule is literal even at five or six seats; other players do not have to pass first. | `pass()` `passes >= 2` | “uses exactly two passes even with five active seats” |
| R25 | After a clear, the last player to play leads; if that seat is out, the next active seat leads. | `clearTrick()` | “moves the lead to the next active seat when the trick winner is out” |
| R26 | A new play resets the consecutive-pass counter. | `play()` `passes: 0` | “uses exactly two passes…” and full-round tests |
| R27 | There is no per-seat lock-out; the engine counts only consecutive passes. | `GameState` has no `passed[]` | documented table choice; see `docs/limitations.md` |
| R28 | Emptying a hand joins the finish order at once. | `play()`, `finish[]` | “records upstream, middle places and downstream” |
| R29 | Play continues until all but one seat are out. | `play()`, `finishRound()` | “finishes a complete round for every table size” |
| R30 | Finish order is upstream, second, third, … downstream, unique and complete. | `completeOrder()`, `order` | same |
| R31 | Play and pass never mutate the previous state. | immutable updates | “never mutates the state passed into play or pass” |

## Scoring

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R32 | Four seats score +3 / +1 / −1 / −3. | `pointsFor()` | “uses scaled zero-sum points for every seat count” |
| R33 | Three seats score +3 / 0 / −3. | `pointsFor()` | same |
| R34 | Five seats score +3 / +1 / 0 / −1 / −3. | `pointsFor()` | same |
| R35 | Six seats score +3 / +2 / +1 / −1 / −2 / −3. | `pointsFor()` | same |
| R36 | Every table size is zero-sum. | `pointsFor()`, `pointsSummary()` | same |
| R37 | Round points are stored per seat, not per place, for the UI and record. | `finishRound()` | “finishes a complete round…” and “records the full order…” |
| R38 | Scores accumulate across deals. | `finishRound()`, `nextRound()` | “carries cumulative scores across deals” |

The four-seat table is the traditional +3 / +1 / −1 / −3. The other tables use
the same endpoints and an integer, zero-sum scale; this is the explicit family
choice for three, five and six seats.

## Tribute and next deal

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R39 | A finished round can deal the next one. | `nextRound()` | “pauses the next deal for tribute and moves the highest card” |
| R40 | At three or four seats the downstream seat pays tribute to the upstream seat. | `tributePairs()` | “pairs the bottom of the order with the top” |
| R41 | At five or six seats the bottom two both pay: last→first and second-last→second. | `tributePairs()` | “pairs the bottom…” and “makes both downstream seats pay tribute…” |
| R42 | The given card is the giver's highest card. | `takeHighest()` | “pauses the next deal…” |
| R43 | The receiver returns any card from their own hand. | `returnTribute()` | “returns any card and then starts with the 3♣ holder” |
| R44 | Hand sizes and the 52-card total survive the tribute. | `returnTribute()`, `beginRound()` | same |
| R45 | Tribute is optional at setup and can be switched off. | `tributeEnabled` | “can switch tribute off” |
| R46 | The first lead after tribute is recomputed from the final 3♣ holder. | `beginRound()` | “returns any card and then starts with the 3♣ holder” |
| R47 | A tribute card must belong to the returning receiver and a pending pair must exist. | `returnTribute()` | “validates tribute ownership and turn” |

## Privacy, hints, AI and record

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R48 | A seat view contains only that seat's hand plus public table data. | `view()` | “shows only the requested hand and the public table” |
| R49 | The view never contains a `hands` array or another seat's cards. | `view()` | same |
| R50 | A tribute choice is visible only to its receiver. | `view()` `canTribute` | “enforces the seat and exposes the tribute choice only to its receiver” |
| R51 | `applySeat()` re-checks the seat, turn and action. | `applySeat()` | same and “validates tribute ownership and turn” |
| R52 | AI returns a legal action at every level. | `chooseAiAction()` | “returns legal actions at every level” |
| R53 | AI is deterministic with an injected RNG. | `chooseAiAction()` | “is deterministic with an injected RNG” |
| R54 | Hard samples only unseen cards and never reads real hidden hands. | `sampleHidden()` | “does not read opponents hidden cards” |
| R55 | Companion is gentle with high cards when a cheaper legal beat exists. | `chooseAiAction('companion')` | “keeps Companion gentle…” |
| R56 | AI tribute return avoids 3♣ and pairs when a safe low singleton exists. | `chooseTributeReturn()` | “returns a low, non-3♣ tribute card when possible” |
| R57 | A dropped LAN seat still has a legal fallback. | `fallbackAction()` | “offers a legal fallback for a dropped LAN seat” |
| R58 | Hand decomposition extracts bombs, roads, triples with kickers, pairs and singles. | `decomposeHand()`, `handPlan()` | “counts a triple…”, “keeps a straight…”, “keeps consecutive pairs…”, “keeps every card in valid combinations…” |
| R59 | Hints are legal and explain their reason. | `hintFor()` | “explains the forced 3♣ lead…”, “recommends a legal beat…”, “suggests a tribute return…” |
| R60 | No hint is offered out of turn or after the round. | `hintFor()` | “returns no hint out of turn or after the round” |
| R61 | The record stores the complete order, per-seat points and winner. | `addRound()` | “records the full order, round points and winner” |
| R62 | Only the eight newest rounds and the mode/level split are kept. | `addRound()`, `normalizeRecord()` | “counts modes and keeps only the eight newest rounds” |
| R63 | Malformed legacy records are normalized safely. | `normalizeRecord()` | “normalizes malformed and legacy records” |
| R64 | A playing round cannot be recorded as finished. | `addRound()` | “ignores a round that has not finished” |
| R65 | English has no Chinese UI copy except the language switch. | `MESSAGES.en` | “keeps Chinese out of the English UI…” |
| R66 | Chinese has no English UI copy except the switch and technical card names. | `MESSAGES.zh` | “keeps English words out of the Chinese UI…” |

The final suite count is **53 tests**; several tests assert more than one rule, and
the audit cross-references behaviour rather than one test per row.

## Turn engine in detail

1. Shuffle with the injected RNG, deal round-robin, sort every hand.
2. Find 3♣ and make that seat the starter. `mustLeadClubs` is true until the first
   valid lead.
3. A lead is any legal combination that includes 3♣ (or any legal combination after
   the first trick). A follower must beat the current combo with the same type and
   length, or with a bomb.
4. A play removes the cards, sets the trick, resets the pass counter to zero, appends
   the cards to the public discard and moves to the next active seat.
5. A pass increments the counter. On the second consecutive pass the trick clears
   and returns to the last player (or the next active seat if that player is out).
6. An empty hand joins the finish order. When only one seat has cards, it is
   appended as downstream, the phase becomes `round-over`, and the score table is
   applied per seat.
7. `nextRound()` deals again. With tribute on, it pauses in `tribute`, moves the
   forced highest cards, and waits for each receiver's return. `beginRound()` then
   re-finds 3♣ and starts the next deal.

## AI notes

- **Companion** prefers low cards, avoids spending a 2 when a smaller beat is
  enough, avoids bombs on a child, and passes more often when the human has one or
  two cards left.
- **Easy** picks from legal plays with a low-card bias and sometimes passes or
  plays at random.
- **Normal** scores the resulting hand with `handPlan()`: minimum sets, control
  cards, broken groups, the trick owner and opponent hand counts. It saves twos and
  bombs for the endgame.
- **Hard** ranks legal actions with the heuristic, then samples the unseen cards
  (deck minus own hand and discard) into the opponents' known hand counts and rolls
  the round forward for the best candidates. It never reads the real hidden hands.
- All levels are deterministic with the injected RNG. The app supplies `Math.random`
  only at the UI edge; tests use a seeded generator.
- `chooseTributeReturn()` returns a low singleton, avoids 3♣ and avoids breaking a
  pair when possible. The human receiver uses the same recommendation through the
  hint but may choose any card.

## LAN protocol

- Host state is authoritative. Guests send only
  `{type:'play', cards:[ids], actions}`, `{type:'pass', actions}` or
  `{type:'tribute', card, actions}`.
- The host checks the seat, `actions === state.actions`, phase, turn, ownership,
  combination type and length again through `applySeat()`. A stale or spoofed
  intent is ignored.
- After every host action, each connected guest seat receives
  `view(state, seat, names)` with its own hand only.
- A disconnected guest's turn is handled after 2.4 seconds with a legal fallback,
  so the table continues. If the guest reconnects, the host resends the current
  private view.
- A guest who joins after the deal may take over an empty AI seat. The host replaces
  that seat's AI name with the guest name, stops the AI for that seat and sends the
  inherited private hand. A human seat is never replaced.
- Closing the room sends `{kind:'closed'}` before the socket closes.
