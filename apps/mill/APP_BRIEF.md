# Mill · 九子棋

**Family Arcade game 5/27 · slug `mill` · dev port 5184**

Nine men’s morris

## Rules to implement

Nine men’s morris: place 9 men, then move along lines. Three on a line forms a mill and removes an opponent man (not from a mill unless only mills remain). Win by reducing the opponent to 2 men or blocking all moves. 2 players.

## AI

Placement heuristics, mill threats, mobility; Hard 4-ply. Companion prefers safe moves and avoids repeated captures.

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
