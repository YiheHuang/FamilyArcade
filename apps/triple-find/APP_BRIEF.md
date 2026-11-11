# Triple Find · 三连找

**Family Arcade game 17/27 · slug `triple-find` · dev port 5196**

A Set-like pattern-spotting game

## Rules to implement

A table of 12 cards, each with four attributes (colour, shape, fill, count). A set is three cards where every attribute is all-same or all-different. Find a set; the first caller scores. If nobody calls, add three cards. 2–4 players, 5 minutes.

## AI

Enumerates all sets; Easy slower, Normal human-paced, Hard instant, Companion waits a beat before calling.

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
