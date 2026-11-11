# AI calibration · v0.1

Command:

```bash
# macOS / Linux
CAL_GAMES=400 npm run ai:calibrate
```

Windows PowerShell:

```powershell
$env:CAL_GAMES="400"; npm run ai:calibrate
```

`npm run ai:calibrate` runs `scripts/ai-calibration.ts` with `vite-node`. It uses the real engine, real AI evaluators and a fixed seed per game; no mocks. The harness plays 2-player games and alternates which level sits in seat 0. All levels are capped at **80 ms** per decision. The script defaults to **200 games per matchup**; the published table below is a **400-game** run.

## Results (2 players, 400 games per matchup)

| Matchup | Wins | Win rate | Average points (A / B) | Average table total |
| --- | --- | --- | --- | --- |
| Hard vs Normal | 259–141 | **64.8%** Hard | 39.3 / 35.7 | 37.5 |
| Normal vs Easy | 241–159 | **60.3%** Normal | 44.0 / 41.8 | 42.9 |
| Easy vs Companion | 251–149 | **62.7%** Easy | 46.5 / 42.7 | 44.6 |

Target from the family standard:

| Pair | Target | Result |
| --- | --- | --- |
| Hard vs Normal | 60–70% | 64.8% ✓ |
| Normal vs Easy | 60–70% | 60.3% ✓ |
| Easy vs Companion | 55–65% | 62.7% ✓ |

## Random-play score calibration

400 seeded random games across 2–5 players (1,400 seats):

| Metric | Value |
| --- | --- |
| Average seat score | **39.33** |
| Minimum / maximum seat score | 24 / 65 |
| Average set points per seat | 25.75 |
| Average sampler points per seat | 3.87 |
| Average leftover points per seat | 4.63 |
| Average crown points per seat | 5.08 |

This lands inside the design target of **30–45** for a typical family game. The AI tables are slightly higher because the AI deliberately builds sets and crowns; that is expected for expert play.

## How the levels differ

| Level | Evaluation and search | Noise / variety | Safety rule |
| --- | --- | --- | --- |
| **Companion** | Current score + combo potential + sampler/crown nudges; no denial weight. | High noise and a 30% pick from the safe top pool. | Avoids taking the last copy of a dessert a human opponent needs for a triple/full plate when another candidate exists. |
| **Easy** | Shallow heuristic; weak denial. | 35% pick from the top 4 and higher noise. | No special targeting. |
| **Normal** | Heuristic plus a **4-sample** sampled-hand rollout. | Low noise, no random top-pick. | No special targeting. |
| **Hard** | Heuristic plus a **32-sample** rollout (24 for 3 players, 16 for 4–5), including the hand it passes and the next player's best reply. | Very low noise. | No special targeting. |

The rollout samples opponent hands only from card ids that are **outside** the player view. It does not read engine state or hidden hands. This is the core of the “difficulty not cheating” rule.

## Known calibration gaps

- Only 2-player matchups are reported. 3–5 player games are supported and simulated for legality/termination, but not separately calibrated for win rate.
- 400 games is enough to catch large regressions, not to publish a precise human-vs-AI win rate. No human playtest data is included.
- The Companion promise is heuristic: it checks “human opponent has 2 or 3 of this dessert in the current round, and this is the last copy in my hand”. It does not model every possible future need.
- The AI budget is enforced by a deadline check; on a very slow machine Hard returns its best candidate so far rather than blocking.
