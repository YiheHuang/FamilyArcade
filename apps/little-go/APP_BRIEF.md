# Little Go · 小围棋

**Family Arcade game 18/27 · slug `little-go` · dev port 5197**

9×9 Go with simple territory scoring

## Rules to implement

9×9 Go. Black and White alternate placing stones; captures remove groups without liberties. Pass twice ends the game. Score = stones on board + surrounded empty territory; White gets 6.5 komi. No ko rule beyond “no immediate recapture”. 2 players.

## AI

Liberty/atari and influence heuristics; Hard 200 random playouts, Normal 30, Easy greedy, Companion plays away from children’s eyes.

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
