# Balloon Rally — 45 s promo script

**Format:** 1920×1080, 60 fps, H.264/AAC, 45.1 s. Two Remotion compositions: `BalloonRallyPromoEN` and `BalloonRallyPromoZH` (same seven-beat timeline, localized copy and narration).

**Status:** both cuts rendered and mastered.
- [`balloon-rally-promo-en.mp4`](../docs/promo/balloon-rally-promo-en.mp4) — 7.09 MB, −14.05 LUFS, −1.42 dBTP.
- [`balloon-rally-promo-zh.mp4`](../docs/promo/balloon-rally-promo-zh.mp4) — 6.98 MB, −14.08 LUFS, −1.49 dBTP.
- Bilingual synthetic narration via Microsoft Edge TTS plus an original procedural music bed. Voice files are in `video/public/audio/voice/`.
- SRT and posters: [EN SRT](../docs/promo/balloon-rally-promo-en.srt), [ZH SRT](../docs/promo/balloon-rally-promo-zh.srt), [EN poster](../docs/promo/balloon-rally-poster-en.png), [ZH poster](../docs/promo/balloon-rally-poster-zh.png).

## Seven beats

| Time | Beat | Real visual | On-screen copy (EN / ZH) | Narration (EN / ZH) |
| --- | --- | --- | --- | --- |
| 0–5 s | 1. Hook | Code-drawn five balloons rise over the paper valley; no fake UI | Five paper balloons. Four rounds of wind. / 五只纸气球，四轮风。 | “Five paper balloons. Four rounds of wind.” / “五只纸气球，四轮风。” |
| 5–8 s | 2. Title | Wordmark card with all five balloon patterns | Pick a balloon. Ride the wind. / 看准一只气球，跟着它飞。 | “Pick one. Ride the wind.” / “看准一只，跟着它飞。” |
| 8–17 s | 3. Three rules | Real `game-select.png` screenshot from the app; three rule lines animate in | Secret support · Tailwind +1 · One wind card each / 秘密支持 · 顺风 +1 · 各翻一张风卡 | “Back a balloon in secret.” · “Two tailwinds add one space.” · “Five wind cards decide the race.” / “每轮秘密支持一只气球。” · “两枚顺风，可以多推一格。” · “五张风卡，决定风向。” |
| 17–27 s | 4. Real core round | Real `game.png` screenshot, dimmed; real engine wind cards and final scores from `game.json` | A real round. / 一局真实的比赛。 | “Leader scores three. Second scores one. After four rounds, the overall leader pays five.” / 中文对应句 |
| 27–33 s | 5. Modes | Two mode cards plus real portrait `game-mobile.png` in a phone frame | Solo with AI · Hot-seat 2–6 · LAN next milestone / 单人四档 AI · 2–6 人同屏 · 局域网下一里程碑 | “Solo against four AI levels, or two to six on one screen.” / “单人四档 AI，或 2–6 人同屏传递。” |
| 33–39 s | 6. Details | Real `stats.png` card and a four-item accessibility list | Privacy cover · Autosave & resume · Replay & family stats · Keyboard & reduced motion / 隐私遮罩 · 自动保存与继续 · 复盘与家庭战绩 · 键盘与减少动效 | “Picks stay secret. Autosave, replay, stats, and mobile are built in.” / “遮罩守住秘密；自动保存、复盘、战绩与手机布局都有。” |
| 39–45 s | 7. End | Five balloons rise; facts pills; tagline | 2–6 players · 20–25 min · Ages 8+ · Offline / 2–6 人 · 20–25 分钟 · 8 岁+ · 离线可玩 | “Balloon Rally. Five balloons. Four winds.” / “气球大赛：五只气球，四轮风，全桌一起猜。” |

## Narration timing (same as SRT)

| # | In | Out | English | Chinese |
| --- | --- | --- | --- | --- |
| 1 | 0.40 | 4.85 | Five paper balloons. Four rounds of wind. | 五只纸气球，四轮风。 |
| 2 | 5.15 | 8.38 | Pick one. Ride the wind. | 看准一只，跟着它飞。 |
| 3 | 8.50 | 11.08 | Back a balloon in secret. | 每轮秘密支持一只气球。 |
| 4 | 11.20 | 14.08 | Two tailwinds add one space. | 两枚顺风，可以多推一格。 |
| 5 | 14.20 | 17.33 | Five wind cards decide the race. | 五张风卡，决定风向。 |
| 6 | 17.50 | 25.60 | Leader scores three. Second scores one. After four rounds, the overall leader pays five. | 领先支持者得 3 分，第二得 1 分；四轮后，总领先再得 5 分。 |
| 7 | 27.50 | 32.53 | Solo against four AI levels, or two to six on one screen. | 单人四档 AI，或 2–6 人同屏传递。 |
| 8 | 33.10 | 39.38 | Picks stay secret. Autosave, replay, stats, and mobile are built in. | 遮罩守住秘密；自动保存、复盘、战绩与手机布局都有。 |
| 9 | 39.50 | 44.85 | Balloon Rally. Five balloons. Four winds. | 气球大赛：五只气球，四轮风，全桌一起猜。 |

SRT files: [`balloon-rally-promo-en.srt`](../docs/promo/balloon-rally-promo-en.srt), [`balloon-rally-promo-zh.srt`](../docs/promo/balloon-rally-promo-zh.srt).

## Audio

- `video/public/audio/bed.wav` — original procedural 45 s bed: soft chords, pentatonic plucks, low wind texture. No third-party samples.
- `chime.wav` at 5, 8, 17, 27, 33, 39 s; `wind.wav` at 14.6 and 17.4 s.
- Voice: `video/public/audio/voice/{en,zh}/line-1..9.mp3`, generated with Edge TTS (`en-US-AriaNeural`, `zh-CN-XiaoxiaoNeural`, rate +8%).
- `<Audio>` from `@remotion/media`; voice `<Sequence premountFor={30}>`; bed at 0.14, chimes 0.22–0.28, voice 1.0.
- Master: `video/scripts/master.mjs` uses two-pass ffmpeg `loudnorm=I=-14:TP=-1.5:LRA=11` plus `alimiter=limit=0.89`. Final measurements are stored in [`docs/promo/audio-report.json`](../docs/promo/audio-report.json).

## FACTS checked in this cut

| Claim | Source | Check |
| --- | --- | --- |
| 5 balloons, 20 spaces, 4 rounds, wind deck 1,2,2,3,3 | `data/course.json` | `video/scripts/facts.mjs` reads file |
| 2–6 players, four AI levels | `src/game/engine.ts`, `src/game/types.ts` | source guard + literal + tests |
| Real round data and final scores | `video/src/data/game.json` generated from `src/demo.ts` + `src/game/engine.ts` | seed `demo-1710`; winner Maya 19; scores 19/15/14/5 |
| 120 seeded full simulations | `tests/simulation.test.ts` | `seed <= 120` + invariants assertion |
| Screenshots are 1440×1000 and 780×1688 (390×844@2×) | `docs/screenshots/` | PNG header check |
| 45 s, 1920×1080, 60 fps | `video/src/theme.ts`, `video/src/Root.tsx` | constants + Composition registrations |
| Family-safe dictionary | `src/i18n.ts`, `tests/data.test.ts` | banned-word regex |
| Both MP4/SRT/poster files exist | `docs/promo/` | file existence check |
| Both mastered cuts are ~−14 LUFS and ≤ −1 dBTP | `docs/promo/audio-report.json` | loudnorm measurement |

Full generated report: [`video/FACTS.md`](FACTS.md).

## Build

```bash
cd video
npm install
npm run prep       # data, screenshots, audio, SRT, FACTS
npm run voice      # optional; requires edge-tts; committed voice files exist
npm run poster:en
npm run poster:zh
npm run render:en  # fresh bundle; writes out/balloon-rally-promo-en.mp4
npm run render:zh
npm run master     # loudnorm + limiter → docs/promo/*.mp4 + audio-report.json
```

Remotion rules followed: `<Composition>`, `<Sequence premountFor>`, `<Audio>` from `@remotion/media`, `<Img>` + `staticFile()`, frame-driven `interpolate()`/`spring()` only. No CSS transitions or animations in video components. Renders use `--bundle-cache=false` so newly generated voice assets are always picked up.
