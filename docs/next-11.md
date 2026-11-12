# The next 11 games

The family-private batch after the 42-game release. Every game keeps the same
delivery contract: pure engine, four AI levels, solo / hot-seat / LAN, bilingual UI
and README, real screenshots, a 45-second promo and its own Tauri installer.

| # | Game | Slug | Seats | Type |
| --- | --- | --- | --- | --- |
| 1 | Dou Dizhu · 斗地主 | `doudizhu` | 3 | Chinese climbing |
| 2 | Texas Hold'em · 德州扑克 | `texas-holdem` | 2–6 | Poker |
| 3 | Zheng Shangyou · 争上游 | `zheng-shangyou` | 3–6 | Chinese climbing |
| 4 | Joker's Table · 小丑牌桌 | `jokers-table` | 1–4 | Poker roguelike |
| 5 | Guandan · 掼蛋 | `guandan` | 4 | Partnership climbing |
| 6 | Mahjong · 麻将 | `mahjong` | 4 | Chinese tile |
| 7 | Big Two · 大老二 | `big-two` | 4 | Chinese shedding |
| 8 | Sheng Ji · 升级 | `sheng-ji` | 4 | Partnership trick-taking |
| 9 | Liar's Dice · 吹牛骰 | `liars-dice` | 2–6 | Bluffing dice |
| 10 | Idiom Chain · 成语接龙 | `idiom-chain` | 2–6 | Word game |
| 11 | Nanchang Mahjong · 南昌麻将 | `nanchang-mahjong` | 4 | Regional tile |

## 1. Dou Dizhu · 斗地主

- 54 cards, three players: one landlord against two farmers.
- Deal 17 cards each and three bottom cards. Bidding is 1, 2, 3 or pass; the highest
  bid takes the bottom cards and becomes landlord. All pass redeals.
- Ranks: 3 < 4 < … < 10 < J < Q < K < A < 2 < small joker < big joker; suits do not
  matter.
- Combinations: single, pair, triple, triple + single, triple + pair, straight of five
  or more singles (3–A), consecutive pairs (three or more), airplane (two or more
  consecutive triples, with optional single or pair wings), four + two singles or two
  pairs, bomb (four of a kind) and rocket (both jokers).
- A play must beat the previous combination with the same type and length, or use a
  bomb/rocket. Two passes reset the trick to the last player.
- Landlord wins when the landlord empties; farmers win when either farmer empties.
- Scoring: base bid × bomb/rocket multipliers × spring. Landlord spring means no
  farmer ever played; farmer spring means the landlord played only once.
- AI: hand decomposition, combo preservation, bomb timing, farmer cooperation.
- Modes: solo with two AI, three-player hot-seat with privacy curtains, LAN host +
  two guests. Per-seat views only.

## 2. Texas Hold'em · 德州扑克

- 2–6 seats, 52 cards, play money only. No real-money, odds or cash features.
- Dealer button rotates; small and big blinds; no-limit betting with fold, check,
  call, bet, raise and all-in.
- Streets: pre-flop, flop, turn, river, showdown. Burn cards are not shown.
- Full hand ranking: royal flush, straight flush, four of a kind, full house, flush,
  straight, three of a kind, two pair, one pair, high card. Ace high or low in
  straights; wheel A-2-3-4-5.
- Side pots for unequal all-ins; split pots; odd chips go to the first seat left of
  the button.
- AI: hand strength, pot odds, position, stack pressure, honest bluffs. Companion is
  gentle, Hard is strong but never peeks at hidden cards.
- Modes: solo against AI seats, hot-seat 2–6 with privacy, LAN host + guests. Hidden
  hole cards per seat only.
- Tests: exhaustive hand evaluator, side-pot cases, betting legality, seeded deals.

## 3. Zheng Shangyou · 争上游

- 3–6 players, 52 cards, no jokers. Deal all cards as evenly as possible.
- The holder of 3♣ leads the first trick and must include 3♣.
- Combinations: single, pair, triple, triple + single, triple + pair, straight of five
  or more (3–A), consecutive pairs (three or more), bomb (four of a kind).
- A play must beat the previous combination with the same type and length, or a bomb.
  Two passes reset the trick to the last player.
- Finish order: upstream, second, third, … downstream. Score +3 / +1 / −1 / −3 for
  four players, scaled for other counts.
- Next round tribute: downstream gives their highest card to upstream; upstream
  returns any card. With two downstream players, both tribute.
- AI: combo decomposition, control cards, tribute choice, partner-free aggression.
- Modes: solo with AI, hot-seat with privacy, LAN. Per-seat views.

## 4. Joker's Table · 小丑牌桌

An original poker roguelike. The core loop may follow the genre, but **all names,
jokers, bosses, art, copy and balance are original**. Do not use Balatro assets,
joker names, UI layout, neon-pixel art or copied text.

- 52-card deck, eight-card hand, five-card poker plays, four joker slots.
- A run has six antes, each with Small Blind, Big Blind and Boss Blind. Each blind
  gives four hands and three discards. Score = chips × mult.
- Shop between blinds: buy original jokers, card enhancements and vouchers with the
  money earned. Boss blinds impose one original restriction.
- Original content target: at least 24 jokers, 8 bosses, 4 decks, 6 enhancements.
- Solo: complete all six antes to win.
- Competitive 2–4: same seed, each player runs the same blind sequence on their own
  board. After each blind, compare scores; the lowest score loses one of three hearts.
  Ties are safe. Last player with hearts wins.
- Modes: solo, hot-seat competitive with privacy, LAN competitive with host-shared
  seed and score submission. AI rivals use four levels.
- AI: joker synergy, hand EV, shop discipline, risk at low hearts.
- Tests: poker-hand detection, chip/mult scoring, every joker, boss modifiers, seeded
  determinism, competitive elimination.

## 5. Guandan · 掼蛋

- Four players in two partnerships, two decks (108 cards), 27 cards each.
- Current level card ranks just below jokers; the heart level card is a wildcard
  (“逢人配”) that can stand in for any non-joker card.
- Combinations: single, pair, triple, triple + pair, straight of five, consecutive
  pairs (three pairs), consecutive triples (two triples), bomb (four or more of a
  kind), straight flush and joker bomb.
- Bomb order: four-card bomb < five-card bomb < straight flush < six-card bomb < …
  < joker bomb. A bomb beats any non-bomb; same-size bombs compare rank.
- A play must beat the previous combination with the same type and length, or a bomb.
  Three passes reset the trick.
- Finish order decides the level gain: partners first and second +3; first and third
  +2; first and fourth +1.
- Tribute: the losing side gives their highest card(s) to the winners; winners return
  a card. Anti-tribute when the losing side holds both jokers.
- Match to level A. AI: partnership, level-card wilds, bomb economy, tribute.
- Modes: solo with three AI, four-player hot-seat with privacy, LAN four seats.

## 6. Mahjong · 麻将

- Four players, 136 tiles: 3 suits × 1–9 × four copies, four winds, three dragons.
  No flowers.
- 13-tile hand, dealer starts with 14. Draw, discard, chi (left player only), peng,
  exposed/concealed/added kong, robbing a kong, self-draw and discard wins.
- Winning hands: four melds + pair, seven pairs, thirteen orphans.
- Minimum fan configurable (default 1). Fan table: self-draw, concealed hand, all
  simples, all triplets, mixed one suit, pure one suit, pure straight, seven pairs,
  thirteen orphans, seat wind, prevalent wind, dragon triplet, kong draw, last tile.
- AI: shanten, tile efficiency, visible-tile counting, defence, meld decisions.
- Modes: solo with three AI, four-player hot-seat with privacy, LAN four seats.
- Tests: win detection, seven pairs, thirteen orphans, fan scoring, kong/robbing kong,
  seeded walls.

## 7. Big Two · 大老二

- Four players, 52 cards, 13 each.
- Rank: 3 < 4 < … < 10 < J < Q < K < A < 2. Suit order: diamonds < clubs < hearts <
  spades.
- The holder of 3♦ leads and must include 3♦ in the first play.
- Combinations: single, pair, triple, five-card straight, flush, full house, four of
  a kind + one, straight flush.
- Five-card order: straight < flush < full house < four of a kind < straight flush.
  A play must beat the previous combination with the same type and length.
- First to empty wins. Score: one point per remaining card; doubled at ten or more
  cards; tripled for thirteen.
- AI: hand decomposition, suit control, endgame counting, safe leads.
- Modes: solo with three AI, four-player hot-seat with privacy, LAN four seats.

## 8. Sheng Ji · 升级

- Four players in partnerships, two decks (108 cards), eight bottom cards.
- Bidding/declaring: a player may declare a trump suit with a level card; no-trump is
  an option. The declarer takes the bottom cards and buries eight.
- Trump: the declared suit plus the level rank in every suit, then jokers.
- Play: singles, pairs, tractors (consecutive pairs) and throws (multiple combos led
  together). Follow suit if possible; trump beats; off-suit discards are allowed.
- Points: 5 = 5, 10 = 10, K = 10; 100 points total. Declarers need 80 points to
  upgrade; 0 points is a big jump. Match to level A.
- AI: bid strength, trump control, point tracking, partner cover, throw safety.
- Modes: solo with three AI, four-player hot-seat with privacy, LAN four seats.
- If a throw variant is too large for one pass, implement the common family rule:
  a throw is legal only when every component is the current highest; document the
  exact table rule in `docs/rules.md`.

## 9. Liar's Dice · 吹牛骰

- 2–6 players, five dice each, hidden under cups.
- Each bid states a quantity and a face, e.g. “three fours”. Ones are wild by default.
- A turn may raise the quantity, raise the face at the same quantity, or challenge.
- On a challenge, all dice are revealed. If the bid is true the challenger loses one
  die; if false the bidder loses one die. A player at zero dice is out; last standing
  wins.
- Optional “spot on” call: an exact bid wins the round for the caller; document the
  table option.
- AI: probability, bid legality, bluff frequency, opponent modelling. Four levels.
- Modes: solo with AI, hot-seat 2–6 with privacy, LAN. Hidden dice per seat.

## 10. Idiom Chain · 成语接龙

- 2–6 players. Bundled original dictionary of at least 500 common Chinese idioms with
  pinyin and a short English gloss.
- A play must start with the last character of the previous idiom. A default
  15-second timer is configurable. No repeats. Invalid or late plays lose the turn.
- Scoring: 1 point per valid idiom, +2 for a rare idiom, +1 for using a hint-free
  chain of three or more. First to 10 points or last standing wins.
- AI: dictionary search by first character, difficulty by idiom frequency and length.
- Modes: solo with AI, hot-seat, LAN. Chinese idiom content is the game content; all
  UI and README prose are still fully bilingual.

## 11. Nanchang Mahjong · 南昌麻将

- Four players, 136 tiles, 13-tile hand, chi/peng/gang, no flowers. 17 stacks remain
  as the dead wall.
- Special honour sequences: any three different winds, or any three different
  dragons, form a sequence.
- Spirit tiles (“精”): after the deal the dealer rolls two dice and flips a tile from
  the wall end. The flipped tile is the true spirit; the next tile in the same suit
  (honours cycle winds and dragons separately) is the secondary spirit. The flipped
  tile itself is not a spirit. There are seven spirits in the wall: three true and
  four secondary. Spirits are wildcards and may be discarded; when eaten, ponged,
  konged or won they belong to the new owner.
- Winning patterns: four melds + pair; small seven pairs (seven pairs, two identical
  pairs allowed, no melds); big seven pairs (all triplets + pair); thirteen scattered
  (fourteen tiles, number tiles at least three apart in each suit, no repeated
  honours); seven-star thirteen scattered (all seven honours plus seven spaced number
  tiles, honours not replaced by spirits).
- Scoring: implement the published Nanchang table: self-draw ×2, discard payer ×2 and
  others ×1, dealer ×2, kong bonuses, true spirit 2 / secondary spirit 1, overlord
  spirit ×2 when only one player has spirits, spirit sprint (5 points ×2, 6 ×3 … 10
  ×7), German ×2+5, German-in-German ×4+5, spirit single-wait ×2+5, kong draw ×4,
  robbing kong ×4, heavenly/human hand ×20, seven pairs / thirteen scattered ×2,
  seven-star ×4. Document any table option such as copy-dealer or bottom-flip in
  `docs/limitations.md`.
- AI: wild-tile efficiency, thirteen-scattered detection, spirit counting, defence.
- Modes: solo with three AI, four-player hot-seat with privacy, LAN four seats.
- Tests: spirit assignment, honour sequences, all win patterns, scoring table,
  kong/robbing kong, seeded walls.

## Shared delivery requirements

- Pure engine in `src/game/`; no DOM, network, clock or `Math.random`; injected RNG.
- At least 25 meaningful tests per game; `docs/rules.md` audit and honest
  `docs/limitations.md`.
- Four AI levels; hidden-information games use per-seat views only.
- Solo, hot-seat and LAN; LAN E2E must be run on an assigned port.
- Bilingual English/Chinese UI and separate README files; no mixed-language screens.
- Real screenshots in `docs/screenshots/{en,zh}` at 1440×1000 desktop and 780×1688
  mobile.
- `video.json` with eight bilingual lines, three screens per language, and a title
  that matches the app.
- Keep the Tauri shell and shared LAN bridge. Do not run Tauri builds; the central
  build agent does that.
