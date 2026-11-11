# Decisions and exceptions — v0.1

The family-game standard asks every unmet `MUST` to be recorded here with reason, impact, mitigation, and a target. This is that page for the v0.1 vertical slice.

| Standard clause | Exception | Reason | Impact | Mitigation / target |
| --- | --- | --- | --- | --- |
| P4 / N-series: LAN as third mode | LAN host/guest implemented; **spectator and AI takeover are not** | Host-authoritative LAN, QR, room code, seat status, filtered guest views, reconnect, and host/guest E2E were prioritized. | A fifth device cannot watch; a dropped guest waits for reconnect instead of AI takeover. | `LanScreen` + `@family-arcade/lan`; host owns state; docs/limitations says spectator is next. Target: read-only spectator and 12 s AI takeover. |
| F5 / S3: Windows installer | Tauri shell configured; no binary shipped | The monorepo builds installers centrally; this app must not run cargo/tauri build in parallel. | No `.exe` or signed artifact in this workspace. | `src-tauri/` uses the shared relay, NSIS, per-user install; README gives `npm run tauri build`, SmartScreen and firewall notes. |
| M1: last ten games | Only the current finished rally is replayable | Stats are aggregate; move-log archive was deprioritized behind the playable loop. | Cannot pick an older game from a list. | Current rally replay is real and engine-driven; `docs/limitations.md` says so. Target: store last ten move logs. |
| A7: 200-game calibration target | 200 games per matchup run; **Hard/Normal miss 60–70%** | The support rule is non-exclusive: with identical public information the best balloon is often the same, so level differences are small. | Measured: Hard 53.1% vs Normal, Normal 50.6% vs Easy, Easy 64.7% vs Companion. The first two are outside the target band. | `npm run ai:calibrate`; full 200-game table in `docs/ai-calibration.md`; limitations explains the design cause. Target: rule/eval change, not more samples. |
| P2: 2–4 as primary | 2–6 supported; layout tuned 2–4 | The brief explicitly asked for 2–6 with clear scaling. | Six-seat rows are denser; setup/support work. | Engine 2–6 tests, 6-seat AI test; README says 2–4 is the sweet spot. |
| R7: final +5 interpretation | +5 goes to **round-4** supporters of overall leader(s) | The brief does not define whether earlier supporters are paid again; final-round support keeps the last round dramatic and avoids double-dipping. | A player who backed the eventual leader early but switched in round 4 does not get the +5. | Written in rules, README, rules audit, and in-game `game.overallNote`. |
| M5: replay by re-applying moves in UI | UI replay walks stored round history; engine `replay()` is tested separately | A round-history view is simpler for a 4-round party game and still uses the engine's real records. | A future rules change could make an old UI replay differ from engine replay. | `tests/engine.test.ts` and `tests/simulation.test.ts` verify engine `replay()`; save version is checked. Target: use `replay()` as the single replay source. |

## Resolved in the final pass

- **LAN host/guest (P4):** host-authoritative room, QR + room code, seat status, per-seat filtered views, guest reconnect, and browser/Tauri relay detection are implemented. The LAN E2E checks host authority, hidden frames, reconnect, and host-only advance.
- **Video language cuts (V1):** both English and Chinese MP4s are rendered and included in `docs/promo/`.
- **Video loudness (V6/V8):** both cuts carry bilingual synthetic narration and are mastered with ffmpeg two-pass loudnorm + limiter to −14.05 / −14.08 LUFS with true peaks −1.42 / −1.49 dBTP. Measurements are in `docs/promo/audio-report.json`.
- **Synthetic voice caveat:** narration is Microsoft Edge TTS, not a human performance. This is recorded in `docs/limitations.md` and `NOTICE.md`.

## Deliberate non-goals

- Accounts, cloud sync, telemetry, leaderboards, daily streaks, stores, skins.
- 5+ player campaign modes, achievements, monetization.
- Any publisher's name, art, card text, or trade dress. All expression is original.
- Any real-currency or casino metaphor.
