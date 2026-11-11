# Color Chain · 颜色接龙

**Family Arcade game 13/27 · slug `color-chain` · dev port 5192**

An original colour-and-number shedding game

## Rules to implement

Original UNO-like deck: four colours, numbers 0–9, Skip, Reverse, Draw Two, Wild, Wild Draw Four. Match colour or number. First to empty their hand wins the round; others score the cards left in hand. First to 200 loses? No — lowest score wins the match. 2–6 players.

## AI

Colour-count and next-player threat; Hard samples, Companion avoids stacking draws on children.

## Non-negotiable deliverables

- Pure deterministic engine in `src/game/` with at least 20 unit tests.
- 4 AI levels (Companion / Easy / Normal / Hard), deterministic with injected RNG.
- Hot-seat + solo + LAN. Use `@family-arcade/lan` exactly like the Triple reference.
- Real zh/en UI, sound toggle, undo, hint, autosave/resume, local family record.
- Real screenshots in `docs/screenshots/{en,zh}` (1440×1000; mobile 780×1688).
- `docs/rules.md`, `docs/limitations.md`, `NOTICE.md`, `LICENSE`, bilingual READMEs.
- Update `video.json` with eight narration lines, facts, tagline and screenshots.
- `npm run check` green and `node scripts/e2e.mjs` passing (start `npm run dev` first).
- Keep the Tauri shell and `cargo build` working; do not remove LAN.
