# Dou Dizhu · known limitations (v0.1)

- **One bidding table.** The app uses one round of 1/2/3/pass. Regional variants
  such as rob-landlord, call-landlord, double, insurance, “must bomb”, or a fourth
  bid are not offered. Three passes redeal and the first bidder rotates.
- **No optional reveal or surrender.** There is no “show my hand”, concede, or
  redeal-on-request button. A round ends only by a hand emptying.
- **Fixed scoring.** Stake uses base bid × bomb/rocket multiplier × spring. There is
  no running score between rounds, no cap, and no anti-spring. The family record
  counts rounds and best stake.
- **LAN needs two guests before the first deal.** The host can start only when both
  guest seats are connected. A guest that disconnects mid-round becomes an AI seat
  until the same device rejoins; a new device joins the next free seat instead of
  taking over the old one.
- **LAN is local-subnet IPv4 only.** The browser build needs `npm run lan` (or the
  desktop relay). There is no online matchmaking, spectator mode, chat, cloud save
  or remote play. A QR opened on `localhost` cannot reach a phone.
- **LAN results live on the host.** A LAN round is recorded on the host device only.
  Guest devices do not write a LAN record row.
- **Undo and hints pause in LAN.** This is deliberate: a review tool would leak
  information between seats. Solo and hot-seat keep both.
- **Hot-seat privacy is a curtain, not encryption.** The whole state necessarily
  lives in one browser tab; the UI covers hands between turns. A determined person
  with developer tools can inspect it. LAN is the private-device mode.
- **AI is heuristic.** Hard decomposes the shape, counts cards and times bombs, but
  it is not a tournament solver, does not search the full game tree, and can
  misplay. Companion deliberately avoids bombs and high cards.
- **Sound is synthesised.** There are no recorded samples or music; the toggle
  controls a small Web Audio cue.
- **Reduced motion follows the system.** The CSS honours
  `prefers-reduced-motion: reduce`; there is no separate in-app motion switch.
- **The browser build is the shipped artifact here.** The Tauri shell and shared
  LAN crate are present and unchanged, but no Tauri/cargo build was run in this
  environment; the central build agent produces installers.
- **Screenshots use one valid fixture.** The round-result screenshot is a complete,
  deterministic engine round rendered by the real app. Live solo, hot-seat, undo,
  autosave, keyboard and LAN flows are verified by `scripts/e2e.mjs` and
  `scripts/lan-e2e.mjs`.
- **No remote assets.** No CDN, downloaded fonts, third-party card art or audio
  samples. The card faces and table are CSS.
