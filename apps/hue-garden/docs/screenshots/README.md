# Screenshots / 截图

All images are captured from the running Vite app with Playwright and system Chrome
(`channel: 'chrome'`), never from a mockup or Figma.

## Viewports

| Set | Viewport | Physical pixels | Notes |
| --- | --- | --- | --- |
| Desktop | 1440×1000, DPR 1 | 1440×1000 | fixed seed/game state; `?tutorial=0&lang=…` |
| Phone | 390×844, DPR 2 | 780×1688 | portrait, touch, mobile layout |
| Poster | Remotion `Still` 1920×1080 | 1920×1080 | `video/src/Poster.tsx` |

## Files

`docs/screenshots/{en,zh}/`

- `home.png` — home screen with decorative courtyard art.
- `setup.png` — 2–4 player setup.
- `game.png` — real mid-game from `docs/demo-state.{lang}.json`.
- `game-select.png` — rack selection + legal preview + score preview.
- `game-over.png` — final ranking from `docs/win-state.{lang}.json`.
- `rules.png` — five-line rules, shapes, seals and controls.
- `stats.png` — local stats and recent games.
- `settings.png` — language, sound, speed, reduced motion.
- `game-mobile.png` — portrait game layout.
- `home-mobile.png` — portrait home.
- `lan-host.png` — real LAN host lobby with room code, QR and both seats online.
- `lan-guest.png` — real guest waiting room (auto-joined from the QR URL).
- `replay.png` — optional replay capture.

Regenerate:

```bash
npm run dev
$env:LANG_CODE='en'; node scripts/shots.mjs
$env:LANG_CODE='zh'; node scripts/shots.mjs
node scripts/compress-shots.mjs   # palette PNG, keeps 1440×1000 / 780×1688
```

LAN screenshots need the built app + relay + dev host:

```bash
npm run build
npm run lan          # :8097
# another terminal:
npm run dev
$env:LANG_CODE='en'; node scripts/lan-shots.mjs
$env:LANG_CODE='zh'; node scripts/lan-shots.mjs
```

The E2E script uses the same real app and Chrome:

```bash
node scripts/e2e.mjs
```
