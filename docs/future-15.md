# The Classic 15

Fifteen full-rules classics, built in the same monorepo pattern as the rest of Family
Arcade: one independent app per game, a pure TypeScript engine, four AI levels,
hot-seat and LAN, bilingual UI, real screenshots, a promo and its own installer.

| # | Game | Slug | Rules | Seats |
| --- | --- | --- | --- | --- |
| 1 | Gomoku | `gomoku` | 15×15 freestyle five-in-a-row; overlines count, no Renju bans | 2 |
| 2 | Xiangqi | `xiangqi` | 9×10 board, palace, river, flying general, checkmate and stalemate | 2 |
| 3 | Chess | `chess` | FIDE moves, castling, en passant, promotion, 50-move and threefold draws | 2 |
| 4 | Go | `go` | 19×19 with 9×9 and 13×13; captures, suicide ban, simple ko, komi, area scoring | 2 |
| 5 | Shogi | `shogi` | 9×9, optional and forced promotion, drops, nifu, uchifuzume, repetition | 2 |
| 6 | International Draughts | `intl-draughts` | 10×10, flying kings, mandatory maximum capture, promotion | 2 |
| 7 | Jungle Chess | `jungle-chess` | 7×9, animal ranks, river, lion/tiger jumps, traps, dens | 2 |
| 8 | Hearts | `hearts` | Four players, pass three, follow suit, hearts and queen, shoot the moon | 4 |
| 9 | Spades | `spades` | Partnerships, bidding, nil, trump, bags, 500-point match | 4 |
| 10 | Rummy 500 | `rummy-500` | Draw, meld, lay off, ace high or low, deadwood, 500 target | 2–4 |
| 11 | Cribbage | `cribbage` | Crib, cut, pegging, hands and crib scoring, 121 points | 2–4 |
| 12 | Abalone | `abalone` | 61-point hexagon, 1–3 marble lines, push-off, first to six captured | 2 |
| 13 | Hive | `hive` | Base set, one-hive rule, beetle stacking, spider three, queen surround | 2 |
| 14 | Quarto | `quarto` | 16 unique pieces, choose for the opponent, four attributes in a line | 2 |
| 15 | President | `president` | 3–6 players, climbing singles/pairs/triples, ranks, exchange | 3–6 |

## Shared requirements

- Engine in `src/game/` with no DOM, network, clock or `Math.random`; injected RNG.
- At least 20 tests per game; rules audit in `docs/rules.md`; honest limits documented.
- Four AI levels; Companion is gentle, Hard is strong but never peeks at hidden hands.
- Solo, hot-seat and LAN; hidden hands use per-seat views only.
- Separate English and Chinese READMEs, no mixed-language screens.
- Real screenshots, `video.json`, a Remotion promo and a Tauri/Windows installer.
- No cloud, accounts, ads, telemetry or external assets.

## Delivery order

1. Gomoku, Xiangqi, Chess, Go — the four flagships.
2. Shogi, International Draughts, Jungle Chess, Abalone, Hive, Quarto — abstract two-player.
3. Hearts, Spades, Rummy 500, Cribbage, President — card table.
