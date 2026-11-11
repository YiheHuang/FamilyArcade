# Pair Up · known limitations (v0.1)

- **LAN is host-authoritative and same-subnet.** The relay runs on the host device;
  guests must reach its IPv4 address on the same Wi-Fi. No internet matchmaking,
  accounts or cloud rooms.
- **A disconnected guest stalls their turn.** The host keeps the authoritative state
  and reconnects are not automatic; the family can start a new deal or rejoin. There
  is no bot takeover for a missing phone.
- **All LAN seats must be connected before the deal.** The host cannot start with an
  empty chair, and a guest who joins after the deal must reload/join again.
- **Hints are for the device that owns the game.** LAN guests cannot request a hint
  because their view deliberately hides face-down values. Hints use the table's
  public reveal log, not a perfect private memory.
- **Solo uses one AI level for every AI seat.** Hot-seat supports 2–6 humans; solo is
  one human plus 1–5 AI. Per-seat AI difficulty is not exposed in the UI.
- **Ties are shared.** There is no “fewest misses” or sudden-death tie-break.
- **The tile faces are system emoji.** No art is downloaded, but emoji rendering
  differs slightly between Windows, macOS and Android.
- **No online leaderboard or sync.** The family record and autosave are local to one
  browser/device. Clearing site data clears them.
- **The Tauri build is unsigned.** A Windows SmartScreen warning is expected for this
  family build. The browser version remains the fastest way to try the game.
- **No promo video is generated in this repository.** `video.json` is the manifest for
  the central Family Arcade studio; this app ships real screenshots only.
- **The 4-digit room code is a family convenience.** It separates rooms on one relay
  and keeps honest players honest; it is not a security boundary.
