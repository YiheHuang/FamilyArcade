# Domino Line · known limitations (v0.1)

- **Standard block dominoes only.** No spinner turns, muggins, all-fives, Sebastian
  or partnership scoring. A double is an ordinary tile on the line.
- **Free opening tile.** The first player may start with any tile; the highest-double
  opening convention is not enforced.
- **2–4 players, no teams.** Solo is one human plus 1–3 AI seats. Hot-seat and LAN
  support 2–4 human seats, but every seat plays for itself.
- **No online matchmaking, cloud saves or spectator mode.** LAN rooms are local
  IPv4 subnets only, and the host page/relay must stay open.
- **Room code is 4 digits.** It keeps honest family members out, not a determined
  attacker on the same LAN. The relay is a dumb message bus; the host validates all
  game actions.
- **Undo and hints are not available to LAN guests.** The host is authoritative and
  guests only hold their own view. Solo and hot-seat keep both comforts.
- **LAN games are not autosaved.** A host refresh ends the room; start a new room to
  play again. Solo and hot-seat resume from `localStorage`.
- **Record is device-local.** Matches are recorded on the device that finishes them
  (the host for LAN). Guests do not write a record. Clearing browser storage clears
  saves and the family record.
- **Hard is not a perfect solver.** It counts pips, keeps suits and samples unseen
  tiles to estimate replies. Companion deliberately plays gently and is not
  competitive.
- **Browser LAN needs a relay.** `npm run lan` supplies it; the Tauri shell starts one
  internally. In development, port 8080 may be busy — the app accepts
  `?lanPort=8147` on the host page when the relay runs elsewhere.
- **The shared dev relay is single-room.** `tools/lan-server.mjs` keeps one global
  `hostId`, so one relay process serves one host room at a time. Run one room per
  relay; this shared limitation was not edited in `packages/lan` or `tools/`.
- **No installer was built here.** Per the shared build brief, installers are built
  centrally. The Tauri shell and `npx tauri build --bundles nsis` path are preserved
  and type-checked from the frontend side.
- **Promo video is rendered by the root studio.** `video.json` is the manifest; this
  app does not ship a separate Remotion project. No 4K or vertical cut is produced
  here.
- **No third-party art, fonts, audio or downloaded assets.** Pips, tiles and the table
  are CSS; the only QR generation uses the local `qrcode` npm package.
- **LAN screenshot port.** The checked-in LAN screenshots were captured at
  `localhost:8147` because port 8080 was occupied by another app during the shared
  build; the normal command still uses 8080.
