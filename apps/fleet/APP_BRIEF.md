# Fleet · 海战棋

**Family Arcade game 15/27 · slug `fleet` · dev port 5194**

Battleship with a hidden fleet

## Rules to implement

Each player places a fleet (carrier 5, battleship 4, cruiser 3, submarine 3, destroyer 2) on a 10×10 grid, then alternates shots. Hit/miss/sunk feedback. First to sink the whole fleet wins. 2 players; LAN hides each fleet.

## AI

Hunt/target parity search; Easy random, Normal hunt-target, Hard probability density, Companion fires near children’s misses with a gentle pattern.

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
