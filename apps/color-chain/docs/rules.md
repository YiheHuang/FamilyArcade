# Color Chain · rule audit

Color Chain is an original colour-and-number shedding game for 2–6 players. The
engine lives in [`src/game/color-chain.ts`](../src/game/color-chain.ts) and has no DOM,
clock, network or `Math.random` dependency. Every shuffle, deal and recycle takes an
injected RNG (`src/game/rng.ts` in the app, a seeded generator in tests).

## Deck

| Card | Copies per colour | Points |
| --- | ---: | ---: |
| 0 | 1 | 0 |
| 1–9 | 2 each | face value |
| Skip | 2 | 20 |
| Reverse | 2 | 20 |
| Draw Two | 2 | 20 |
| Wild | 4 total, colourless | 50 |
| Wild Draw Four | 4 total, colourless | 50 |

Four colours × 25 cards + 8 wild cards = **108 cards**.

## Rule audit

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The deck contains 108 unique cards with the composition above. | `fullDeck()` | “builds a unique 108-card deck with the right mix” |
| R2 | Shuffling is deterministic for the same injected RNG. | `shuffle()` | “shuffles deterministically from an injected RNG” |
| R3 | A deal gives each seat 7 cards, scores start at 0, and the opening discard is a number card. | `setup()` | “deals seven cards, a number opening card and the right first seat” |
| R4 | A table has 2–6 seats; a target score must be positive. | `setup()` validation | “rejects impossible table sizes and bad targets” |
| R5 | A card is legal when its colour matches, its number matches, or its action symbol matches the top card. | `canPlayCard()` | “matches colour, number and action symbol; wilds always fit” |
| R6 | Wild and Wild Draw Four are legal on any top card and require a called colour. | `canPlayCard()` / `act()` | “requires a colour for a wild and sets the chain colour” |
| R7 | Only the seat whose turn it is may act. | `act()` | “rejects a wrong seat, a missing card and an illegal card” |
| R8 | A card must be in the acting seat's hand and must fit the chain. | `act()` | same |
| R9 | Skip makes the next seat lose a turn. | `act()` | “skips the next seat” |
| R10 | Reverse flips direction; with two players it acts as Skip. | `act()` | “reverses with four seats and acts as skip with two” |
| R11 | Draw Two gives the next seat 2 cards and skips them. | `act()` | “makes the next seat draw two and miss a turn” |
| R12 | Wild Draw Four gives the next seat 4 cards, skips them and sets the called colour. | `act()` | “makes the next seat draw four and sets the wild colour” |
| R13 | Drawing gives one card and keeps the turn; only the drawn card may then be played. | `act()` | “draws one, keeps the turn, and only allows the drawn card next” |
| R14 | A player may pass after drawing, or when no card can be drawn. Passing before drawing is rejected. | `act()` | “refuses to pass before drawing”, “allows a pass when the table has no drawable cards” |
| R15 | When the draw pile is empty, the discard pile (except the top card) is shuffled back. | `takeCards()` | “recycles the discard pile and keeps the top card” |
| R16 | Emptying a hand ends the round; every other seat adds its leftover card points. | `finishRound()` | “ends the round, scores the leftovers and keeps the round winner” |
| R17 | The match ends when any total reaches the target; the lowest total wins. | `finishRound()` | “ends the match at the target and picks the lowest total” |
| R18 | Tied lowest totals share the match. | `finishRound()` | “lets tied lowest totals share the match” |
| R19 | The next round rotates the first seat, keeps scores and redeals 7 cards. | `nextRound()` | “rotates the first seat and carries scores into the next round” |
| R20 | A seat view contains only that seat's hand, never another hand or the draw pile order. | `view()` | “gives each seat only its own hand in the view” |
| R21 | The view reports `canMove`, `canDraw`, `canPass` and legal card ids. | `view()` | “reports canMove, canDraw, canPass and legal ids” |
| R22 | The final ranking sorts by lowest score, then fewest cards. | `ranking()` | “ranks the lowest score first and exposes legal moves for LAN” |
| R23 | All four AI levels return a move accepted by the engine. | `chooseAction()` | AI “returns a legal action on every level from a real deal” |
| R24 | Companion avoids draw penalties aimed at a human with few cards. | `chooseAction()` | “lets the Companion avoid a draw-two on a child with few cards” |
| R25 | Normal and Hard take an immediate winning play. | `chooseAction()` | “takes an immediate win on Normal and Hard” |
| R26 | Hard uses sampled hidden hands and is deterministic with the same RNG. | `sampleHidden()` / `playout()` | “is deterministic with the same injected RNG” |
| R27 | Hints explain a concrete reason and point at a card whenever one fits. | `hintFor()` | hint tests |
| R28 | Random full matches for 2–6 players terminate without getting stuck. | `act()` / `nextRound()` | “finishes random matches for 2–6 players without getting stuck” |

## A turn

1. Play one card that matches the current colour, the top number, or the top action
   symbol. Wild cards fit anywhere.
2. Resolve the action:
   - **Skip** — the next seat is skipped.
   - **Reverse** — direction flips; with two players the opponent is skipped.
   - **Draw Two** — the next seat draws 2 and is skipped.
   - **Wild** — the player calls one of the four colours.
   - **Wild Draw Four** — the next seat draws 4, is skipped, and the player calls a colour.
3. You may draw one card at any time, even when a card fits. After drawing, only that
   card may be played; otherwise keep it and pass. If no card can be drawn, pass.
4. Play continues in the current direction.

## Round and match scoring

When a hand empties, the round ends immediately after the card's effect. The round
winner adds 0; every other seat adds the points left in hand. The winner of the round is
not automatically the winner of the match.

The match ends after a round in which any total reaches the target (100, 200 or 300;
default 200). **The lowest total wins.** If several seats share the lowest total, they
share the match. The family record stores the winning score and the winner names.

## Family variant choices

These are deliberate, documented simplifications rather than engine bugs:

- No draw stacking: a Draw Two or Wild Draw Four is not passed on with another draw card.
- No Wild Draw Four challenge: it may be played even when the player holds a matching
  colour. This keeps the family table friendly.
- The opening discard is always a number card, so the first turn never begins with an
  unresolved opening action.
- No “last card” announcement penalty.
- The deck is reshuffled between rounds, so scores carry but hands do not.

## LAN model

The host is authoritative. It keeps the full `GameState`; each guest gets
`view(state, seat)` containing only that seat's hand, public scores, hand counts, the top
card, the current colour, events and flags. A guest can send only
`{type:'play', cardId, color?}`, `{type:'draw'}` or `{type:'pass'}`. The host applies the
move through the same pure `act()` function and re-checks the seat, turn, hand and card.
Hints are computed by the host and sent as a private hint payload attached to that
guest's next view. Guests cannot undo; the host can rewind its own authoritative state.

If a guest disconnects, the host plays that seat with Normal AI until the guest reconnects.
A guest who joins a started match takes over an AI seat, if one is still open. The host's
own device always plays seat 0.

## AI

- **Companion** plays gently: it takes a win, prefers number/action cards, and avoids
  draw penalties aimed at a human with three or fewer cards. If only an attack fits, it
  may draw and pass instead.
- **Easy** often plays a random legal card and sometimes draws despite having a play.
- **Normal** counts colours, attacks low hands, saves wilds and chooses its strongest
  colour.
- **Hard** samples unknown cards into plausible opponent hands, runs short random
  playouts from each candidate move and picks the best average outcome. It is strong but
  deliberately not perfect.

Every level receives the RNG as a parameter and is deterministic for a fixed seed. The
tests use `mulberry32` seeds; the app injects its own seeded generator.
