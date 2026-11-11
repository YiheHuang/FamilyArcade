# Splendor promo — two cuts · 54 s · 1920×1080 · 60 fps

A quiet, precise promo for the family Splendor app: paper, gems, the real table —
plus an original synthesized score, soft sound effects and a short, warm male
narration in Chinese and English.

- **Duration** 54.0 s · 3240 frames each
- **Format** 1920×1080, 60 fps, H.264 / AAC, yuv420p
- **Cuts** `SplendorPromoZH` (中文) and `SplendorPromoEN` (English)
- **Sound** original 80 BPM felt-piano score + ten narration lines + soft SFX
- **Accuracy** every number and rule comes from the app: `FACTS.md`

## Design language

- Paper `#F2F4F7`, ink `#26303E`, amber `#C9932E`, hairlines `#E8EBF0`
- Gem colours and SVG artwork imported from `packages/client/src/ui/gems.tsx`
  (never copied by hand); card/noble anatomy follows the app
- Type: Noto Serif SC 600 (headlines), Noto Sans SC 400/500 (labels, subtitles);
  subsetted to the glyphs of both languages (~104 KB total)
- Safe area 96 px sides / 64 px top; subtitles live below y = 960
- Motion: only `useCurrentFrame()` + `interpolate()`; slow-out easing; hard cuts
  on the beat; no CSS transitions or Tailwind animation classes

## Storyboard (Chinese cut)

| # | Time | Frames | Picture | Copy | Sound |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.00–4.50 | 270 | A single emerald on near-black, a sparkle, then a bloom into paper | (subtitle only) | low whoosh, shimmer |
| 2 | 4.50–7.50 | 180 | Wordmark over a defocused table; six gems light up | Splendor · 璀璨宝石 · 家庭版 · 2–4 人 · 90 张卡 · 10 位贵族 | three soft chimes |
| 3 | 7.50–15.00 | 450 | Three rule cards: take gems / buy a card / reach 15; the third gets a “last round” chip | 规则，三件事 · 官方规则 · 90 张发展卡 · 10 位贵族 | three ticks, one accent |
| 4 | 15.00–21.00 | 360 | Close-up of the bank; three gems lift into the acting player's tray | 拿宝石 · 三色各一 · 同色两枚 · 每回合只做一件事 | three gem picks, a take |
| 5 | 21.00–30.00 | 540 | A real tier-3 card: cost 7 − discount 2 = 4 gems + 1 gold; the card joins the tableau, +4 prestige | 买卡 · 成本 / 折扣 / 支付 · 金币可当任意颜色 · 永久加成 | buy chime, card whoosh, score ding |
| 6 | 30.00–36.00 | 360 | A real noble tile; the black bonus fills the last requirement; the tile visits, +3 | 贵族 · 凑齐折扣 · 贵族到访 · +3 分 | noble bell, score ding |
| 7 | 36.00–45.00 | 540 | Four-player table; a phone scans the room QR and joins; live game | 一起玩 · 扫码加入 · 房间码 · 同一 Wi-Fi · 无需安装 | join chime, ticks |
| 8 | 45.00–50.25 | 315 | Three real UI cards: four AI levels / animation speed / replay | 细节 · 四档 AI · 更慢的节奏 · 每一步都可回看 | ticks, page whoosh |
| 9 | 50.25–54.00 | 225 | Wordmark, six gems, tagline, facts | Splendor · 家庭版 · 三分钟学会，一家人刚刚好 · Windows 10/11 · 安装包 3.6 MB · 无需账号 | closing chime |

## English cut

The same visuals and timing; the copy, narration, subtitles and UI stills swap
through `useCopy()` / `shots/en`.

| # | Copy |
| --- | --- |
| 2 | Splendor · FAMILY EDITION · 2–4 PLAYERS · 90 CARDS · 10 NOBLES |
| 3 | THREE THINGS · Take gems (three different, or two of one) · Buy a card (a permanent discount — and points) · Reach 15 (finish the round; highest score wins) · OFFICIAL RULES · 90 DEVELOPMENT CARDS · 10 NOBLES |
| 4 | TAKE GEMS · 3 different · 2 of one · One action per turn |
| 5 | BUY A CARD · COST / DISCOUNT / PAY · Gold is wild · PERMANENT BONUS |
| 6 | NOBLES · MATCH THE BONUSES · A NOBLE VISITS · +3 POINTS |
| 7 | PLAY TOGETHER · SCAN TO JOIN · ROOM CODE · JOINED · GAME ON · SAME WI-FI · NOTHING TO INSTALL |
| 8 | DETAILS · Four AI levels (Companion never targets kids) · A slower pace (animation speed is adjustable) · Every move kept (autosave · replay) |
| 9 | Three minutes to learn. One table for the family. · Windows 10/11 · 3.6 MB installer · No account |

## Narration

Male neural voices (Edge TTS), `-6%` rate; each line is generated separately and
measured with ffprobe. Timings are validated against the next beat, so a line can
never run into the next scene.

### Chinese — `zh-CN-YunxiNeural`

| At | Line |
| --- | --- |
| 0.65 s | 周末，四个人，一桌宝石。 |
| 4.70 s | 璀璨宝石，家庭版。 |
| 7.85 s | 规则很简单：拿宝石，买卡，先到十五分，打完最后一轮。 |
| 15.20 s | 每回合选一件事：拿宝石、买卡，或者预留。 |
| 21.40 s | 买下的卡会变成永久折扣，也会带来分数。 |
| 30.30 s | 凑齐贵族要的折扣，他会亲自到访，再加三分。 |
| 36.20 s | 四个人同屏；也可以各自用手机加入。 |
| 40.55 s | 局域网内，扫码入座，手机不用装。 |
| 45.35 s | 四档 AI，节奏更慢，走错了还能悔一步。 |
| 50.60 s | 今晚，来一局。 |

### English — `en-US-AndrewNeural`

| At | Line |
| --- | --- |
| 0.80 s | Weekend. Four people. One table of gems. |
| 4.90 s | Splendor — the family edition. |
| 7.90 s | The rules are simple: take gems, buy cards, reach fifteen points, then finish the round. |
| 15.40 s | On your turn, do one thing: take gems, buy a card, or reserve one. |
| 21.40 s | Every card you buy is a permanent discount — and points. |
| 30.30 s | Match a noble's bonuses and they visit you for three more points. |
| 36.30 s | Four players on one screen — or everyone joins from a phone. |
| 40.70 s | On your own network, scan and sit down. Nothing to install. |
| 45.30 s | Four AI levels, a slower pace, and an undo for the odd mistake. |
| 50.60 s | One more game tonight. |

The burned-in subtitles use exactly these strings (same JSON files); SRT
sidecars are written to `../docs/promo/`.

## Audio

Three layers, all generated here:

1. **Score** — `scripts/gen-bgm.mjs`: 54.0 s at 80 BPM (18 bars), sparse felt
   piano over a warm pad and soft bass, a music-box motif, small room reverb.
   Peak ≈ −11 dBFS; played at 0.50 and **ducked to 0.21 under the voice**.
2. **Narration** — `scripts/gen-voice.ts` (both languages, see above).
3. **Sound effects** — `scripts/gen-audio.mjs`: gem picks/take, buy, noble,
   join, score ding, ticks, a paper whoosh and the closing chime. Timbres follow
   the app's own Web Audio recipes (`packages/client/src/ui/sfx.ts`).

The raw mix is mastered once with `scripts/master.mjs` (ffmpeg):

```bash
node scripts/master.mjs zh    # out/…-raw.mp4 → out/splendor-promo-zh.mp4
node scripts/master.mjs en
```

It converts the Remotion full-range BT.601 frames to **BT.709 limited range**, then
applies a 2:1 voice compressor, +12 dB (+10.5 dB for English) and a −4 dB limiter,
AAC 160 kbps, faststart. Measured results: **−14.6 LUFS / −1.6 dBTP** (Chinese) and
**−13.6 LUFS / −3.3 dBTP** (English).

## Why each claim is true

See [`FACTS.md`](./FACTS.md). In short:

- 90 cards (40/30/20), 10 nobles, noble +3, the 15-point final round, bank sizes
  and the four AI levels come from the **real engine** and the app's i18n.
- The take / buy / noble moments are exported snapshots; the payment, score and
  noble visit are checked against the engine before the JSON is written.
- The table is presented as the family's hot-seat mode (four people); the four
  AI levels appear as a real UI screenshot in scene 8.
- The UI stills (`shots/{zh,en}`) are captured from the app running on the local
  server; the phone/QR stills use the same 4-player room names as the table.
- The installer size is read from the latest `Splendor-Setup-*.exe`.

## Build

```bash
cd video
npm install
npm run gen                      # game + SFX + score + fonts
npm run voice                    # both narrations (python -m pip install edge-tts)
npm run srt                      # subtitle sidecars
npm run facts                    # accuracy gate → FACTS.md
npm run shots                    # real UI stills (needs a built client + server)
npx remotion studio              # preview both cuts, SoundCheckZH/EN for levels
npm run render                   # out/splendor-promo-zh.mp4
npm run render:en                # out/splendor-promo-en.mp4
npm run verify out/splendor-promo-zh.mp4
```
