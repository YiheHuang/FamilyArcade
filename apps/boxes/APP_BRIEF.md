# Boxes · 点格棋

**Family Arcade game 6/27 · slug `boxes` · dev port 5185**

Dots and boxes

## Rules to implement

A 6×6 grid of dots. Each turn draw one horizontal or vertical edge. Completing the fourth side of a box claims it and grants another turn. Most boxes wins. 2 players.

## AI

Chain/loop awareness; Easy random, Normal avoids the third side, Hard searches endgames, Companion gives away small chains.

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
