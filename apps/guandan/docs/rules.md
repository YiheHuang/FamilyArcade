# Guandan · rule audit

The engine is `src/game/guandan.ts`. It has no DOM, network, clock or
`Math.random` dependency; dealing and AI sampling use the injected RNG. The suite
is `tests/game.test.ts`, `tests/storage.test.ts` and `tests/i18n.test.ts` with
**52 tests**. Every row below points at code and at the test that covers the
behaviour, not at a separate test per row.

## Core deal and level

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | Two decks: 108 unique cards, including two small and two big jokers. | `DECK`, `makeDeck()` | “has 108 unique cards: two decks and four jokers” |
| R2 | Four seats receive 27 cards each, every card exactly once. | `setup()`, `deal()` | “deals 27 cards to each of four seats…” |
| R3 | Dealing is deterministic with the injected RNG. | `shuffle()` | same |
| R4 | Seats 0 and 2 are partners; seats 1 and 3 are partners. | `teamOf()`, `partnerOf()` | partnership tests, AI partner test |
| R5 | The level card ranks just below the jokers: natural ranks, then level, then small joker, then big joker. | `powerRank()`, `cardPower()` | “puts the level card just below the jokers” |
| R6 | The heart level card is the wildcard; there are two. | `isWild()` | “marks exactly the heart level cards as wild” |
| R7 | The first round is played at level 2 and led by seat 0. | `setup()` | “deals 27 cards…” and full round test |
| R8 | The winning team’s new level is the next round’s level card. | `finishRound()`, `nextRound()` | “makes the winner’s new level the next level card” |

Seat 0 leading the first deal is a family-table choice. There is no draw for the
lead and no kitty. The level card changes only between rounds, after the winning
team has been promoted.

## Combinations

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R9 | Single, pair and triple are sets of one, two or three cards of one rank. | `detectSets()` | “detects singles, pairs and triples…” |
| R10 | A pair of small jokers and a pair of big jokers are legal; mixed jokers are not. | `detectSets()` | same |
| R11 | A set of four or more cards of one rank is a bomb. Wildcards may fill it. | `detectSets()`, `generateSetCandidates()` | “detects bombs of four through ten cards” |
| R12 | Triple + pair is a full house; the triple rank is the comparison rank. | `detectFullHouses()` | “detects a full house and a wildcard full house” |
| R13 | A straight is exactly five consecutive natural ranks. A may be low or high. | `detectSequences()`, `sequenceWindows()` | “accepts A2345 and 10JQKA but not JQKA2” |
| R14 | A straight may not wrap: J-Q-K-A-2 is not a straight. | `sequenceWindows()` | same |
| R15 | The wildcard can fill a missing straight card. | `detectSequences()` | “fills a missing straight card with the wildcard” |
| R16 | Three consecutive pairs is a pair chain. | `detectSequences()` | “detects three consecutive pairs and two consecutive triples” |
| R17 | Two consecutive triples is a triple chain. | `detectSequences()` | same |
| R18 | A straight flush is five consecutive cards of one suit; it is a bomb. | `detectStraightFlushes()` | “detects a straight flush and a joker bomb” |
| R19 | The joker bomb is exactly two small and two big jokers. | `detectCombos()` | same |
| R20 | The wildcard cannot stand in for a joker. | `detectFullHouses()`, `detectSequences()`, `detectStraightFlushes()` | “uses a wildcard in a pair and a triple, but never as a joker” |

### Straight and chain windows

Natural ranks run 2…A. The engine builds every consecutive window from ace-low
through ace-high. This means A-2-3-4-5 and 2-3-4-5-6 are legal, as are 10-J-Q-K-A
and Q-Q-K-K-A-A; J-Q-K-A-2 is not. Some family tables exclude 2 from straights
altogether; this app follows the more permissive window rule and documents it in
`limitations.md`.

## Comparison and bombs

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R21 | A bomb beats any non-bomb. | `comboBeats()` | “lets a bomb beat a non-bomb…” |
| R22 | A non-bomb cannot beat a bomb. | `comboBeats()` | same |
| R23 | Bomb order: four < five < straight flush < six < seven < eight < nine < ten < joker bomb. | `comboBeats()`, `comboStrength()` | “orders bombs: four < five < straight flush < six < … < joker bomb” |
| R24 | Same-tier bombs compare by rank; a level bomb beats an ace bomb. | `comboBeats()`, `detectSets()` | “makes a level pair beat a pair of aces”, bomb order test |
| R25 | Non-bombs must match type and length and be strictly higher. | `comboBeats()` | “requires the same non-bomb type and a strictly higher rank” |
| R26 | Leading prefers the strongest reading; following prefers the cheapest reading that beats. | `bestCombo()` | “prefers a straight flush when leading but can use the straight interpretation when following” |

A same-suit straight is naturally a straight flush. When it is led it is recorded
as a straight flush. When it follows a straight, the engine may use the cheaper
straight reading if that is enough to beat the table. This keeps a player from
being forced to spend a bomb when they only need a straight. The choice is
deterministic and is part of the table rules.

## Trick engine

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R27 | A play must be from the current hand, with no duplicate card ids. | `play()` | “rejects wrong turns, foreign cards, duplicate cards…” |
| R28 | An empty play, an invalid combination and a lower or equal follow are rejected. | `play()` | same, “requires a follower to match the type and beat the rank” |
| R29 | A finished player is skipped. | `nextActive()`, `nextEligible()` | “skips a finished player when advancing the turn” |
| R30 | A player who passes sits out until the trick resets. | `pass()`, `nextEligible()` | “resets a trick after three passes…” |
| R31 | Passing is not legal on a fresh trick. | `pass()` `no-trick` | engine guard and UI `canPass` |
| R32 | When every other active player passes, the trick resets. | `pass()` reset | “resets a trick after three passes…” |
| R33 | The reset lead goes to the last player, or to their partner if they have finished. | `trickLeader()` | “gives the lead to the finishing player’s partner when everyone passes” |
| R34 | The round ends when three players are out; the last seat is fourth. | `play()` finish branch, `finishRound()` | finish-order tests |
| R35 | `play()` and `pass()` never mutate the previous state. | immutable updates | “never mutates the previous state on a play or pass” |
| R36 | A seat view contains only that seat’s hand plus public table data. | `view()` | “shows only the requested hand and public table data” |
| R37 | `applySeat()` re-checks the turn and the action. | `applySeat()` | “returns legal actions at every level…” and LAN E2E |

The three-pass rule is implemented as “all other active players have passed”.
With four active players that is exactly three passes. When one player has
finished, two passes bring the trick back to the last player; when two have
finished, one pass does. This is the standard table behaviour and is what makes
the three-pass reset work with finished seats.

## Finish order, levels and match

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R38 | The first finisher’s team wins the round. | `finishRound()` | finish-order tests |
| R39 | Partners first and second: +3. | `levelGainFor()` | “scores partners first and second as +3” |
| R40 | Partners first and third: +2. | `levelGainFor()` | “scores partners first and third as +2” |
| R41 | Partners first and fourth: +1. | `levelGainFor()` | “scores partners first and fourth as +1” |
| R42 | The winning team’s level is capped at A. | `finishRound()` | “promotes the winning team, caps at A…” |
| R43 | A team already at A wins the match by winning a round. | `finishRound()` | same |
| R44 | Reaching A from below does not immediately win the match. | `finishRound()` | same |
| R45 | A completed round produces a unique four-seat order. | `finishRound()` | finish-order tests, full round test |

The match is to A. A team at A must win a round while at A; reaching A from below
only sets the next round’s level card to A. The round level is always the previous
winner’s level, so a team at A may need to win again after the other team has had a
round at its own level. This is the app’s explicit “win at A” rule.

## Tribute and anti-tribute

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R46 | A +3 round is double tribute: fourth gives to first, third gives to second. | `buildTribute()` | “runs a double tribute…” |
| R47 | A +2 round is single tribute: fourth gives to first. | `buildTribute()` | “runs a single tribute for a +2 round” |
| R48 | A +1 round has no tribute because the last player is on the winning team. | `buildTribute()` | “skips tribute when the last player is on the winning team” |
| R49 | The tribute card is the highest non-wild card. | `highestTributeCard()` | double tribute test |
| R50 | The winner returns a hand-aware card: keep wilds, level cards and jokers, and avoid breaking a pair. | `chooseReturnCard()` | “returns a low singleton instead of breaking a pair…” |
| R51 | Anti-tribute when the paying side holds both big jokers; no cards move. | `buildTribute()` | “allows anti-tribute when the paying side holds both big jokers” |
| R52 | After tribute the first-place player leads; after anti-tribute the last-place player leads. | `buildTribute()` | tribute tests and next-round test |
| R53 | Tribute keeps every hand at 27 cards. | `moveCard()`, `buildTribute()` | double tribute test |

The return card is automatic. It is a real choice: the engine scores low cards,
avoids breaking pairs and triples, and keeps wildcards, level cards and jokers when
it can. The tribute summary is public, so the exchanged faces are visible to all
seats. A manual return screen is a possible future option, not a rule change.

## AI

The four levels are in `src/ai/ai.ts`. Every level is deterministic with the
injected RNG and sees only its own hand, public hand counts, the trick, the
discard and the tribute summary.

- **Companion** prefers low cards, avoids bombs and high singles, passes to a
  partner who holds the trick, and is deliberately gentle.
- **Easy** picks from the lower legal plays and occasionally passes or makes a
  loose choice.
- **Normal** scores the remaining hand shape, wildcard cost, high-card cost, bomb
  cost, partner control and opponent threats.
- **Hard** adds public card counting (is this play likely to be a control?) and a
  one-step lookahead over the next turn. It never reads another seat’s hand.

Bomb economy is a cost, not a ban: a bomb is cheaper when an opponent is nearly
out, when the player is short, or when the partner is not the one holding the
trick. Wildcards are valued highly because they complete sets, sequences, straight
flushes and bombs. The AI’s tribute return uses the same hand-aware
`chooseReturnCard()` policy.

## Hints

`hintFor()` runs the Hard policy with a fixed seed, then derives a reason:
finish, partner, bomb, wildcard, control, lead, beat or pass. A hint is always a
legal action and is only offered on the viewer’s turn. It highlights the exact
cards or outlines the pass button. It never reveals an opponent’s hand.

## Privacy and LAN

- Host state is authoritative. Guests send only
  `{type:'play', cards:[ids], actions}` or `{type:'pass', actions}`.
- The host checks the seat, `actions === state.actions`, phase, turn, ownership and
  combination again through `applySeat()`.
- After every host action, each connected guest seat receives `view(state, seat,
  names)` with its own hand only.
- A disconnected guest’s turn is handled after 2.4 seconds with the lowest legal
  play or a pass, so the table continues.
- A guest who joins after the deal may take over an empty AI seat; the host replaces
  that seat’s AI name and sends the inherited private hand. A human seat is never
  replaced.
- Closing the room sends `{kind:'closed'}` before the socket closes.
- Undo and hints are disabled for LAN host and guest seats.

## Record

`src/storage.ts` records rounds, round wins, match titles, modes, best levels and
the eight newest rounds. Guest devices do not duplicate the host’s LAN record.
Clearing the record affects only the device that clears it. The saved game is
local-only and resumes an active round or tribute screen.

## Test count

The final count is **52 tests** across engine, storage and bilingual copy. Several
tests assert more than one rule, and the table cross-references behaviour rather
than one test per row.
