# Ladder Run · 蛇梯棋

**Family Arcade game 10/27 · slug `ladder-run` · dev port 5189**

Snakes and ladders for the whole family

## Rules to implement

2–4 players on a 10×10 numbered board. Roll a die and move; ladders climb, snakes slide. Exact roll needed to land on 100. First to 100 wins. No strategy — a family warm-up.

## AI

No decisions; AI rolls automatically. Difficulty changes flavour text only. Companion celebrates every player.

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
