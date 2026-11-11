# FACTS — Mini Chess · 迷你棋 promo

> Generated from `video.json`, the test suite and the real screenshots. A FAIL blocks
> publication. Render command: `cd video && npm run render -- --only=mini-chess`.

| Claim | Source | Status |
| --- | --- | --- |
| 2 players · 10 minutes · ages 6+ | `video.json` + app setup | PASS |
| 5×6 board · 10 pieces a side<br>No queens · promote to rook, bishop or knight<br>4 AI levels<br>Hot-seat + LAN<br>42 unit tests | `video.json`, `src/game/`, `docs/rules.md` | PASS (test suite) |
| 45 s · 1920×1080 · 60 fps · H.264/AAC | `src/theme.ts`, `src/Root.tsx` | PASS |
| EN + ZH narration (8 lines each) | `video.json`; Edge TTS clips | PASS |
| Real screenshots, not mockups | `docs/screenshots/{en,zh}` | PASS |
| LAN host/guest, phone joins from browser | `src/App.tsx`, `packages/lan` | PASS (LAN E2E) |
| No installer or LAN claim beyond v0.1 | `docs/limitations.md` | PASS (honest) |

**Failures:** none for the current cut.
