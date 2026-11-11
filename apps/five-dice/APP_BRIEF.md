# Five Dice · 五骰

**Family Arcade game 14/27 · slug `five-dice` · dev port 5193**

A Yahtzee-like dice table

## Rules to implement

Five dice, three rolls per turn, keep any dice between rolls. Fill one of 13 categories: ones–sixes, three/four of a kind, full house, small/large straight, five of a kind, chance. Bonus for upper-section 63. Highest total after 13 rounds wins. 2–4 players.

## AI

Expected-value per category; Easy greedily takes the biggest die, Normal uses a simple EV table, Hard computes exact keep probabilities, Companion takes a fun category.

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
