# Rummy 500 · rule audit

The engine is `src/game/rummy-500.ts`. It has no DOM, clock, network or
`Math.random` dependency; every deal and reshuffle takes an injected RNG. The
suite has **45 tests** covering the deck, deal, melds, lay-offs, discard-pile
takes, turn flow, scoring, hand/game end, private views, AI, hints and the family
record.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | One standard 52-card deck, every card unique. | `makeDeck()` | “builds a unique 52-card deck” |
| R2 | Two players receive 13 cards; three or four receive 7. | `handSize()`, `dealRound()` | “deals 13 cards to two players and 7 to three or four” |
| R3 | The dealer rotates; the player after the dealer starts the hand. | `setupGame()`, `dealRound()`, `nextRound()` | “deals …”, “starts a new hand with the dealer rotated and scores kept” |
| R4 | The rest of the deck is the stock; one card starts the discard pile. | `dealRound()` | “uses every card exactly once in a deal” |
| R5 | A turn starts by drawing the top stock card or taking any discard with every card above it. | `applyAction()` `draw-stock` / `take-discard` | “draws the top stock card and enters the meld phase”, “takes a buried discard with every card above it” |
| R6 | A taken discard must be melded or laid off that turn. | `mustMeld`, `applyDiscard()` | “forces a taken discard to be melded before discarding”, “clears the must-meld obligation by laying the taken card off” |
| R7 | A set is 3–4 cards of one rank; a run is 3+ consecutive cards of one suit. | `analyzeMeld()` | “recognises sets and rejects incomplete combinations”, “reads aces high and low, never around the corner” |
| R8 | Aces are high or low but cannot wrap; `K-A-2` is invalid. | `analyzeMeld()`, `extendMeld()` | same |
| R9 | A card may be laid off on any meld, own or another player’s; sets take a fourth suit, runs take either end. | `meldAcceptsCard()`, `applyAction()` `layoff` | “lays off a fourth set card and rejects a fifth”, “extends a run at both ends in sequence order” |
| R10 | A turn ends with exactly one discard, unless the player goes out. | `applyDiscard()` | “discards one card, advances the turn and resets the draw phase” |
| R11 | Going out means no cards left, whether by melding, laying off or discarding the last card. | `applyMeld()`, `applyLayoff()`, `applyDiscard()`, `finishRound()` | “scores a hand when the last card is discarded”, “scores a hand when the last cards are melded” |
| R12 | Score is melded points minus cards left in hand. A low ace in A-2-3 is 1; every other ace is 15; faces and 10s are 10; pips are face value. | `meldPointsFor()`, `handValue()`, `finishRound()` | “subtracts deadwood and counts a low ace as one” |
| R13 | The hand ends when the stock is empty and a player wants to draw. | `applyDrawStock()` | “ends the hand when the stock is empty on a draw” |
| R14 | The game ends at the end of a hand when a unique highest total reaches 500. | `finishRound()` | “ends the game at 500 with the highest total” |
| R15 | If two or more players tie at the top with 500+, another hand is played. | `finishRound()`, `nextRound()` | “plays another hand when two players tie above 500” |
| R16 | A new hand keeps cumulative scores and rotates the dealer. | `nextRound()` | “starts a new hand with the dealer rotated and scores kept” |
| R17 | Actions are rejected outside the draw/meld phases or from the wrong seat. | `applyAction()`, `applySeatAction()` | “enforces the seat on a LAN action” |
| R18 | A view exposes only the viewer’s hand, public melds, discard pile, scores and counts. | `view()` | “gives each seat only its own hand and the public table”, “gives the acting guest seat its own hand and takeable discards” |
| R19 | A discard may only be taken when the chosen card can actually be melded with the hand plus the cards above it. | `canTakeDiscard()`, `takeableDiscardIndexes()` | “refuses a discard that cannot be used”, “takes a buried discard with every card above it” |
| R20 | Actions never mutate the previous state. | `applyAction()` | “never mutates the state passed into an action” |
| R21 | AI actions are legal and deterministic for an injected RNG; a full four-player game reaches 500. | `chooseAiAction()`, `runAiTurn()` | six AI tests, including “finishes a complete four-player game to 500” |
| R22 | Hints choose a legal action and explain meld, lay-off, take, stock or discard. | `hintFor()` | six hint tests |
| R23 | The family record counts games, best score, mode split and the eight most recent results. | `addResult()`, `normalizeRecord()` | four record tests |

## Scoring example

You meld `A♠ 2♠ 3♠` (1 + 2 + 3 = 6), `K♥ K♣ K♦` (30), then lay off `4♠` on your
own run (4). You have 40 points on the table. You still hold `A♦` (15) and `8♣` (8),
so your hand score is `40 − 23 = 17`. A player who goes out with no cards keeps the
full melded total because there is no deadwood to subtract.

Scores can be negative and cumulative totals can be negative. The record stores the
best winning score, not an average.

## LAN privacy

The host owns the authoritative `GameState`. Each guest receives only
`view(state, seat)`: its own hand, public melds, the discard pile, stock count,
scores and card counts. The host never sends another seat’s hand or the stock order.

A guest intent is `{ action, version }`. The host re-checks the seat, turn, phase,
action legality and version before applying it; stale or spoofed intents are ignored.
A reconnecting guest is found by its local token and receives the live view again.
The host records a LAN result; the guest device does not duplicate it. The guest’s
result sheet is read-only and waits for the host to start the next hand.

## AI levels

- **Companion** melds gently, sometimes passes up a meld, and avoids buried-discard
  greed. It is intended for children and new players.
- **Easy** makes random choices and simple mistakes.
- **Normal** takes profitable discards, melds and lays off, then discards the least
  useful card.
- **Hard** evaluates immediate points, remaining hand potential, discard safety and
  the must-meld obligation. It is a careful heuristic opponent, not a solver.

The engine and AI never call `Math.random`; the app injects it at the boundary. The
same seed and RNG therefore produce the same AI choice in tests.

## Hints

Hints run the Hard analysis on the current seat and return a legal action plus a
reason: meld points, lay-off points, a discard take that completes a meld, a stock
draw, a safe discard, or the must-meld reminder. Hints and undo are disabled in LAN
games for both seats so neither side gets an information advantage.

## Record

`localStorage` stores the current autosave and a family record: games, best winning
score, mode split, and the eight most recent games with winner, score, players,
hands and date. A LAN game is recorded by the host only. Clearing the record affects
only that browser/device.
