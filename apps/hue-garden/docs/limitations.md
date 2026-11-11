# Known limitations — Hue Garden v0.1

This is a deliberately small vertical slice. It is honest about what is **not**
here yet.

## Platform and distribution

- **Browser + Tauri shell.** The repo builds a static Vite app and includes a working
  Tauri v2 shell; the Windows installer is built by the central Family Arcade release job
  with `npx tauri build --bundles nsis`. No prebuilt `.exe` is committed here.
- **LAN is implemented** for 2–4 players: host + browser guests with a 4-digit room
  code, QR invite, per-seat `view`, host-authoritative intents, seat status and guest
  reconnect. Browser hosts need `npm run lan` (port 8097); the Tauri shell starts the
  same relay internally.
- **No accounts, cloud sync, leaderboards, telemetry or ads.** Everything stays in
  this browser's `localStorage`; LAN traffic stays on the local Wi-Fi.
- Tested mainly in Chrome (the screenshot/E2E scripts use system Chrome). Firefox
  and Safari are not part of the v0.1 acceptance run.
- No **spectator**, **AI caretaker** or **host migration** yet. The host closing or
  refreshing ends the room; guests can reconnect only while the host room lives.

## Rules and AI

- AI calibration now has **200 games per pairing** (600 games total) in
  [`docs/ai-calibration.md`](ai-calibration.md). It still does not meet the standard's
  ordering target: Easy beats Companion ~72%, Normal beats Easy ~60%, and Hard only
  reaches ~49% vs Normal. Hard/Normal tuning is the next task; the table is reported
  honestly rather than hidden.
- The AI only receives `view(state, seat)`: its own hand plus public counts. It does
  **not** read other hands or the bag contents. Hard uses a two-step plan over its
  own reachable board plus public five-line/bloom threats; it does not simulate an
  opponent's hidden hand. This is honest, but it is not a perfect-information solver.
- Companion deliberately ignores denial/threat weights and picks from a noisy
  top-three pool. It still plays to score; it simply does not target a child's line.
- The engine's hard cap is 500 turns. This is a safety net, not a normal ending.
- The first tile must cover the courtyard origin `(0,0)`; tiles may not be inserted
  between two existing tiles. These are documented house rules (see
  [`rules.md`](rules.md)), chosen for family-table clarity.
- 2–4 players only. There is no 5+ party mode.

## Experience

- Hot-seat privacy is physical: the rack is hidden in the data view for the acting
  seat, but everyone can see the screen. A “pass the screen” hand-off screen is not
  implemented yet.
- In LAN, the host sees the full state; each guest sees only its own rack. Guest undo
  is disabled (host authority); hints run locally on the guest view. LAN results are
  not added to the local family record.
- Undo is local and confirm-based. In solo it rewinds to the previous human decision;
  in hot-seat it rewinds one turn (or past AI replies); the LAN host can undo and
  broadcasts the replayed state. A finished game cannot be un-finished after stats
  are recorded.
- Replays are kept for the **last ten finished games**; stats export is JSON to the
  clipboard, not save-file import/export.
- Sound is a tiny Web Audio synth; there are no recorded assets. The game is fully
  playable with sound off.
- The board supports pan, zoom and auto-fit. There is no free rotation (the grid is
  orthogonal by design).
- Portrait phone layout is tested at 390×844@2x. Landscape phone and very small
  (≤320 px) screens are not part of the acceptance set.
- Reduced motion is respected via settings and the system media query; a dedicated
  colour-vision simulation screenshot is not yet generated (every tile carries a
  shape and a colour-seal letter, so colour is never the only channel).
- Chinese and English copy was written and reviewed in-repo, not by a professional
  localization vendor.

## Data and testing

- `localStorage` is the only persistence. Clearing site data loses saves, stats and
  recent games; there is no cloud backup. LAN games are intentionally not added to
  the family record.
- LAN uses the shared `@family-arcade/lan` client and `tools/lan-server.mjs`/Tauri
  `family-arcade-lan-host` relay. `scripts/lan-e2e.mjs` covers host/guest views, intents,
  reconnect and offline seat; it needs the dev server + relay running.
- The 120-game random simulation is in the test suite and runs locally; CI is not
  configured in this repo yet.
- Screenshots are palette-compressed PNGs for README weight. They are real Playwright
  captures at 1440×1000 (desktop) and 780×1688 physical pixels from 390×844@2x
  (phone), not mockups. LAN lobby captures are real two-page sessions over the relay.
- The promo is a real Remotion project, 50 s per cut. Both the Chinese and English
  cuts are rendered and audio-mastered; long-form/4K renders are not part of this
  pass and are not run in parallel with the game test suite.

## Accessibility

- Keyboard path, visible focus, 44 px touch targets, reduced motion and sound-off
  play are implemented.
- A formal WCAG audit, screen-reader testing with NVDA/VoiceOver, and a high-contrast
  theme are future work.
- The board's SVG groups expose legal cells as buttons with labels; very large boards
  are still visually dense on small screens.

## Next milestone

1. Tauri installer smoke test on a clean Windows machine + signing/SmartScreen note.
2. LAN spectator, AI caretaker and host migration; test 3–4 guests on real phones.
3. AI tuning from the 200-game calibration (especially Hard vs Normal) and a family
   playtest round.
4. Hand-off/privacy screen for hot-seat, plus a colour-vision simulation capture.
