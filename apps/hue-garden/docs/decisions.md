# Decisions and exceptions — Hue Garden v0.1

The family-game standard uses **MUST** / **SHOULD**. This page records every
unfinished MUST that a reviewer will notice, why it is not in v0.1, who it affects,
and the plan. No claim in the README or video contradicts these exceptions.

| Standard | Item | State | Why / impact | Plan |
| --- | --- | --- | --- | --- |
| P4 | Three modes (solo, hot-seat, LAN) | **Done** | Solo, 2–4 hot-seat and host/guest LAN with reconnect are implemented. | Spectator + AI caretaker later. |
| F1/F5 | ≤10 MB installer, Windows 10/11 | **Partial** | Tauri shell + shared relay are present; installer is built by the central release job, not committed. | Build `npx tauri build --bundles nsis`; clean-machine smoke test + signing. |
| A7 | 200-game AI calibration table | **Partial** | 200 games per pairing now exist, but targets are not met: Easy beats Companion ~72%, Hard only ~49% vs Normal. | Tune Companion/Hard, rerun 200, family playtest. |
| X9 | Colour-vision simulation screenshot | **Partial** | Every tile has shape + colour-seal letter; contrast is checked by eye. No simulation screenshot yet. | Add a `game-colorblind.png` capture with a deuteranopia filter. |
| Q5/Q6 | LAN E2E / pixel-diff screenshot regression | **Partial** | `scripts/lan-e2e.mjs` covers host/guest/reconnect/offline; screenshots are not pixel-diffed in CI. | Add screenshot snapshots in CI. |
| M4 | Old-save migration | **Partial** | `deserialize` rejects unknown versions with a readable code; no migration function yet because v0.1 is the first save format. | Add a v1→v2 migration when the state shape changes. |
| N* | LAN/social standards | **Partial** | Room code/QR, host authority, reconnect and offline seat status ship. No spectator, AI caretaker, host migration or nearby-room discovery. | v0.2 social layer. |

## Deliberate house rules

These are choices, not bugs; they are documented in `docs/rules.md` and the in-app
rules screen:

1. The opening line must cover `(0,0)`.
2. A new tile may not be inserted between two existing tiles; add to an end.
3. A player may pass only when no line fits and the bag is empty.
4. Swapped tiles go to the bottom of the bag, not a reshuffle, so replay remains
   deterministic.
5. A shared first place is allowed if points, blooms and hand size all tie.

## Deliberate scope cuts

- No 5+ player mode, campaign, daily quests, achievements, shop or skins.
- No avatars, accounts, cloud sync, matchmaking, public leaderboards or analytics.
- No third-party art/font/audio. Tiles are SVG; audio is synthesized; narration is
  generated for this project.
- No 4K/long-form video render in the parallel build pass; the Remotion project and
  two 50 s cuts (Chinese and English, both audio-mastered) are the deliverable.
