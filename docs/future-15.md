# Family Arcade · next 15 games

These are the next 15 **full-rules classics**, in the same monorepo pattern: one
independent app per game, pure engine, four AI levels, hot-seat, LAN, bilingual UI,
real screenshots, a 45-second promo and its own installer.

| # | Game | Slug | Rules | AI focus | Seats |
| --- | --- | --- | --- | --- | --- |
| 1 | Gomoku · 五子棋 | `gomoku` | 15×15 freestyle five-in-a-row; forbidden moves are not used | threat space, open threes/fours, 6-ply search | 2 |
| 2 | Xiangqi · 中国象棋 | `xiangqi` | 9×10 board, full piece moves, flying general, check/checkmate/stalemate | material + king safety + 4-ply search | 2 |
| 3 | Chess · 国际象棋 | `chess` | FIDE move rules: castling, en passant, promotion, 50-move, threefold, checkmate/stalemate | material + piece-square + alpha-beta | 2 |
| 4 | Go · 围棋 | `go` | 19×19, also 9×9/13×13; captures, suicide, simple ko, komi, pass/pass scoring | liberty/influence + playouts | 2 |
| 5 | Shogi · 将棋 | `shogi` | 9×9, drops, promotion, check/checkmate | material + drop safety + 3-ply | 2 |
| 6 | International Draughts · 国际跳棋 | `intl-draughts` | 10×10, flying kings, mandatory maximum capture | capture search + endgame tables | 2 |
| 7 | Jungle Chess · 斗兽棋 | `jungle-chess` | 7×9, animal ranks, river, traps, den | rank/den race + trap safety | 2 |
| 8 | Hearts · 红心大战 | `hearts` | 4 players, pass 3, tricks, hearts/queen, shoot the moon | void tracking + pass choice | 4 |
| 9 | Spades · 黑桃皇后 | `spades` | 4 players in partnerships, bidding, trump, bags | bid estimate + partner cover | 4 |
| 10 | Rummy 500 · 五百分拉米 | `rummy-500` | draw/discard, melds/runs, lay-off, 500 target | meld potential + discard safety | 2–4 |
| 11 | Cribbage ·  cribbage | `cribbage` | deal, crib, pegging, 121 points | hand EV + pegging | 2–4 |
| 12 | Abalone · 大力士棋 | `abalone` | hexagonal push-out, 2–3 marbles, 6-in-a-row | push lanes + edge pressure | 2 |
| 13 | Hive · 虫虫棋 | `hive` | base pieces, one-hive rule, beetle/gate/queen rules | placement + pin/tempo | 2 |
| 14 | Quarto · 四连棋 | `quarto` | 4×4, 16 unique pieces, choose piece for opponent, quarto | forced-piece search | 2 |
| 15 | President · 排位赛 | `president` | climbing/shedding, ranks, pass, first-out order | hand decomposition + control | 3–6 |

## Delivery order

1. Chess, Xiangqi, Gomoku, Go — the four requested flagships.
2. Shogi, International Draughts, Jungle Chess, Abalone, Hive, Quarto — abstract two-player.
3. Hearts, Spades, Rummy 500, Cribbage, President — card table.

## Shared requirements

- Engine in `src/game/` with no DOM/network/clock/`Math.random`; injected RNG.
- At least 20 tests per game; rules audit in `docs/rules.md`.
- Four AI levels; Companion is gentle, Hard is strong but honest.
- Hot-seat, solo and LAN; hidden hands use per-seat views only.
- Bilingual UI/README, no mixed-language screens.
- Real screenshots, `video.json`, 45 s Remotion promo, Tauri/Windows installer.
- No cloud, accounts, ads, telemetry or external assets.

## Why these 15

They add the “proper” classics the family asked for (Gomoku, Xiangqi, Chess, Go) plus
three more deep abstracts (Shogi, International Draughts, Jungle Chess) and a full
card table (Hearts, Spades, Rummy, Cribbage, President). Abalone/Hive/Quarto add
modern abstract classics without licensed content.
