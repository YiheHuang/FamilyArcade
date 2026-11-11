# Sowing · 播棋

**Family Arcade game 7/27 · slug `sowing` · dev port 5186**

Mancala sowing and capturing

## Rules to implement

Two rows of six pits plus a store. On your turn take all stones from one of your pits and sow them one per pit counter-clockwise. Landing in your store grants another turn; landing in an empty pit captures that stone plus the opposite pit. Game ends when one row is empty; most stones wins. 2 players.

## AI

Extra-turn and capture evaluation; Hard 8-ply, Normal 3-ply, Companion favours simple moves.

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
