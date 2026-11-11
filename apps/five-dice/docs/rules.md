# Five Dice · rule audit

Every rule has code, a test and an edge case. The engine lives in
`src/game/five-dice.ts` and has no DOM, clock, network or `Math.random` dependency.
Randomness is injected as `rng: () => number` by the UI, the AI or a test.

## Core rules

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | A table has two to four players, each with 13 empty boxes. | `createGame()` | “creates an empty table for two to four players” |
| R2 | Tables outside 2–4 players are rejected. | `createGame()` | “rejects tables outside 2–4 players” |
| R3 | A turn starts with five unrolled dice and three rolls. | `createGame()`, `roll()` | “rolls five dice and counts the first roll” |
| R4 | A player may keep any dice and reroll only the rest. | `roll()` `hold` | “keeps held dice and rerolls only the rest” |
| R5 | Dice can only be kept after a roll and before the third roll. | `toggleHold()` | “cannot hold before rolling or after the third roll” |
| R6 | A category can only be filled after at least one roll. | `scoreTurn()` | “requires at least one roll before scoring” |
| R7 | Each category is used at most once per player. | `scoreTurn()` | “rejects taken categories and bad indexes” |
| R8 | The turn passes after scoring; the next hand starts fresh. | `advanceTurn()` | “fills a box, records the score and passes the turn” |
| R9 | A full game is 13 rounds. The highest grand total wins; ties share the win. | `scoreTurn()`, `standings()`, `winners()` | “plays a complete two-player game and finishes”, “ranks standings and shares the win on a tie” |
| R10 | Seat order rotates through all players. | `advanceTurn()` | “rotates seats through a complete four-player game” |

## Scoring

| # | Box | Score | Test |
| --- | --- | --- | --- |
| S1 | Ones–Sixes | Matching dice only (e.g. three 4s = 12). | “scores upper boxes by matching face” |
| S2 | Three of a kind | At least three alike: total of all dice, otherwise 0. | “scores three and four of a kind as the whole hand” |
| S3 | Four of a kind | At least four alike: total of all dice, otherwise 0. | same |
| S4 | Full house | Exactly 3 + 2: 25, otherwise 0. A five-of-a-kind is not a house. | “scores a full house at 25 and rejects a five-of-a-kind as a house” |
| S5 | Small straight | Four consecutive faces: 30, otherwise 0. | “scores small and large straights” |
| S6 | Large straight | Five consecutive faces: 40, otherwise 0. | same |
| S7 | Five of a kind | All five dice alike: 50, otherwise 0. | “scores five of a kind at 50 and chance as the raw sum” |
| S8 | Chance | Sum of all five dice. | same |
| S9 | Upper bonus | Upper subtotal 63 or more: +35. | “adds the 35-point upper bonus at 63” |
| S10 | Invalid hands | Malformed dice score 0 rather than throwing. | “returns zero for malformed dice” |

## Views, seats and LAN

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| V1 | A seat can only act on its own turn. | `applyAction()` | “enforces the active seat in applyAction” |
| V2 | Each seat gets its own view: seat number, open boxes, totals and `canAct`. | `viewFor()` | “gives each seat its own open boxes and turn flag” |
| V3 | Filled boxes disappear from that seat's open list. | `viewFor()` | “excludes filled boxes from a seat view” |
| V4 | An invalid seat falls back to seat zero for display only. | `viewFor()` | “falls back to seat zero for an invalid view seat” |
| V5 | Saved games must have a valid shape. | `isGameState()` | “recognises a valid serialised state and rejects broken ones” |

## AI

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| A1 | Every level returns an open category and a five-die keep mask. | `planTurn()` | “returns an open category at every level” |
| A2 | The same state, level and RNG produce the same plan. | `planTurn()` | “is deterministic with the same injected rng” |
| A3 | Companion prefers a fun hand (e.g. a full house) and stops to score it. | `planTurn()` | “lets the companion chase a fun full house” |
| A4 | Hard locks a five-of-a-kind instead of throwing it away. | `planTurn()` | “lets hard lock a five of a kind” |
| A5 | Hard values the 35-point bonus when a box reaches 63. | `planTurn()` | “weights the upper bonus when a box reaches 63” |
| A6 | Easy keeps the largest matching group. | `chooseHolds()` | “keeps the largest group on Easy” |
| A7 | Hard calculates exact reroll probabilities for each keep mask. | `exactKeep()` | “uses exact keep odds for four sixes” |
| A8 | Expected-value arithmetic is exact for a fixed keep mask. | `expectedForKeep()` | “computes exact expected values for a fresh sixes chase” |
| A9 | Normal keeps a straight shape. | `heuristicKeep()` | “keeps a useful straight shape on Normal” |
| A10 | The hint is a real plan for the current hand. | `advise()` | “produces a hint for a live human turn” |

## Known simplification (honest)

- There is **no Yahtzee bonus** for extra five-of-a-kind hands and **no joker rule**.
  The brief only asks for the 13 boxes and the upper bonus.
- A five-of-a-kind is **not** accepted as a full house. This is the strictest reading
  of the brief and is documented in `docs/limitations.md`.
- Hard uses exact **one-roll** keep probabilities and a bonus-aware category choice.
  It does not solve the full three-roll game tree.
- LAN games are not written to the local family record. The host owns the live state.

## LAN contract

The host is authoritative. It keeps the `GameState`, applies every guest intent with
`applyAction(state, seat, intent, rng)` and sends per-seat `viewFor(state, seat)` views.
The relay only forwards messages. A guest cannot act out of turn, fill a taken box or
send a score for another seat: the host re-checks everything.

The 4-digit room code doubles as the relay room in this game so a guest can join by
typing the code alone; the QR invite also carries the room. The code keeps an honest
family out, not a determined attacker on the same LAN.

## Screenshots

`docs/screenshots/{en,zh}` are captured from the running app at 1440×1000 (mobile
390×844 @2×) by `scripts/shots.mjs`. The script uses seed 23 and a seeded local family
record so the same real UI can be reviewed after every change; it does not paint fake
screens or use a mockup.
