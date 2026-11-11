# FACTS — Five Dice · 五骰 promo

> Generated from `video.json`, the test suite and the real screenshots. A FAIL blocks
> publication. Render command: `cd video && npm run render -- --only=five-dice`.

| Claim | Source | Status |
| --- | --- | --- |
| 2–4 players · 20 minutes · ages 6+ | `video.json` + app setup | PASS |
| 5 dice · 3 rolls<br>13 scoring boxes<br>4 AI levels<br>Hot-seat + LAN | `video.json`, `src/game/`, `docs/rules.md` | PASS (test suite) |
| 45 s · 1920×1080 · 60 fps · H.264/AAC | `src/theme.ts`, `src/Root.tsx` | PASS |
| EN + ZH narration (8 lines each) | `video.json`; Edge TTS clips | PASS |
| Real screenshots, not mockups | `docs/screenshots/{en,zh}` | PASS |
| LAN host/guest, phone joins from browser | `src/App.tsx`, `packages/lan` | PASS (LAN E2E) |
| No installer or LAN claim beyond v0.1 | `docs/limitations.md` | PASS (honest) |

**Failures:** none for the current cut.
