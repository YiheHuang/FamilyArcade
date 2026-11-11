# Decisions & standard exceptions — v0.1

The family-game standard has a few **MUST** items that this first vertical slice does not
meet. They are recorded here rather than hidden. Every one is either a deliberate scope
choice or a next-milestone item.

| Standard | Item | Decision | Why | Impact | Plan |
| --- | --- | --- | --- | --- | --- |
| P4 | Three modes: solo, hot-seat, LAN | Met in this pass: solo, 2–4 hot-seat, host-authoritative LAN with QR/code, seat status and guest reconnect. No LAN spectate/pause/undo yet. | The host applies all intents; guests only send moves. | Families can join from phones on the same Wi-Fi. | v0.2: spectate, pause, undo vote, AI caretaker. |
| F1/F5 | ≤10 MB installer, Windows 10/11 | The shared Tauri shell/config is retained; this app pass did not run `cargo`/`tauri build`. | The central release job owns installer builds. | No local `.exe`; use `npm run tauri dev` or the central installer. | Central release: Tauri v2, signed build, clean-machine test. |
| R7 | Ambiguities written down | Done for v0.1 in `docs/rules.md`: no farms, one field type, shared wins, discard house rule. | Family table needs one answer, not “either”. | None. | Keep the audit table current. |
| A7 | ≥200 self-play games per pairing | **Met:** 200 games/pairing at 40 ms/move. Companion 20% vs Easy, Easy 34% vs Normal, Normal 52% vs Hard. | The 40 ms budget is reproducible and the table is generated, not hand-edited. | Normal vs Hard is still within noise; no strength ordering claimed. | Tune Hard or run more games before release. |
| E9 | Branch coverage ≥90% | Not measured. | Vitest coverage adds a dependency and CI time; tests cover every rule/error path named in `docs/rules.md`. | Coverage number is unknown. | Add `@vitest/coverage-v8` in v0.2 and a threshold. |
| Q5 | LAN E2E | Implemented: `node scripts/lan-e2e.mjs` opens a host + guest, plays one tile each and reconnects the guest. | Host authority and intent path needed to be proven, not assumed. | Passing. | Keep it in release checks. |
| Q6 | Screenshot pixel regression | Screenshots are regenerated but not diffed against a baseline. | Visual polish changed daily in this pass. | A regression could slip through. | Store baseline PNGs and compare with a tolerance in v0.2. |
| S5 | Clean-Windows install test | Not applicable (no installer). | Browser v0.1. | — | v0.2 after installer. |
| V1/V8 | 45–60 s, 1080p60, two cuts, loudness | Previous-pass masters remain: both cuts 48 s, 1920×1080, 60 fps, −14.4/−14.1 LUFS, −1.47/−1.49 dBTP, ≤10 MB. The root studio now renders from `video.json`. | The monorepo owns the shared video pipeline. | Existing files in `docs/promo/`. | Re-render from root studio; optional QC pass. |
| D5 | LAN lobby/QR screenshot | Captured: `lan-host.png`, `lan-guest.png`, `lan-game.png` in both languages. | Real relay, QR and seat status. | README shows the live LAN lobby. | Regenerate with `npm run shots`. |

## Deliberate game-scope decisions

- **No farms/farmers.** A smaller coherent feature graph (city, road, monastery) is easier
  to teach and to test. Field edges still have to match, so the tile puzzle remains.
- **54 tiles, 15 types.** Compact set; no expansions. `data:verify` checks the whole set.
- **Discard** when a tile fits nowhere. This is a house rule that guarantees a legal game
  always ends, even if the draw is awkward.
- **Shared win** when score and completed features tie. No arbitrary seat tie-break.
- **Simple field topology.** A road does not split a field; this is consistent with no
  farms and documented in `docs/rules.md` / `docs/limitations.md`.

## Technical decisions

- The app save is `{version, config, moves}` and is replayed with the engine, not a state
  snapshot. This makes replay/undo/autosave share one path and catches illegal old moves.
- AI runs in a Worker with the public `GameView`; the bag order is removed at the view
  boundary. Hard samples public tile composition, not the hidden draw order.
- Companion has a dedicated `stealPenalty` and lower opponent weight; it is deliberately
  not a strong opponent.
- The video imports engine data and the theme token, but not UI components. It uses real
  screenshots for the app scenes and code-drawn tiles for the rules scenes.
