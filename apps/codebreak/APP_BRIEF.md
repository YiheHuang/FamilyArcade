# Codebreak · 猜色

**Family Arcade game 16/27 · slug `codebreak` · dev port 5195**

Mastermind with coloured pegs

## Rules to implement

One player (or the AI) sets a secret 4-peg code from six colours, duplicates allowed. Each guess gets black pegs (right colour and place) and white pegs (right colour, wrong place). Crack it in 10 guesses. 2 players; the code is hidden on the setter’s device.

## AI

Knuth-style minimax for Hard, random consistent guesses for Easy, simple elimination for Normal, Companion gives an extra hint.

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
