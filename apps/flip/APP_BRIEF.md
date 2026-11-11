# Flip · 黑白棋

**Family Arcade game 3/27 · slug `flip` · dev port 5182**

Reversi on an 8×8 board

## Rules to implement

8×8 Reversi. Black moves first. A move must bracket at least one opponent disc; all bracketed discs flip. If a player has no legal move, turn passes. Game ends when neither can move; most discs wins.

## AI

Corner/edge weights, mobility, frontier; Hard searches 4 plies. Companion avoids taking all corners early.

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
