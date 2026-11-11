# Pair Up · 翻牌记忆

**Family Arcade game 11/27 · slug `pair-up` · dev port 5190**

A memory game with dessert tiles

## Rules to implement

A grid of face-down pairs. On your turn flip two tiles; a match stays open and scores, a miss turns back. Most pairs wins. 2–6 players, 4×4 or 6×6 deck.

## AI

Memory of seen cards; Easy forgets, Normal remembers own reveals, Hard remembers all, Companion occasionally “forgets” to give children a chance.

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
