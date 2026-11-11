# Postmortem · Sweet Carousel v0.1

## What shipped

- A complete 2–5 player hot-seat game with a real privacy cover, a solo mode with four AI levels, three-round scoring, crowns and tie-breaks.
- A pure deterministic engine with seeded deals, versioned saves, invariants, 45 unit/integration tests and 120 simulated games.
- Autosave/resume, undo, hints, local stats, JSON export and a round-by-round review.
- Complete zh/en UI, real screenshots in both languages, a rule audit and a bilingual README.
- A real LAN host/guest table using the shared `@family-arcade/lan` relay: room code, QR, seat status, host-authoritative intents, per-seat filtered views and reconnect.
- A real Remotion promo: two 48.5 s cuts (EN/ZH), Edge TTS voice, original synth bed, SRTs, posters and all-PASS FACTS.

## What was cut or deferred

- LAN spectator, UDP room discovery and AI takeover. Core host/guest and reconnect are shipped.
- Tauri installer build. The shell is configured; the central release job builds the NSIS package.
- Full move-by-move replay. The engine has `replay()` and tests; the UI review lists records instead of re-applying moves.
- 4K, vertical/social cuts and a second 30 s edit.
- Physical-phone testing; mobile was verified in Chrome device emulation.

## AI calibration

The final 2-player 400-game harness landed inside target:

| Matchup | Result | Target |
| --- | --- | --- |
| Hard vs Normal | 64.8% | 60–70% |
| Normal vs Easy | 60.3% | 60–70% |
| Easy vs Companion | 62.7% | 55–65% |

The first iterations had Hard losing to Normal because the evaluator over-weighted speculative hand potential. The fix was a sampled hidden-hand rollout for Hard/Normal and a stricter separation of “what I keep” from “what I pass”. See `docs/ai-calibration.md`.

## Scoring calibration

Random play averaged **39.3** per seat across 1,400 simulated seats. The original sampler rule (three or more types) was too generous; requiring **exactly three leftover types** and raising the crown minimum to **6** brought typical totals into the 30–45 band. The exact table is in `docs/rules.md`.

## Video iterations

- Built a real Remotion project rather than a slideshow.
- Added EN and ZH Edge TTS narration, then re-timed scenes to avoid voice overlaps; final cut is 48.5 s.
- Mastered to −14.1 LUFS, true peaks −1.0/−1.5 dBTP, yuv420p/BT.709, both under 10 MB.
- The first master was full-range `yuvj420p`; re-encoded to `yuv420p` limited range with BT.709 metadata.

## Lessons for the next game

1. **Privacy needs a synchronous key, not an effect.** A boolean cover set in `useEffect` can leak a hand for one frame. The `round:pick:seat` uncovered key fixed it.
2. **Screen routing is part of the state machine.** The first full-game E2E got stuck on the round summary because `next-round` changed the engine phase but not the screen. Route after every commit.
3. **Calibrate the target, not the AI alone.** Scoring changes can invalidate an otherwise good AI ladder.
4. **Render early enough to catch audio/master issues.** The video render is fast enough at 1080p60 with two concurrencies; the slow part was discovering the voice path and loudness issues at the end.

## Next milestones

1. LAN spectator, nearby-room discovery and AI takeover for a disconnected seat.
2. Central Tauri NSIS build + clean Windows test; then update README with installer size and SmartScreen.
3. Replay screen that re-applies the move log; optional vertical promo cut.
