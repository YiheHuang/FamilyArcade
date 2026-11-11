# Hex · 六角棋

**Family Arcade game 20/27 · slug `hex` · dev port 5199**

The elegant connection game on a hex board

## Rules to implement

11×11 rhombus of hexagons. Red connects north to south; Blue connects west to east. Players alternate placing one stone. No captures, no draws. 2 players.

## AI

Shortest-path potential; Hard Monte Carlo/union-find search, Normal greedy, Easy random, Companion blocks gently.

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
