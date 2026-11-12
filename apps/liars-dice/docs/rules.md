# Liar's Dice · rule audit

The engine is `src/game/liars-dice.ts`, a pure TypeScript module with no DOM,
network, clock or `Math.random` dependency. Rolls take an injected RNG. The test
suite is `tests/game.test.ts` with **57 tests**: setup, bid legality, wild ones,
challenges, spot-on, round rotation, elimination, per-seat views, AI, hints,
record, bilingual copy and the screenshot fixtures.

## Core rules

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | Two to six players, five dice each. | `setup()`, `MIN_PLAYERS`, `MAX_PLAYERS` | “deals five dice to every seat with values one to six”, “clamps the table to two through six players” |
| R2 | Every die is a value from one to six. | `rollDie()`, `rollDice()` | “deals five dice…” |
| R3 | Ones are wild by default. A one matches every face except a bid on ones. | `countFace()` | “counts wild ones for every face except a bid on ones” |
| R4 | The wild-one rule can be switched off. | `onesWild` | “counts exact faces when ones are not wild” |
| R5 | A bid is a quantity and a face, e.g. three fours. | `Bid`, `bid()` | “advances to the next living seat and records the bid” |
| R6 | The quantity may not exceed the dice left at the table. | `bid()`, `totalDice()` | “rejects bad quantities and bad faces” |
| R7 | A raise increases the quantity, or keeps it and increases the face. | `higherBid()`, `bid()` | “raises a bid by quantity”, “rejects an equal or lower face at the same quantity”, “rejects a lower quantity” |
| R8 | A bid outside 1–6 on the face is rejected. | `bid()` `bad-face` | “rejects bad quantities and bad faces” |
| R9 | Only the seat on turn may act. | `bid()`, `challenge()`, `spotOn()`, `applySeat()` | “rejects out-of-turn seats, bad seats and wrong phases”, “rejects malformed actions and wrong seats” |
| R10 | A player with no dice is skipped in turn order. | `nextAlive()` | “advances to the next living seat and records the bid” |
| R11 | A challenge reveals every cup and stops the turn. | `resolve()`, `challenge()` | “sets a reveal snapshot and pauses the turn” |
| R12 | If the bid is true, the challenger loses one die. | `resolve()` | “costs the challenger a die when the bid is true” |
| R13 | If the bid is false, the bidder loses one die. | `resolve()` | “costs the bidder a die when the bid is false” |
| R14 | The reveal count uses the same wild-one rule. | `resolve()`, `countFace()` | “counts wild ones in a challenge reveal” |
| R15 | A player at zero dice is out. | `resolve()` `outOrder` | “costs the challenger a die…”, “costs the bidder a die…” |
| R16 | The last player with dice wins. | `resolve()` `winner` | “ends the game when a challenge empties the last challenger hand” |
| R17 | A surviving loser starts the next round. | `nextStarter` | “lets a surviving loser start the next round” |
| R18 | If the loser is out, the next player clockwise starts. | `nextAliveIn()` | “passes the next start clockwise when the loser is eliminated” |
| R19 | The next round rerolls every remaining die. | `nextRound()` | “rerolls every living hand in the next round and clears the table” |
| R20 | A round cannot start from bidding or game over. | `nextRound()` `bad-phase` | “refuses to start a round outside a reveal” |
| R21 | The loser's die is removed only after the reveal snapshot. | `resolve()` | “sets a reveal snapshot…”, “does not mutate the state passed into a challenge” |
| R22 | A challenge cannot be made before any bid. | `challenge()` `no-bid` | “requires a current bid and the right turn for a call” |

## Spot on (optional table rule)

Spot on is off by default and can be enabled at setup or in the LAN host card.
It is a call on the current bid, not an extra raise.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R23 | An exact spot-on call costs the bidder one die. | `spotOn()`, `resolve()` | “resolves spot on exactly and costs the bidder a die” |
| R24 | A missed spot-on call costs the caller one die. | `spotOn()`, `resolve()` | “misses spot on and costs the caller a die” |
| R25 | Spot on is rejected when the table option is off. | `spotOn()` `spot-disabled` | “rejects spot on when the table option is off” |
| R26 | Spot on needs a current bid and the right turn. | `spotOn()` | “requires a current bid and the right turn for a call” |
| R27 | The result is recorded as a `spot-on` reveal, separate from a challenge. | `Reveal.kind` | “resolves spot on exactly…” |

The family-table wording is deliberate: the caller wins the round and the
*previous bidder* loses one die. A miss costs the caller one die. This keeps
spot-on comparable to a challenge and is documented in the rule screen and both
READMEs.

## Seat order, first bid and undo

- The first bidder of a new game is seat 0 (the human, the hot-seat first
  player, or the LAN host). There is no random first-bidder rule.
- After a reveal, `nextStarter` is the loser if still alive, otherwise the next
  living seat clockwise.
- `quantity` is capped at the total number of dice still in cups, including the
  bidder's own dice.
- Undo is a UI rule, not an engine move. It is legal only while the round is
  still in `bidding` and the previous state belongs to the same round. Undo is
  disabled after a challenge or spot-on reveal, because the cups are already
  public. In solo play, undo steps back over the AI reply to the human's last
  decision. Undo and hints are disabled for LAN guests.

## Privacy and per-seat views

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R28 | A view contains only the requested seat's dice, never another hand. | `view()` | “hides every other hand and exposes only the requested dice” |
| R29 | Other seats expose only public dice counts and bids. | `SeatView.diceCounts`, `bids` | same |
| R30 | Full dice appear in a view only after a reveal. | `view()` `lastReveal` | “exposes every hand only after a reveal” |
| R31 | A view flags whose turn it is and which calls are legal. | `canAct`, `canChallenge`, `canSpotOn`, `legalBids` | “flags the current seat and its legal calls” |
| R32 | An invalid seat is clamped to seat 0 without leaking a hand. | `view()` | “clamps an invalid seat and keeps the public table” |
| R33 | The host re-checks every guest action through `applySeat()`. | `applySeat()` | “dispatches bids, challenges and spot-on calls through applySeat”, “rejects malformed actions and wrong seats” |

The full `GameState.dice` array is held only by the authoritative host or the
local device. LAN guests receive `view(state, seat, names)` and never the state.

## AI

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R34 | Every level returns a legal action. | `chooseAction()`, `chooseBid()` | “returns a legal action at every level”, “only chooses legal raises” |
| R35 | Every level is deterministic with an injected RNG. | `chooseAction()` | “is deterministic with an injected RNG” |
| R36 | The AI never reads another seat's dice. | `unseenProbabilities()` uses counts and public bids only | “does not read the other players' hidden dice” |
| R37 | Hard challenges a bid that cannot be true. | `chooseAction()` risk line | “challenges a bid that cannot be true” |
| R38 | Hard can take a profitable exact spot-on. | `evaluateBid()`, `chooseAction()` | “lets Hard take an exact spot-on when it beats the challenge line” |
| R39 | Companion never calls spot-on. | `chooseAction()` companion branch | “never asks Companion to call spot on” |
| R40 | A dropped LAN seat has a legal fallback action. | `fallbackAction()` | “returns a legal fallback action for a dropped seat” |
| R41 | A complete seeded six-seat AI game finishes. | engine + AI integration | “finishes a full six-seat AI game with one winner” |

All levels use a binomial distribution of unseen dice. Hard adds public
behaviour: a recent bid is weak evidence that the bidder holds that face, reduced
for players who have been caught bluffing; a high challenge rate makes Hard
raise more cautiously, while a known bluffer is challenged more readily. The
probability estimate is explainable and never peeks.

## Hints

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R42 | A hint returns a legal bid with a stated probability and reason. | `hint()` | “returns a legal bid with a reason on a fresh table” |
| R43 | A hint suggests a challenge when the bid is very unlikely. | `hint()` | “suggests a challenge when the bid is very unlikely” |
| R44 | There is no hint out of turn or after a reveal. | `hint()` | “returns no hint out of turn or after a reveal” |

Hint reasons are `safe`, `pressure`, `risk`, `challenge`, `read` and `spot`.
The UI prints the chance and, for spot-on, the expected matching count.

## Record, copy and screenshots

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R45 | A finished game records winner, standings, mode, level and round. | `addGame()` | “records the winner, standings, mode and level” |
| R46 | Only the eight newest games are kept. | `addGame()` | “keeps only the eight newest games” |
| R47 | Malformed local records are normalized safely. | `normalizeRecord()` | “normalizes malformed and legacy records safely” |
| R48 | English and Chinese have the same message keys. | `MESSAGES` | “exposes the same keys in English and Chinese” |
| R49 | The English UI has no Chinese except the language switch. | `MESSAGES.en` | “keeps Chinese out of the English UI except the switch” |
| R50 | The Chinese UI has no English words except the switch. | `MESSAGES.zh` | “keeps English words out of the Chinese UI except the switch” |
| R51 | Both rule sets document wild ones and spot-on. | `rule8`, `rule9` | “documents spot on and wild ones in both rule sets” |
| R52 | The screenshot fixtures are valid engine states. | `demoFixture()` | “builds a valid mid-round demo state…”, “builds reveal and game-over demo states…” |

The final test count is 57. Several tests assert multiple rules; the table
cross-references behaviour rather than one test per row.

## LAN protocol

- The host owns the full `GameState` and is authoritative.
- A guest sends only `{type:'bid', quantity, face, actions}`,
  `{type:'challenge', actions}` or `{type:'spot-on', actions}`.
- The host checks the seat assigned by the shared LAN package, the monotonic
  `actions` counter, the phase, the turn and the bid/call legality through
  `applySeat()` before applying anything.
- After every host action the host sends `view(state, seat, names)` to each
  connected seat. A guest device renders exactly one private dice tray.
- Empty seats and disconnected guests are played by the AI after a short pause.
  A reconnecting guest gets the current private view again.
- Closing the room sends `{kind:'closed'}` before the socket closes, and the
  guest returns to the join screen with a localized message.
