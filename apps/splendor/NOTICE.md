# Notices and third-party material

This repository contains an independent, non-commercial implementation of the board game
**Splendor** for private family play.

## Trademarks and game design

- **Splendor** is a trademark of **Space Cowboys** / Marc André. The game design, card names and
  artwork belong to its rights holders.
- This project ships **no** artwork, illustrations, fonts or other protected assets from the
  original game. The card faces are drawn from plain colors, shapes and text; the card data
  (costs, points, bonuses) was reconstructed from public sources and cross-checked as documented
  in `data/card-data-report.md`.
- If you are not the family this was built for, please buy the original game before using this.

## Card data

- Sources and the five-way cross-check: `data/card-data-report.md` (raw snapshots in `data/sources/`).
- The data files (`packages/engine/src/data/*.json`) contain only game-mechanical facts
  (costs, points, bonuses) and no copyrighted expression.

## Background music

- Mozart, Serenade No. 13 in G major, K. 525 — the composition is long in the public domain.
- Recording: Internet Archive item `MozartEineKleineNachtmusik_102`, released under
  **CC0 1.0 Universal** (public domain dedication).
- Details, processing steps and the loop conversion: `docs/music-credits.md`.

## Fonts and icons

- Icons are hand-drawn SVG paths inside this repository (no third-party icon sets).
- The UI uses system font stacks only; no font files are bundled.

## Runtime dependencies

- Desktop shell: **Tauri v2** (MIT/Apache-2.0) using the system **WebView2** runtime on Windows.
- Frontend: React, Motion, Tailwind CSS, Zustand (all MIT).
- No analytics, no telemetry, no network access beyond the local network.
