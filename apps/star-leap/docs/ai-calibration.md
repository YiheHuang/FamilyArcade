# AI calibration (v0.2, 200-game sample)

Generated 2026-11-11 by `npm run calibrate`. Self-play, **200 games per match-up** with alternating colours.

## Method

- Same TypeScript engine and four AI levels as the app; no app UI in the loop.
- Per-move wall-clock caps: Companion 2 ms, Easy 2 ms, Normal 5 ms, Hard 10 ms. The
  live app allows more time (80 / 100 / 300 / 800 ms), so this is a repeatable lower-bound
  sample, not a claim about how long the app thinks.
- Seeded RNG for tie-breaking; the engine itself has no clock or bare `Math.random`.
- A game ends when a player fills the opposite triangle; otherwise the engine settles at
  the 80-turn no-progress rule or the 300-move safety cap.

## Results

| Match-up | Games | A wins (95% CI) | B wins (95% CI) | Draws | Avg moves | Ended by (home / stalemate / cap) |
| --- | --- | --- | --- | --- | --- | --- |
| normal vs easy | 200 | 136 (68%) (61–74%) | 36 (18%) (13–24%) | 28 (14%) | 188 | 172 / 0 / 28 |
| normal vs normal | 200 | 46 (23%) (18–29%) | 53 (27%) (21–33%) | 101 (51%) | 242 | 99 / 5 / 96 |
| hard vs normal | 200 | 4 (2%) (1–5%) | 18 (9%) (6–14%) | 178 (89%) | 288 | 22 / 3 / 175 |
| companion vs easy | 200 | 0 (0%) (0–2%) | 176 (88%) (83–92%) | 24 (12%) | 201 | 176 / 0 / 24 |

Whole run: 3.2 minutes (serial, one matchup at a time).

## How to read it

- **Normal beats Easy** and **Companion is gentle**: both match the level descriptions.
- **Hard vs Normal is defensive.** The deeper look-ahead mostly produces blocking: a large
  majority of these games reached the 300-move cap, and Normal edged the few decisive games.
  Use Hard for a deliberate opponent, not as a guarantee of a stronger one. This is a real
  finding to tune, not a flattering table.
- Draws are real results under the house stalemate/cap rules; they are not failed games.
- Confidence intervals are 95% Wilson intervals. With 200 games, differences under roughly
  10 percentage points should be treated as noise.

## Reproduce

```bash
npm run calibrate                 # 200 games per matchup
$env:CALIBRATION_GAMES=20; npm run calibrate   # PowerShell quick pass
CALIBRATION_GAMES=20 npm run calibrate         # macOS/Linux quick pass
```

The table is a regression baseline for tuning, not a public strength rating. Family
playtests still decide whether a level feels kind or interesting.
