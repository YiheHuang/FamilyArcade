# Blokus promo — two cuts · 48 s · 1920×1080 · 60 fps

A quiet, typographic promo for the family Blokus app: paper, four player
colours and the real game engine — plus an original score and a short, warm
male narration in Chinese and English.

- **Duration** 48.0 s · 2880 frames each
- **Format** 1920×1080, 60 fps, H.264 / AAC, faststart
- **Cuts** `BlokusPromoZH` (中文) and `BlokusPromoEN` (English)
- **Sound** original 80 BPM felt-piano score + seven narration lines + soft SFX
- **Accuracy** every number and rule comes from the app: `FACTS.md`

## Design language

- Paper `#faf7f2`, ink `#1f1d1a`, faint ink `#8d867c`, hairlines `#e3dcd1`
- Player colours `#4e6e9e` / `#c9a24b` / `#b0604a` / `#6f9273`, imported from
  `src/ui/theme.ts` (never copied by hand)
- Colour-blind marks (dot / plus / ring / slash) reproduced from `src/ui/marks.ts`
- Type: Noto Serif SC 600 (headlines), Noto Sans SC 400/500 (labels, numbers),
  subsetted to the glyphs of both languages (~88 KB total)
- Safe area 160 px sides / 120 px top-bottom; headlines 60–200 px, body 30–44 px
- Motion: only `useCurrentFrame()` + `interpolate()`; slow-out easing; 12-frame
  crossfades only where the layout is continuous (title→rules, game→score);
  hard cuts elsewhere so no two scenes ever double-expose; no CSS transitions

## Storyboard (Chinese cut)

| # | Time | Frames | Picture | Copy | Sound |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.0–3.6 | 216 | Paper, a whisper of the board grid; four player marks at the safe-area corners | **Blokus** · 角斗士棋 · 为家人做的桌面棋盘 | score in, one soft tick |
| 2 | 3.6–12.8 | 564 | Board (20×20) with the three opening rules played out: corner piece + ring; diagonal contact + hairline annotation; an illegal edge-touching ghost struck through | 规则，只要三句话<br>01 起手 — 第一块，盖住自己的角落。<br>02 相接 — 之后，每块都要和自己的棋子对角相接。<br>03 边界 — 不能边贴边。<br>（贴着对手，可以。） | two plucks, a low thud for the illegal one |
| 3 | 12.8–23.6 | 648 | The real engine plays a 22-move game (four corners pre-placed), one move every 28 frames; running score panel with 蓝 / 黄 / 红 / 绿 | 真实对局 · 一局真实的棋。· 四人同盘，一人一角。 | 18 placement ticks, pitch per seat |
| 4 | 23.4–28.8 | 324 | The finished board dims; two large numbers | 分数，很简单。 ＋15 放完全部 21 块 · ＋20 最后一块是单格块 · 每格 1 分 · 放不下就跳过 | two dings |
| 5 | 28.8–36.4 | 456 | Three real UI screenshots in clean cards (Chinese UI) | 三种玩法，一张桌子。<br>单人训练 · 本地对战 · 局域网对战 | three light ticks |
| 6 | 36.4–41.6 | 312 | Two editorial rows with hairlines | 小细节，不扫兴。 暂停 · 观战 | two paper ticks |
| 7 | 41.6–48.0 | 384 | Wordmark, four marks, facts — all centred | Blokus 角斗士棋 · Windows 10/11 · 离线运行 · 无账号无广告 | closing chime, score out |

## English cut

The same visuals and timing; copy and stills swap through `useCopy()` /
`shots/en`. Card screenshots are the English UI.

| # | Copy |
| --- | --- |
| 1 | **Blokus** · FOUR CORNERS · a board game for the family table |
| 2 | Three rules. That is it.<br>01 Start — Your first piece covers your corner.<br>02 Connect — After that, connect corner to corner.<br>03 Edges — Never edge to edge. (Touching your opponents is fine.) |
| 3 | A REAL GAME · A real game. · Four players, one corner each. Scores: Blue / Yellow / Red / Green |
| 4 | Scoring is simple. +15 Place all 21 pieces · +20 Ending with the monomino · 1 point per square · No move? Pass — everyone passing ends the game. |
| 5 | MODES · Three ways to play.<br>Solo practice · Play the AI — three levels / hints and undo<br>Hot-seat · 2–4 players sharing one screen<br>LAN play · Join from a browser / phones scan a QR code |
| 6 | DETAILS · The small things. Pause · the host stops the clock for everyone. Spectate · a fifth phone can just watch |
| 7 | Blokus · A FAMILY BOARD GAME · Windows 10/11 · offline · no accounts, no ads |

## Narration

Male neural voices (Edge TTS), −6% rate; timings are measured with ffprobe and
validated so a line can never run into the next beat.

### Chinese — `zh-CN-YunxiNeural`

| At | Line |
| --- | --- |
| 1.2 s | 周末晚上，来一局角斗士棋。 |
| 5.4 s | 规则只有三条：盖住角落，对角相连，不要边贴边。 |
| 14.6 s | 四个人，一人一角，每一步都在抢地盘。 |
| 24.2 s | 放完全部棋子，还有额外奖励。 |
| 29.6 s | 一个人练，一家人同屏，或者手机扫码联机。 |
| 36.9 s | 暂停、观战，也都替你想好了。 |
| 42.6 s | 离线运行，没有广告，数据只留在家里。 |

### English — `en-US-AndrewNeural`

| At | Line |
| --- | --- |
| 1.2 s | Weekend night. One more game. |
| 5.4 s | Three rules: cover your corner, connect corner to corner, and never edge to edge. |
| 14.6 s | Four players, one corner each. Every move claims a little more board. |
| 24.2 s | Place all twenty-one pieces for a bonus. |
| 29.6 s | Play solo, share one screen, or join from a phone with a QR code. |
| 36.9 s | Pause the table, or let a fifth phone watch. |
| 42.6 s | Offline, no ads. Your data stays home. |

Swap a voice with `node scripts/gen-voice.mjs zh` (or `en`) after editing the
`LANGS` table; the timing table and the mix adapt automatically.

## Why each claim is true

See [`FACTS.md`](./FACTS.md). In short:

- Board, pieces, scores, legal moves: the **real TypeScript engine** imported
  from `../src` — the same module the app runs.
- The 22-move game and the rule demo are generated once and re-validated with
  `Game.tryApply()` / `Game.illegalReason()`; the video replays them.
- Mode names, descriptions and colour names are checked against `src/i18n.ts`
  in both languages.
- The screenshots are captured from the packaged desktop app itself (Chinese and
  English UI, 1500×1025).

## Audio

Three layers:

1. **Score** — `scripts/gen-bgm.mjs`: 48.0 s at 80 BPM in 16 bars; sparse
   felt-piano pattern, warm pad, soft bass, small room reverb. Peak ≈ −11 dBFS;
   played at 0.62 and **ducked to 0.24 under the voice**.
2. **Narration** — `scripts/gen-voice.mjs` (both languages, see above).
3. **Sound effects** — `scripts/gen-audio.mjs`: placement plucks, a rejection
   thud, two score dings and a closing chime, mixed well below the voice.

The film still works with the sound off: every spoken idea is on screen.

## Build

```bash
cd video
npm install
npm run gen                      # game + sfx + score + fonts
npm run voice                    # both narrations (needs python -m pip install edge-tts)
npm run facts                    # accuracy gate → FACTS.md
npm run shots                    # Chinese UI stills (needs the built desktop app)
COMP=BlokusPromoEN npm run stills  # key frames for the English cut
npx remotion studio              # preview both cuts, SoundCheckZH/EN for levels
npm run render                   # out/blokus-promo-zh.mp4
npm run render:en                # out/blokus-promo-en.mp4
```
