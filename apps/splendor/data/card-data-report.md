# Splendor card-data verification report

> Goal: reconstruct the **official deck exactly** and produce auditable, reproducible authoritative card data
> (90 development cards + 10 nobles). Authoritative files: `packages/engine/src/data/cards.json`,
> `packages/engine/src/data/nobles.json`.

## 1. Sources (five, mutually independent)

| ID | Source | Kind | Notes |
| --- | --- | --- | --- |
| A | [boardgamers/splendor](https://github.com/boardgamers/splendor) `packages/engine/src/data.ts` | Open-source implementation transcription | Its README claims cross-verification with B/C; that claim did not hold up (see §3) |
| B | [bouk/splendimax](https://github.com/bouk/splendimax) `Splendor Cards.csv` + `src/noble.rs` | Open-source AI project | Noble list misses one entry (Machiavelli W4 U4); otherwise a valid vote |
| C | [seal256/splendor](https://github.com/seal256/splendor) `assets/cards.csv` | Open-source MCTS project | |
| D | [TheGoldenChicken/splendor](https://github.com/TheGoldenChicken/splendor) `cards.json` | Open-source ML environment | |
| E | [anicolao/splendor](https://github.com/anicolao/splendor) `data/verified_card_properties.csv` | **Machine reading of photos of the physical cards + manual review** (repo contains 4048×3126 photos) | The independent source closest to physical reality |

Raw snapshots are kept unmodified in `data/sources/`. Fetch date: 2026-10-13.

## 2. Method

1. `scripts/reconcile.mjs` parses all five formats into one structure, aligns them by “card slot” (tier × bonus ×
   points × cost signature) and counts votes per slot.
2. `scripts/finalize-data.mjs` only generates the authoritative data when B/C/D/E agree **card by card** on all 90
   cards (any disagreement fails the build).
3. Photo review: key cards were visually checked against the physical-card photos (§4).
4. `scripts/verify-data.mjs` runs permanent checks (counts, histograms, legality, structural invariants, noble
   rotation orbits).

## 3. Findings

### 3.1 Source A discarded

- Among B/C/D/E: **90/90 cards, zero disagreement**.
- A versus the other four: **47 slots disagree, and A is the lone vote in all 47**.
- Spot checks (left: A; right: the four-source consensus confirmed by photos/tables):

| Slot | A | Other four |
| --- | --- | --- |
| T1 white 0 points | W1 U1 K3 | **W3 U1 K1** |
| T1 blue 0 points | U3 | **K3** |
| T2 white 2 points (cost 5) | K5 | **R5** |
| T2 white 3 points | K6 | **W6** |
| T2 black 1 point | duplicated internally (same signature ×2 → 91 slots) | **W3 G3 K2** |
| T3 red 5 points | U3 G7 | **G7 R3** |

A's errors look like single-color transcription slips (not a systematic renaming) and include an internal duplicate,
so A was judged a transcription-quality problem and **discarded**.

### 3.2 One noble corrected

- 9 of the 10 nobles: A/B/D agree.
- One dispute: A says “Anne of Brittany = W3 G3 R3”, while B/D agree on **W3 R3 K3**.
- Adopted the B/D majority: **Anne of Brittany = 3 white / 3 red / 3 black**. With that fix the five 3+3+3 nobles
  form a complete rotation ring (just like the five 4+4 nobles), which is structurally self-consistent.
- B's `noble.rs` only had 9 entries (missing Machiavelli W4 U4); it did not change the majority.

### 3.3 An interesting discovery: the official deck is not fully rotation-symmetric

- Rotating all 90 cards along the white → blue → green → red → black → white ring yields 39 orbit fragments, only 12
  of them closed.
- Example: the tier-2, 2-point, cost-5 cards are actually white→5 red, blue→5 blue, green→5 green, red→5 black,
  black→5 white (the per-color offset is not constant).
- Four independent sources (including photo recognition) confirm this asymmetry, and it was verified visually in the
  photos (§4), so it is a **genuine feature of the official design** and was deliberately *not* “corrected”.
- Conclusion: rotation analysis is a diagnostic tool only; multi-source agreement plus photo review decides.

## 4. Photo review log

The physical-card photo (4048×3126) from anicolao/splendor was cropped and enlarged with `scripts/dev/crop.ps1`:

1. **All five cards of column 9 (tier-2, cost 5) checked**: white bonus = 5 red, blue = 5 blue, green = 5 green,
   red = 5 black, black = 5 white — matching the four-source consensus (and falsifying A).
2. **All eight tier-1 white-bonus cards checked**: 3 blue / 1 point + 4 green / 2 red + 1 black / 2 blue + 2 black /
   3 white + 1 blue + 1 black / 2 blue + 2 green + 1 black / 1 of each of blue, green, red, black /
   1 blue + 2 green + 1 red + 1 black — again matching the consensus (falsifying A's “W1 U1 K3” etc.).
3. For the remaining cards, four-source zero-disagreement plus structural invariants (points histograms per tier,
   per-color outlines, legal cost ranges) was accepted as sufficient evidence.

## 5. Authoritative data at a glance

- 90 cards: T1 = 40 / T2 = 30 / T3 = 20; 8/6/4 per color.
- Points histograms: T1 {0×35, 1×5}; T2 {1×10, 2×15, 3×5}; T3 {3×5, 4×10, 5×5}.
- 10 nobles: five (4+4 in two colors) and five (3+3+3 in three colors), each worth 3 points.

## 6. Reproducing

```bash
node scripts/reconcile.mjs                      # five-source comparison → data/tmp/reconcile-report.md
$env:EXCLUDE='A'; node scripts/reconcile.mjs    # excluding A should give 90 slots / 0 disagreements
node scripts/finalize-data.mjs                  # assert four-source agreement and generate the data files
node scripts/verify-data.mjs                    # permanent checks (all green)
```
