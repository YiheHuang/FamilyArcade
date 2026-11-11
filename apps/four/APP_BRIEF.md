# Four · 四子棋

**Family Arcade game 2/27 · slug `four` · dev port 5181**

Four in a row on a seven-column board

## Rules to implement

7 columns × 6 rows. Drop a disc; it falls to the lowest empty cell. First to connect four horizontally, vertically or diagonally wins. A full board is a draw. 2 players.

## AI

Easy random, Normal 2-ply, Hard 5-ply alpha-beta, Companion blocks immediate threats but lets children win sometimes.

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
