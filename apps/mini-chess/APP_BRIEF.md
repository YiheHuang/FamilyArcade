# Mini Chess · 迷你棋

**Family Arcade game 19/27 · slug `mini-chess` · dev port 5198**

Chess on a compact 5×6 board

## Rules to implement

Original 5×6 chess variant: standard pieces except no queens; pawns promote on the last rank. Check, checkmate and stalemate use standard rules. 2 players.

## AI

Material + piece-square tables; Hard alpha-beta depth 5 with quiescence, Normal depth 2, Easy random, Companion avoids early checks.

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
