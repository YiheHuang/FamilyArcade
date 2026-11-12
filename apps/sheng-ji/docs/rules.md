# Sheng Ji · rule audit

This is the exact rule set the app plays. Every rule below has code in
`src/game/sheng-ji.ts`, at least one unit test in `tests/game.test.ts`, and a clear
edge case. The engine has no DOM, network, clock or `Math.random`; every shuffle
takes an injected RNG.

## Table

- Four players in two fixed partnerships: seats 0 + 2 (South–North) and 1 + 3
  (West–East). Seats play clockwise 0 → 1 → 2 → 3.
- Two identical decks plus four jokers: 108 cards. Each player is dealt 25 cards;
  the last 8 cards are the bottom (`底牌`).
- Both teams start at level 2. A team's level is one of
  2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A. The match is won by making a deal while
  at A.
- The dealer rotates clockwise after every dealt hand. If all four seats pass the
  declaration, the hand is redealt with the next dealer and the levels are kept.

## Declaration (`叫主`)

- A player may declare with one level card of their **own team's** current level,
  showing its suit. This is a single (`strength 1`).
- A player holding both copies of that level card may declare a pair in that suit
  (`strength 2`). A pair is stronger than a single.
- A player holding two identical jokers (big–big or small–small) may declare
  no-trump (`strength 3`). No-trump is stronger than a pair.
- The declaration window is one turn around the table, starting left of the dealer.
  A later seat may only overcall with a **strictly stronger** declaration. Equal
  strength does not overcall; the earlier declaration stands.
- The highest declaration wins. That player is the declarer. The declarer's team is
  the declaring team and the declarer's team level becomes the level rank for the
  deal. The other team defends.
- The declarer takes the eight bottom cards (33 cards in hand), then buries exactly
  eight cards face down. Buried cards are out of play. The declarer then leads the
  first trick.
- If nobody declares, the hand is redealt.

Family-table choice: a single cannot be countered by another single, and there are
no multi-step counter-bids. This keeps a four-seat family declaration quick and
unambiguous. Documented again in [`limitations.md`](limitations.md).

## Trump

- With a declared suit, the trump group is: big joker, small joker, the declared
  suit's level card, every other suit's level card, then the declared suit from A
  down to 2.
- With no-trump, the trump group is the jokers and all four suits' level cards.
  There is no suit trump. Level cards are still trump in no-trump.
- Level cards in a plain suit do **not** count as that suit for following. A heart
  level card is a trump even when hearts are led; it can be used as a ruff or a
  discard, not as a heart follow.
- Pairs must be the same suit and rank (two copies from the two decks). Two level
  cards of different suits are not a pair. Two identical jokers are a pair.
- A tractor is two or more consecutive pairs of the same suit. The level rank is a
  hole in its suit: if 5 is level, 4-6 is not a tractor. Jokers and level cards are
  not part of a sequence; they form pairs only.
- No-trump has tractors only in the plain suits. The trump group has pairs, not
  tractors.

## Leads and combinations

A lead is one of:

1. **Single** — one card.
2. **Pair** — two identical cards.
3. **Tractor** — two or more consecutive pairs in one suit (four or more cards).
4. **Throw (`甩牌`)** — two or more components (singles, pairs, tractors) of one
   plain suit, led together.

A throw is never led in trump. A trump lead is only a single, pair or tractor.

### The family throw rule

This app uses the common family-table rule requested by the brief:

1. A throw must contain at least two components.
2. Components are read in the canonical order: the longest consecutive pair run
   first (one tractor), then remaining pairs, then singles. Example: 5-5, 6-6, 9 is
   a 5-6 tractor plus a single 9, with `pairNeed = 2`.
3. **Every component must be the current highest component of its kind** among all
   cards still held by the other three players. If one single, pair or tractor can
   be beaten, the whole throw is refused.
4. A legal throw can only be beaten by a matching trump ruff. In-suit followers
   cannot beat a legal throw; they still play their cards and their point cards go
   to the winner.
5. To ruff a throw, the follower must be void in the led suit, play exactly the
   same number of cards, all trump, and hold at least as many pairs as the throw's
   `pairNeed`. A ruff with fewer pairs does not win.

### Following

- Followers must play exactly the number of cards led.
- If they hold enough cards of the led group, every card they play must be from
  that group. The led group is the declared trump group for a trump lead, or the
  non-level cards of a plain suit.
- If they hold fewer than the required number, they must play all their cards of
  the led group, then fill with any other cards (trumps or off-suit cards).
- Shape matching:
  - A pair lead must be answered with a pair if the follower has one.
  - A tractor lead must be answered with a tractor of the same length if the
    follower has one. If not, the follower must include as many pairs as possible.
  - A throw lead must include at least `min(pairNeed, available pairs)` pairs when
    the follower can follow the suit. This is the family simplification: exact
    component-by-component tractor shape is not forced on the defence.
- A level card never counts as a follow in its plain suit.

## Trick winner

- A play must match the led shape to be eligible to win: singles with singles,
  pairs with pairs, tractors with same-length tractors, throws with the same count
  and pair count.
- A trump play beats a plain-suit play, even a higher plain card. A mixed play that
  is not entirely trump cannot win a plain-suit trick.
- Within the same category, the highest card wins. Ties go to the earlier seat.
- A legal throw is already the highest of every in-suit component; only a matching
  trump ruff can take it. A same-suit follow cannot beat it.

## Points and scoring

- Point cards: 5 = 5, 10 = 10, K = 10.
- Family 100-point table: each point-card **face** scores once per deal. The first
  deck's copy carries the value; the duplicate deck copy is a blank point card and
  shows a small `0`. This keeps the classic 100-point table with two decks. There
  are 100 points in the full deck before burying.
- Buried point cards leave the deal. `availablePoints = 100 − buried points`.
- The declaring team scores the points in tricks it wins. The defending team scores
  the rest. Because the upgrade target stays at 80, burying point cards reduces the
  maximum the declarers can collect and is a real risk.
- At the end of the deal:
  - Declarers 80–100: declarers upgrade one level.
  - Declarers 40–79: no level change; the next deal is open to a fresh declaration.
  - Declarers 1–39: defenders upgrade one level.
  - Declarers 0: defenders jump three levels (the shutout / big jump).
- Levels are capped at A. A failed deal at A does not drop the team; they remain at
  A and must make a deal at A to win.
- A team at A that makes 80+ wins the match immediately. Reaching A by an upgrade
  does not win yet.

Family-table choices: no banker carry-over (each deal is declared fresh), no
bottom-point doubling, no tribute/exchange, and no demotion on a failed A deal. These are documented in
[`limitations.md`](limitations.md).

## Deal end

The deal ends when every hand is empty. Because throws can consume several cards
at once, a deal can finish in fewer than 25 tricks; all 100 non-buried cards have
still been played. The engine checks for empty hands after every trick.

## AI

- **Companion** — gentle declaration threshold, avoids spending jokers or level
  cards on empty tricks, and does not overtake a winning partner for no points.
- **Easy** — loose declaration and random legal plays with a small heuristic
  fallback.
- **Normal** — values point cards, trump economy, partner cover and control.
- **Hard** — adds the 80-point line, void/ruff awareness, throw safety, thinner
  current-trick wins and a stronger declaration threshold. Its valuation uses only
  public information (own hand, played cards, hand counts, points); the engine's
  throw-legality check is the one rule that necessarily consults the whole table,
  and it returns only a legal/illegal answer rather than handing the AI a hidden
  hand.

## Modes and privacy

- Solo: human seat 0, three AI seats.
- Hot-seat: four humans, a pass-the-device curtain before every private hand,
  including the declarer's 33-card bury hand.
- LAN: host seat 0, up to three guests; empty seats are AI. The host owns the state
  and sends `view(state, seat)` to each connected guest. Intents carry the state
  `version`; stale or wrong-seat intents are ignored. Undo and hints are paused in
  LAN play.
- Autosave and undo are available in solo and hot-seat. The family record is stored
  locally; LAN deals are recorded on the host device.

## Test coverage map

The suite currently has **70 meaningful unit tests** across
`tests/game.test.ts` and `tests/storage.test.ts`. It covers the 108-card deck,
100-point table, seeded deals, trump order, pairs, tractors, representatives of all
throw components, safe and unsafe throws, following, level-card follow, trick
resolution, declaration overcalls, no-trump, the bottom, burying, views, every
scoring branch, the A match, dealer rotation, AI declaration/bury/play/partner
cover, a complete AI deal, and storage normalization.
