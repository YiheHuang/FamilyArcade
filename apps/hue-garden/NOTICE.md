# NOTICE — 彩庭 / Hue Garden

**An original, non-commercial family project. Not an official edition of any
published game.**

## Original expression

- The name **彩庭 / Hue Garden**, the Mediterranean courtyard setting, the six glaze
  names, the six shape symbols, the tile faces, the UI, the copy, the README and the
  promo are original to this project.
- All tile and board art is drawn in code (SVG/CSS). No publisher's card art, board
  art, iconography, card text or product name is included.
- The engine, AI, UI and video are implemented in this repository. There is no
  runtime import from another game repo.

## Mechanics

The game is a tile-laying family game: 6 colours × 6 shapes × 3 copies, a hand of
six, lines that share exactly one attribute, six-in-a-row bonuses, swaps, and an
empty-hand ending. These mechanics are inspired by the broad public tradition of
tile-laying games. Mechanics are not copyrightable; **expression is original**.
The product does not use the Qwirkle name, logo, card text, art or trade dress.
Any resemblance to a published game is at the level of genre mechanics only.

## Trademarks

Any third-party game names, publisher names and trademarks mentioned in
documentation belong to their respective owners. This project is not affiliated
with, endorsed by, or sponsored by any publisher. If you enjoy a published
tile-laying game, please buy it and support its designers.

## Assets and tools

- Code: MIT (see [`LICENSE`](LICENSE)).
- Screenshots, posters, docs and promo: CC BY 4.0 unless noted; they are captures
  or renders of this project's own UI.
- Audio: the ambient bed and sound effects are synthesized by
  `video/scripts/gen-audio.mjs`. Narration is generated with Microsoft Edge TTS
  voices (`zh-CN-YunxiNeural`, `en-US-AndrewNeural`) for this project; no
  third-party music is used.
- Video: built with [Remotion](https://www.remotion.dev/) (company licence applies
  to Remotion itself; this repository is a non-commercial family project).
- Fonts: system font stacks only (Iowan/Palatino/Noto Serif/Songti/Georgia for
  headings; Avenir/Segoe/Noto Sans/PingFang/YaHei for body). No font files are
  redistributed.

## Privacy

No account, no telemetry, no analytics, no ads, no network calls at runtime. Saves,
settings and stats live in the browser's `localStorage`.

## Contact / provenance

This repository is one of four independent family-game repos built from the same
family-game brief (`family-games/docs`). It is not a monorepo and does not import
the other games at runtime.
