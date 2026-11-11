# Domino Line · 多米诺

**Family Arcade game 12/27 · slug `domino-line` · dev port 5191**

Block dominoes for 2–4 players

## Rules to implement

Double-six dominoes. Each player draws 7 (2 players) or 5 (3–4). Play a tile matching an open end. Draw from the boneyard if stuck. Round ends when someone plays all tiles or nobody can move; pip total of remaining tiles scores for the winner. First to 100 wins the match.

## AI

Hand counting and end control; Hard samples unseen tiles, Companion avoids blocking children.

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
