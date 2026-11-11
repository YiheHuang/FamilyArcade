# Promo deliverables

| File | Spec | Notes |
| --- | --- | --- |
| `hue-garden-promo-zh.mp4` | 50.0 s · 1920×1080 · 60 fps · H.264/AAC · 7.9 MB | Chinese cut, audio-mastered |
| `hue-garden-promo-en.mp4` | 50.0 s · 1920×1080 · 60 fps · H.264/AAC · 7.9 MB | English cut, audio-mastered |
| `hue-garden-promo-zh.srt` | 7 cues | Chinese subtitles |
| `hue-garden-promo-en.srt` | 7 cues | English subtitles |
| `hue-garden-poster-zh.png` | 1920×1080 | Remotion `Still` poster, Chinese |
| `hue-garden-poster-en.png` | 1920×1080 | Remotion `Still` poster, English |
| `audio-check.json` | — | measured integrated loudness and true peak |

## Audio measurements

Measured with `ffmpeg -af loudnorm=I=-14:TP=-1:print_format=json`.

| Cut | Integrated | True peak | Master |
| --- | --- | --- | --- |
| Chinese | **−14.37 LUFS** | **−1.80 dBTP** | +7.8 dB → `alimiter=0.80` |
| English | **−14.11 LUFS** | **−1.90 dBTP** | +2.9 dB → `alimiter=0.80` |

Target: −14 LUFS ±1, true peak ≤ −1 dBTP. Both pass. The master step is
`video/scripts/master.mjs`; it is not a plain volume increase.

## Source project

`video/` is a Remotion 4 project. It uses real engine data
(`video/src/data/game.json`, 38 turns / 84 tiles / 162:160) and real Playwright
screenshots. Every claim is checked in `video/FACTS.md` (50 checks, 0 failures).
