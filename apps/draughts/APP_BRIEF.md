# Draughts · 国际跳棋

**Family Arcade game 4/27 · slug `draughts` · dev port 5183**

English draughts on an 8×8 board

## Rules to implement

English draughts: 12 men each on dark squares, diagonal forward moves, mandatory captures, kings move and capture backwards. Win by capturing all pieces or blocking the opponent. 2 players.

## AI

Easy random legal, Normal material + king safety, Hard alpha-beta 5-ply, Companion avoids multi-captures against children.

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
