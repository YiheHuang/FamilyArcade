# Background music — sources and license

The three in-game tracks are excerpts of a single **CC0 (public domain)** recording. They were trimmed to
phrase-aligned loops, faded and encoded to Ogg Opus 40 kbps (~1.9 MB total) so the installer stays small.
The earlier 64 kbps Vorbis versions (full-length excerpts, ~3.9 MB) remain in git history.

| File | Piece | Length now | Original excerpt |
| --- | --- | --- | --- |
| `theme-1.ogg` | Mozart — Serenade No. 13 in G major, K. 525 “Eine kleine Nachtmusik” | ≈ 1:52 (loop) | ~1.2s–238.9s |
| `theme-2.ogg` | same | ≈ 1:52 (loop) | ~242.1s–448.3s |
| `theme-3.ogg` | same | ≈ 1:52 (loop) | ~450.6s–676.5s |

- Music: Wolfgang Amadeus Mozart (1756–1791), K. 525 — the composition itself is long in the public domain.
- Recording source: Internet Archive item `MozartEineKleineNachtmusik_102`
  - Item page: https://archive.org/details/MozartEineKleineNachtmusik_102
  - Downloaded file: `MozartALittleNightMusic.ogg`
  - License: **CC0 1.0 Universal (public domain dedication)** — https://creativecommons.org/publicdomain/zero/1.0/
- Original processing: `ffmpeg -ss <start> -t <len> -af afade,loudnorm=I=-20 -ar 44100 -c:a libvorbis -b:a 64k`
- Loop conversion: `node scripts/dev/optimize-music.mjs` — detects musical pauses (`silencedetect`), cuts each track
  to ~112 s ending near a pause, applies 0.8 s in / 2.2 s out fades and encodes Opus 40 kbps stereo.

> This project is for private family play. CC0 requires no attribution, but the source is recorded here for traceability.
> To swap the soundtrack, drop your own `theme-1/2/3.ogg` into `packages/client/public/music/` — no code changes needed.
