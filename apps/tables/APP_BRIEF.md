# Tables · 双陆棋

**Family Arcade game 8/27 · slug `tables` · dev port 5187**

Backgammon with dice

## Rules to implement

Standard backgammon: 15 checkers each, roll two dice, move checkers toward home, bear off after all are home. Hitting a blot sends it to the bar. Doubling cube is omitted. 2 players.

## AI

Pip-count and blot safety; Easy random, Normal greedy, Hard samples dice, Companion avoids hitting children.

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
