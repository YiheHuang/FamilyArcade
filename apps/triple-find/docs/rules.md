# Triple Find · rule audit

Every rule below has code, at least one test, and an edge case. The rules live in
`src/game/cards.ts` and use no DOM, clock, network or `Math.random`. Shuffling and
AI decisions use injected seeded RNGs, so a game can be replayed.

Run `npm run check` (TypeScript + 35 unit tests + production build) and
`npm run e2e` (real Chrome, dev server required). The e2e LAN step also needs the
`dist/` produced by `npm run check`.

## Core rules

| # | Rule | Code | Test / verification |
| --- | --- | --- | --- |
| R1 | The deck has 81 unique cards, one for each combination of 3 colours × 3 shapes × 3 fills × 3 counts. | `fullDeck()` | “builds an 81-card deck where every card is unique” |
| R2 | A set is three cards where each of the four attributes is all-same or all-different. | `isSet()` | “accepts sets that are all different in all four attributes”, “accepts sets that are all the same in three attributes” |
| R3 | A mixed attribute makes the triple invalid. | `isSet()` | “rejects a mixed attribute even when the other three work” |
| R4 | A game starts with 12 cards on the table and 69 in the deck, all scores zero. | `createGame()` | “deals twelve cards and leaves sixty-nine in the deck” |
| R5 | The same seed produces the same shuffle; a different injected RNG produces a different deal. | `shuffle()`, `createGame()` | “is deterministic for the same injected RNG seed”, “uses the injected RNG rather than a hidden random source” |
| R6 | A valid claim scores one point, records the three cards, removes them from the table and refills from the deck. | `claimSet()` | “scores, records and refills the table after a valid claim” |
| R7 | The table refills to 12 while the deck lasts. | `claimSet()` | “refills to twelve when the deck has enough cards” |
| R8 | A non-set is rejected without mutating the state. | `claimSet()` | “rejects a non-set without mutating the table” |
| R9 | A claim of fewer or more than three cards is rejected. | `claimSet()` | “rejects the wrong number of cards” |
| R10 | The same card cannot appear twice in one claim. | `claimSet()` | “rejects a duplicate card id” |
| R11 | All three cards must currently be on the table. | `claimSet()` | “rejects a card that is not on this table” |
| R12 | Only a player in the game may claim. | `claimSet()` | “rejects an unknown player” |
| R13 | A finished game accepts no claims. | `claimSet()` | “rejects every claim after the game is finished” |
| R14 | When the deck is empty, the table shrinks by three per set; if the remaining cards contain no set, the game ends. | `claimSet()` | “shrinks the table and finishes when the last cards contain no set” |
| R15 | If the table has no set, three more cards are dealt. The deal is refused while a set is visible or the deck is empty. | `dealExtra()` | “deals three more when the table has no set”, “refuses to deal when a set is already visible”, “refuses to deal from an empty deck” |
| R16 | If the final extra deal still leaves no set, the game ends. | `dealExtra()` | “finishes if the final deal still leaves no set” |
| R17 | Ending is idempotent. | `finishGame()` | “finishes once and keeps the same object on repeat calls” |
| R18 | Highest score wins; equal top scores are a family draw. | `standings()`, `winners()`, `isDraw()` | “sorts standings and reports tied winners as a draw” |
| R19 | A hint can explain the relation of every attribute. | `setReason()` | “explains every attribute for a valid set”, “explains an all-same set”, “marks a broken attribute as mixed” |

## AI rules

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| A1 | Every AI level enumerates all sets and never invents one. | `chooseSet()` | “always returns a valid set on every level” |
| A2 | With no set on the table, every level returns nothing. | `chooseSet()` | “returns null when the table has no set” |
| A3 | The same table, level and RNG seed produce the same choice. | `chooseSet()` | “is deterministic for the same table, level and RNG seed” |
| A4 | Hard takes the first available set; the other levels choose with the seeded RNG. | `chooseSet()` | “lets Hard take the first available set” |
| A5 | Reaction delay order is Hard < Normal < Easy < Companion. | `aiDelay()` | “orders reaction delays from Hard to Companion” |
| A6 | Seeded RNG draws stay in `[0, 1)` and repeat. | `mulberry32()` | “keeps seeded RNG draws in the unit interval” |
| A7 | The setup asks for exactly as many AI names as opponents. | `aiNames()` | “names exactly as many AI players as requested” |

The ranges are: Companion 10–16 s, Easy 6.2–10.6 s, Normal 2.8–5.8 s, Hard
0.7–1.3 s. Companion is deliberately gentle, not unable to play.

## App-level rules (not in the pure engine)

| # | Rule | Code | Verification |
| --- | --- | --- | --- |
| S1 | A hot-seat caller has 12 seconds to pick three cards. | `CALL_WINDOW_MS`, `startCall()` in `App.tsx` | e2e call and invalid-claim flow |
| S2 | A wrong or timed-out call is a 2.6-second rest, never a point penalty. | `CALL_LOCKOUT_MS`, `resolveClaim()` | e2e invalid-claim flow |
| S3 | The table plays for five minutes. | `GAME_LENGTH_MS`, deadline effect | e2e fake-clock test |
| S4 | The game autosaves after claims and every 2.5 s; Continue restores the score and clock. | `storage.ts`, `saveGame()` | e2e reload/Continue test |
| S5 | The family record stores games, best score, streak, draws, a player leaderboard and recent results. | `recordResult()` | e2e full-deck and record test |
| S6 | LAN guests receive a per-seat view; claims are re-checked by the host. | `broadcastViews()`, `handleLanIntent()` | e2e host/guest claim test |
| S7 | Hints are disabled in LAN games for fairness. | `showHint()` | UI disabled + toast |
| S8 | Sound, language and reduced motion persist or follow the OS. | `sound.ts`, `i18n.ts`, CSS media query | manual + screenshots |

## Rule interpretation

- **“If nobody calls, add three cards”** is implemented as: when the table contains
  no set, the game deals three after a short pause. If a set exists and nobody
  finds it, the table stays; that is the standard Set-table convention.
- A table can temporarily hold **15 or 18 cards** when a deal is needed. Once a set
  is claimed, the table refills toward 12 while the deck lasts.
- The **12-second call window** exists so hot-seat players can race for the device
  without a separate caller screen. It does not apply to solo or LAN claims.
- **First caller** in LAN means the first valid claim that reaches the host. A
  guest cannot score by sending a stale, duplicate or invalid triple.
- The pure engine ends the game when no set remains and the deck is empty. The
  app-level clock can also end it at 5:00.

## Scores

One point per valid set. The family record stores total games, draws, best score,
current win streak, per-player wins/games/best, and the last eight results in
`localStorage` under `familyarcade.triple-find.record`. There is no cloud sync.

## LAN

The host owns the `GameState`. Guests send only
`{ type: 'claim', cardIds: [a, b, c] }`. `claimSet()` re-checks the game status,
player seat, table membership, uniqueness and the four attributes. The host then
sends each connected seat its own `LanView` with the table, scores, remaining time
and the last claim result.
