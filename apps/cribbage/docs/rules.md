# Cribbage · rule audit

The rules engine lives in `src/game/cribbage.ts`. It is pure TypeScript: no DOM, network,
clock or `Math.random`. Deals are generated from an injected seed, and every action returns
a fresh state. The suite in `tests/game.test.ts` has **37 tests** covering the deal, discard,
cut, pegging, the show, 121/skunk, per-seat views, AI legality, hints and the family record.

## Rule table

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | Two players receive six cards each; three or four receive five. | `setup()` | “deals six cards…”, “deals five cards…” |
| R2 | A 52-card deck is shuffled from the injected seed and dealt without duplicates. | `shuffle()`, `setup()` | “uses all 52 unique cards…” |
| R3 | Two-player games discard two cards; three/four-player games discard one. | `discard()` | “rejects wrong counts…”, “moves to the cut…” |
| R4 | A discard must come from the acting player’s hand, exactly the required number. | `discard()` | “rejects wrong counts…” |
| R5 | Discards go face down to the dealer’s crib. | `discard()` | “moves to the cut after every seat…” |
| R6 | The player left of the dealer cuts the starter. | `cut()` | “cuts the starter…” |
| R7 | A Jack cut gives the dealer two for his heels. | `cut()` | “cuts the starter and gives the dealer two…” |
| R8 | Pegging alternates one card at a time; the count may not pass 31. | `play()` | “rejects cards over 31…” |
| R9 | Fifteen scores 2. | `pegPlayScore()` | “scores fifteen…” |
| R10 | Thirty-one scores 2 and ends that count. | `pegPlayScore()`, `play()` | “scores thirty-one…” |
| R11 | A pair scores 2, three 6, four 12. | `pegPlayScore()` | “scores a pair, a triple…” |
| R12 | A pegging run scores 1 per card; the longest valid suffix counts. | `pegRunSuffix()` | “scores runs from the longest valid suffix…” |
| R13 | Duplicate ranks can make a double run in pegging. | `pegRunSuffix()` | “scores a double run…” |
| R14 | When nobody can play, the last card scores 1 and the count resets. | `advance()`, `endSequence()` | “awards one for the last card…” |
| R15 | Hitting 31 scores 2 and does not add a separate last-card point. | `endSequence()` | “scores thirty-one…” |
| R16 | The dealer counts the crib after every player’s hand. | `enterCount()` | “counts hands and the crib…” |
| R17 | The show is counted pone first, then clockwise, then the crib. | `enterCount()` | “ends the game at 121 during the show…” |
| R18 | Hand and crib scoring uses the four cards held when pegging began, not the empty hands afterward. | `showHands`, `enterCount()` | “counts hands and the crib…” |
| R19 | Each fifteen combination scores 2. | `scoreCards()` | “counts each fifteen combination separately” |
| R20 | Pairs score 2/6/12. | `scoreCards()` | “counts fifteens, pairs and double runs…” |
| R21 | Runs score 1 per card, including double runs. | `scoreCards()` | “counts fifteens, pairs and double runs…” |
| R22 | A four-card hand flush is 4; five with the starter. | `scoreCards()` | “scores a four-card flush…” |
| R23 | A crib flush needs every crib card and the starter. | `scoreCards()` | “requires all crib cards…” |
| R24 | His nobs: a Jack in hand matching the starter suit scores 1. | `scoreCards()` | “scores his nobs only from the hand” |
| R25 | The 29 hand scores 29. | `scoreCards()` | “scores the classic 29 hand” |
| R26 | First to 121 wins immediately, including during pegging or the show. | `play()`, `enterCount()` | “ends immediately when pegging reaches 121”, “ends the game at 121…” |
| R27 | A skunk is a 121 win with the best opponent below 91; below 61 is a double skunk. | `skunkFor()` | “detects skunks…” |
| R28 | The dealer rotates and scores carry into the next hand. | `nextHand()` | “rotates the dealer…” |
| R29 | A seat only sees its own hand; the crib, stock and other hands are hidden until the show. | `view()` | “shows only the seat hand…”, “exposes only legal cards…” |
| R30 | At the show every hand and the crib are revealed. | `view()` | “reveals every hand and the crib…” |
| R31 | AI discards are the right size and from the real hand. | `chooseDiscard()` | “always discards the right number…” |
| R32 | AI is deterministic from the injected RNG and only plays legal cards. | `choosePlay()`, `aiRng()` | “is deterministic…”, “only returns legal pegging cards…” |
| R33 | A hint is legal and explains the shape or the immediate peg. | `hintFor()` | “gives a discard hint…”, “spots a fifteen…” |
| R34 | The family record stores wins, skunks, best hand, mode and recent games. | `addResult()` | “records wins, skunks…”, “normalizes junk…” |

## Deal and discard

- **Two players:** six cards each, two discards each, crib of four.
- **Three players:** five cards each, one discard each, crib of three.
- **Four players:** five cards each, one discard each, crib of four.
- The deal starts at the player left of the dealer and goes round-robin.
- The discard order starts at the pone. A player can only discard from their own hand.
- The crib is hidden in every seat view until the show. Only the size is public.

## Cut and heels

- After every discard, the pone cuts the top card of the stock.
- A Jack gives the dealer **2 for his heels** immediately. If that reaches 121, the game
  ends before pegging.
- The starter is public from the cut onward.

## Pegging

- The pone leads. Players alternate clockwise, skipping seats with no cards.
- A player who cannot play without passing 31 says **go**; the engine marks the pass and
  moves on. The last player to play scores **1 for the last card** at the end of that count;
  hitting exactly 31 scores **2** and replaces that last-card point.
- A count of exactly **15** scores 2.
- Pairs are scored from the trailing cards of the current count: 2, 6 or 12.
- Runs are scored from the longest valid suffix of the current count. A suffix is valid when
  its distinct ranks form one consecutive range; duplicates multiply the number of runs.
  Examples: 4-5-6 = 3, 4-5-5-6 = 6, 3-4-5-5-6 = 8.
- At the end of a count the running total and sequence reset; the next player clockwise from
  the last player leads.

## The show

Scoring order is **pone, then clockwise, then the dealer’s crib**. A hand is the four cards
held when pegging started plus the starter. The crib is the discarded cards plus the starter.

- **Fifteens:** 2 for every combination totalling 15.
- **Pairs:** 2 for a pair, 6 for three of a kind, 12 for four of a kind.
- **Runs:** 1 per card. A double run scores twice; a double-double run scores four times.
- **Flush:** four cards of the same suit in hand score 4; five with the starter score 5.
  A crib flush only counts when every crib card and the starter share the suit (4 points in
  the three-player crib, 5 in the two/four-player crib).
- **His nobs:** a Jack in the hand/crib that matches the starter’s suit scores 1. The
  starter Jack itself is not nobs.
- A hand that reaches 121 ends the game immediately. Later hands and the crib are marked
  **not counted** in the internal score details.

## 121 and skunks

- First to 121 wins at once.
- The family record calls a win a **skunk** when the best opponent’s score is below 91 and a
  **double skunk** when it is below 61. This is a simple, honest multi-player extension of
  the two-player convention.

## Three and four players

The app uses **cut-throat five-card cribbage**: five cards each, one discard, each player
scores their own hand, and the crib belongs to the dealer. The dealer rotates clockwise.
This is a real cribbage variant; the four-player partnership game (partners opposite,
shared score) is intentionally not included. See [`limitations.md`](limitations.md).

## LAN privacy

`view(state, seat)` returns only:

- the seat’s own hand and its legal cards;
- public scores, dealer, phase, count, the current pegging sequence, all already-played
  cards, the starter, and event history;
- hand counts, crib count and stock count, never contents;
- the full hands and crib only during `count` and `game-over`.

The deal **seed is not included** in a seat view. The host keeps the authoritative
`GameState`. Guest intents are limited to
`{type:'discard', cards, handNo}`, `{type:'play', card, handNo}` and
`{type:'cut', handNo}`; the host rechecks the seat, turn, hand, count and hand number.
Undo and hints are disabled for both LAN seats.

## Comforts

- Undo is available in solo and hot-seat, including stepping back over AI replies.
- Hints use the deterministic Hard search and explain the reason: keep a run/pair/fifteens,
  low crib risk, peg a fifteen/thirty-one/pair/run, or play low.
- Autosave stores the full local state after every action and after the cut; a reload offers
  **Continue**.
- The family record is stored in `localStorage`; a LAN result is recorded on the host only.

## Honest exclusions

- No muggins: missed points are counted automatically.
- No five-card two-player or seven-card variants.
- No Ace-low/high choice: aces are always 1, face cards always 10.
- No manual cut choice; the top stock card is the cut.
- No spectator mode or chat.
