# AI design and difficulty calibration

> Design input came from real-table experience: **engine building** (beginners buy many efficient tier-1 cards —
> single-color 3s and 2+1s — to stack discounts and nobles, then score with almost-free tier-2/3 cards), versus
> **sprinting** (experts aim at big tier-3 cards such as 7+3 / 7 and high-efficiency tier-2 cards like 5 / 6 of one
> color or 4+2+1, hoarding one or two colors plus discounts to reach 15 as fast as possible).

The evaluation function implements both routes plus card-efficiency bonuses. Difficulties differ by **style weights**
rather than by "how random they are":

| Level | Style | Engine | Sprint | Defense | Flexibility | Random moves | Endgame search |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Companion | Engine building, never targets kids | 1.25 | 0.75 | 0 | 1.4 | 8% | no |
| Easy | Engine building | 1.2 | 0.9 | 0.1 | 0.7 | 8% | no |
| Normal | Balanced | 1.0 | 1.0 | 0.5 | 0.3 | 0 | no |
| Hard | Sprinting (locks big cards, blocks opponents) | 1.0 | 1.1 | 0.6 | 0.05 | 0 | yes (from 12 points: simulates the opponent's best reply) |

Evaluation highlights:

- **Efficiency bonuses** for tier-1 “3 of one color” and “2+1”, tier-2 “5 / 6 of one color” and “4+2+1”, and tier-3
  “7 of one color” and “7+3”.
- **Target appeal** over the three best “value × deficit decay” targets, so the AI hoards the colors it actually
  needs (deficits 0/1/2/3 decay as 1 / 0.6 / 0.4 / 0.26).
- **Phase weights**: engine-building early (first ~12 turns), gradually sprinting afterwards.
- **Lock-in reserving**: reachable 4–5 point cards (deficit ≤5) are reserved early to deny them to opponents.
- Basic terms for the 10-token limit, noble progress and opponent threats (value of cards they can already buy).

## Measured win rates (60 games each, 2-player games alternate the first player)

| Match-up | Result |
| --- | --- |
| Hard vs Normal | **63% : 37%** |
| Hard vs Easy | 63% : 37% |
| Normal vs Easy | 63% : 33% (1 draw) |
| Easy vs Companion | 60% : 40% |
| Hard vs Normal vs Easy (3 players) | **47% : 27% : 27%** |

All four levels form a clean ladder. Parameters were calibrated with 600+ ablation games
(`scripts/dev/ai-ablation.mjs`):

- Pure sprint (1.0/1.35/0.4) and pure engine building (1.15/1.0/0.6) both win only ~50%;
- **Balanced-but-slightly-sprinting with moderate defense (1.0/1.1/0.6) reaches 59%** — efficient cards first, sprint
  when it counts, block a little — matching the human advice above.

## Deadlock fallback (a rule edge case)

In extreme positions (bank emptied, nothing buyable on the table, all reserved areas full) the official rules offer
no way out. The engine handles it by **settling on current scores after a full round of passes** (tie-breaks as in a
normal ending); the UI labels it “Deadlock — settling by current score”. This guarantees every game can finish, in
both local and server play.

## Reproducing

```bash
node scripts/dev/sim-batch.mjs 60     # difficulty ladder batches
node scripts/dev/ai-ablation.mjs 120  # parameter ablation (against Normal)
```
