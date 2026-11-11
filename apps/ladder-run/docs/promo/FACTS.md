# FACTS — Ladder Run · 蛇梯棋 promo

> Generated from `video.json`, the test suite and the real screenshots. A FAIL blocks
> publication. Render command: `cd video && npm run render -- --only=ladder-run`.

| Claim | Source | Status |
| --- | --- | --- |
| 2–4 players · 15 minutes · ages 5+ | `video.json` + app setup | PASS |
| 10 × 10 board<br>2–4 players<br>9 ladders · 11 snakes<br>4 AI companions<br>Hot-seat + LAN<br>Autosave + undo | `video.json`, `src/game/`, `docs/rules.md` | PASS (test suite) |
| 45 s · 1920×1080 · 60 fps · H.264/AAC | `src/theme.ts`, `src/Root.tsx` | PASS |
| EN + ZH narration (8 lines each) | `video.json`; Edge TTS clips | PASS |
| Real screenshots, not mockups | `docs/screenshots/{en,zh}` | PASS |
| LAN host/guest, phone joins from browser | `src/App.tsx`, `packages/lan` | PASS (LAN E2E) |
| No installer or LAN claim beyond v0.1 | `docs/limitations.md` | PASS (honest) |

**Failures:** none for the current cut.
