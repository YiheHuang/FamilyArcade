# Race Home · 飞行棋

**Family Arcade game 9/27 · slug `race-home` · dev port 5188**

A four-colour race around the house

## Rules to implement

Original Ludo-like race: 2–4 players, four pawns each, roll one die. A 6 leaves home and grants another roll. Pawns race around a shared ring into their colour lane. Landing on an opponent sends it home. First to bring all four pawns home wins.

## AI

Priority to entering home, then safe progress; Easy random, Normal greedy, Hard one-ply, Companion avoids sending children home.

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
