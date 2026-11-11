# Star Leap v0.1.0 — first playable slice

**Release date:** 2026-11-11

## What is in it

- 121-hole Chinese Checkers star; 2–4 players, ten marbles each.
- Step, jump and chain-jump moves; house rule: a marble that reaches its target
  triangle stays there.
- Four AI levels: Companion, Easy, Normal, Hard (Web Worker).
- Solo practice with hints and undo; 2–4 player hot-seat.
- Tutorial, five-line rules, controls table, keyboard path.
- Autosave after every move; Continue last game.
- Replay, last-ten game history, family stats, JSON export.
- Chinese + English UI; system language + manual toggle.
- Responsive phone layout; colour + shape marks; reduced motion; sound on/low/off.
- 48-second bilingual promo, built with Remotion from the real engine.

## Checks

- `npx tsc --noEmit` — pass.
- `npx vitest run` — 31 tests pass (board, engine, AI, full-game simulation).
- `npm run build` — pass.
- `node scripts/e2e.mjs` — solo AI reply, hot-seat move/undo, win dialog, stats,
  replay, last-ten history replay, mobile overflow, no console errors.
- `node scripts/shots.mjs` — real screenshots in `docs/screenshots/{en,zh}`.
- `npm --prefix video run facts` — 36 checks, 0 failed.
- `npx vite-node scripts/calibrate.ts` — 20-game self-play batches; see
  [`ai-calibration.md`](ai-calibration.md). Hard is defensive and often draws at
  the 300-move cap; this is a tuning baseline, not a strength claim.

## Known gaps

- Browser only; no Tauri installer yet.
- No LAN rooms yet (host/guest, reconnect, AI caretaker, spectate).
- AI calibration is preliminary.
- 2–4 players; no 6-player party mode.
- Saves/stats are local to the browser.

## Next

- v0.2: LAN + Tauri.
- v0.3: AI calibration table, family playtest pass, optional 6-player party mode.
