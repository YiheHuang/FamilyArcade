# President · rule audit

The engine is `src/game/president.ts`. It has no DOM, network, clock or
`Math.random` dependency; dealing and AI sampling use the injected RNG. The suite is
`tests/game.test.ts` with **38 tests**: deck/deal, trick rules, finishing, roles,
exchange, private views, AI, hints, record and bilingual copy.

## Core rules

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | One standard 52-card deck; 3 low, 2 high; suits never compare. | `DECK`, `RANKS`, `rankLabel` | “has 52 unique cards and the classic rank order” |
| R2 | 3–6 players receive all 52 cards, as evenly as possible. | `setup()`, `deal()` | “deals all 52 cards as evenly as possible…” |
| R3 | The holder of the 3 of clubs opens round one and must include it. | `setup()` `mustLeadClubs`, `checkPlay()` | “forces the first lead to include the 3 of clubs” |
| R4 | A lead may be a single, pair or triple of one rank. | `checkPlay()`, `legalPlays()` | “rejects wrong turns, foreign cards, mixed ranks, quads and empty plays” |
| R5 | A follower must match the count and play an equal or higher rank. | `checkPlay()` | “allows equal or higher ranks but requires the same count” |
| R6 | A 2 is the highest rank. | `checkPlay()` rank order | “lets the holder of the 2 take a trick…” |
| R7 | Passing is always legal when a trick exists, even if you can beat it. | `pass()` | “locks a player out after passing…” |
| R8 | A player who passes may not re-enter until the trick clears. | `passed[]`, `checkPlay()` | same |
| R9 | Passing is not legal on a fresh trick. | `pass()` `no-trick` | “refuses a pass on a fresh trick…” |
| R10 | When everyone else passes, the last player to play leads the next trick. | `pass()` reset | “locks a player out after passing…” |
| R11 | If the last player has already gone out, the lead passes to the next active seat. | `pass()` `nextActive()` | “clears the trick and moves the lead when the last player is already out” |
| R12 | A play removes the cards and advances to the next eligible active seat. | `play()` `nextEligible()` | “never mutates…” and full-round tests |
| R13 | A finished player is skipped for the rest of the round. | `play()`, `nextEligible()` | full-round tests |
| R14 | The first player out is President; play continues for the other places. | `play()` `finish[]` | “sets President, finish order and Scum…” |
| R15 | The last player holding cards is Scum and the round ends immediately. | `play()` `round-over` | same |
| R16 | The finish order is unique and becomes the role order. | `play()`, `rolesFor()` | “finishes a complete round for every table size” |
| R17 | Roles are President, Vice President, Citizen, Vice-Scum, Scum (3 players have no Vice). | `rolesFor()` | “turns finishing positions into the five roles” |
| R18 | A finished round rejects further plays and passes. | `phase` checks | “sets President, finish order and Scum…” |
| R19 | `play()` and `pass()` never mutate the old state. | immutable updates | “never mutates the state passed into play or pass” |

## Between rounds

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R20 | The next deal gives every card back and resets the table. | `nextRound()` | “deals the next round to the President with exchange disabled” |
| R21 | The President leads the next round. | `nextRound()` `starter` | same |
| R22 | With exchange on, the round pauses on an exchange screen. | `nextRound()` `phase:'exchange'`, `beginRound()` | “runs the next round through the exchange screen” |
| R23 | Scum gives two best cards to the President; the President returns two cards. | `performExchange()` | “moves the Scum best cards…” |
| R24 | At 5–6 players, Vice-Scum gives one best card to the Vice President and gets one back. | `performExchange()` | “also swaps one card between the Vice President and Vice-Scum” |
| R25 | Hand sizes are preserved by the exchange. | `performExchange()` | exchange tests |
| R26 | Exchange can be switched off at setup or in the LAN host card. | `exchangeEnabled` | “deals the next round… exchange disabled” |

The return cards are chosen automatically as the President's (and Vice President's)
lowest cards. That is a legal choice, not a rule change; the app makes it to keep the
round moving for AI and LAN tables. A future manual exchange screen would simply let
the President choose any two cards instead.

## Privacy, hints and record

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R27 | A seat view contains only that seat's hand plus public table data. | `view()` | “shows only the requested hand and the public table” |
| R28 | The view never contains another player's cards or a `hands` array. | `view()` | same |
| R29 | `applySeat()` re-checks the turn, seat and action. | `applySeat()` | “enforces the seat on applySeat…” |
| R30 | AI returns a legal action at every level. | `chooseAiAction()` | “returns legal actions at every level” |
| R31 | AI is deterministic with an injected RNG. | `chooseAiAction()` | “is deterministic with an injected RNG” |
| R32 | Hard only samples unseen cards; it never reads hidden hands. | `sampleHidden()` | “does not read the opponents hidden cards” |
| R33 | Companion is gentle with a 2 when a low card is enough. | `chooseAiAction('companion')` | “keeps Companion gentle…” |
| R34 | A hint is a legal action and explains the reason. | `hintFor()` | “explains the forced club lead…”, “recommends a legal beat and a legal pass” |
| R35 | A hint is unavailable out of turn or after the round. | `hintFor()` | “returns no hint out of turn or after the round” |
| R36 | The record stores President, Scum, full order and mode. | `addRound()` | “records the President, Scum and full order” |
| R37 | Only the eight newest rounds and the mode/level split are kept. | `addRound()` | “counts modes, level and only the eight newest rounds” |
| R38 | Malformed legacy records are normalized safely. | `normalizeRecord()` | “normalizes malformed and legacy records” |
| R39 | English has no Chinese UI copy except the language switch. | `MESSAGES.en` | “keeps Chinese out of the English UI…” |
| R40 | Chinese has no English UI copy except the language switch and key names. | `MESSAGES.zh` | “keeps English words out of the Chinese UI…” |

The final count is 38 tests; several tests assert more than one rule, and the table
cross-references behaviour rather than one test per row.

## Turn engine in detail

1. Deal the shuffled deck round-robin. Sort each hand by rank and suit.
2. If round one, find the 3 of clubs and make that seat the starter. The first play
   must include the 3 of clubs.
3. A lead is one, two or three cards of the same rank. A follower uses the same
   count and a rank `>=` the current trick rank.
4. A play updates the trick, pushes cards to the public discard and moves to the next
   active, non-passed seat.
5. A pass marks the seat. When every other active seat has passed, the trick clears
   and the last player (or the next active seat if they went out) leads.
6. When a play empties a hand, that seat joins the finish order. When only one seat
   has cards, it is appended as Scum and the phase becomes `round-over`.
7. `nextRound()` deals again. With exchange on, it pauses in `exchange`; `beginRound()`
   starts the President's lead. The exchange summary is public but the moved card
   faces are never put in a seat view.

## AI notes

- **Companion** prefers low ranks, avoids spending a 2 when a smaller card is enough,
  and passes more often when the human has one or two cards left.
- **Easy** picks from legal plays with a low-card bias, sometimes chosen at random,
  and passes at random when allowed.
- **Normal** scores the resulting hand: remaining count, minimum number of sets,
  control cards, broken groups and the state of the trick. It saves 2s for later.
- **Hard** builds the legal action list, samples the unseen cards (deck minus own
  hand and discard) into the opponents' known hand counts, then rolls the round
  forward with a simple policy for a small number of samples. It never reads the real
  hidden hands. Passing is a candidate action, so pass timing is part of the search.
- All levels are deterministic given the injected RNG. The app supplies `Math.random`
  only at the UI edge; tests use a seeded generator.

## LAN protocol

- Host state is authoritative. Guests send only
  `{type:'play', cards:[ids], actions}` or `{type:'pass', actions}`.
- The host checks the seat, `actions === state.actions`, phase, turn, ownership, rank
  and count again via `applySeat()`. A stale or spoofed intent is ignored.
- After every host action, each connected guest seat receives `view(state, seat, names)`
  with its own hand only.
- A disconnected guest's turn is handled after 2.4 seconds with the lowest legal play
  or a pass, so the table continues. If the guest reconnects, the host resends the
  current private view.
- A guest who joins after the deal may take over an empty AI seat. The host replaces
  that seat's AI name with the guest name, stops the AI for that seat and sends the
  inherited private hand. A human seat is never replaced.
- Closing the room sends `{kind:'closed'}` before the socket closes.
