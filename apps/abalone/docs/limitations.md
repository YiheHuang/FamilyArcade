# Abalone · known limitations (v0.1)

- **No repetition or draw rule.** Standard family Abalone ends when one side has
  pushed off six marbles. Two careful players can in principle circle forever; there
  is no threefold repetition, move limit or draw offer.
- **Six captures, not a literal line of six.** The brief's “6-in-a-row” shorthand is
  implemented as the standard objective: push six enemy marbles off the rim. A line of
  six own marbles is not a win condition; the starting formation already has
  six-marble rows.
- **Two players only.** Seat 0 is Black, seat 1 is White. There is no spectator seat
  and a second guest gets “room full”.
- **Hard is a beam search, not a solved opponent.** It searches two replies with a
  narrow candidate beam, plus a static evaluation for centre control, cohesion, edge
  danger and push lanes. It is strong for a family table and honest about its limits.
- **No tournament clock or scoring variants.** The record counts wins and streaks, not
  timed games, tournament points or official ratings.
- **Undo and hints are local only.** They are disabled on LAN games so the host's
  canonical state stays authoritative. There is no takeback negotiation.
- **LAN is local-subnet IPv4.** The four-digit room code keeps honest family members
  apart; it is not encryption or authentication against a determined attacker on the
  same network. There is no internet matchmaking, cloud relay or account system.
- **No reconnect handshake.** If a guest socket closes, the host sees them as offline
  and the guest must rejoin with the invite link. A finished LAN game can be restarted
  by the host.
- **Browser LAN needs the shared relay.** In the browser build, `npm run lan` serves
  the built guest page and WebSocket relay on port 8080. The Tauri desktop shell embeds
  the shared Rust relay; no Node process is needed there.
- **The installer is unsigned.** The Tauri NSIS build is produced by the central build
  agent and is not code-signed, so Windows SmartScreen may warn.
- **Screenshots are browser captures.** Desktop images are 1440×1000 and mobile images
  are 780×1688 (390×844 at 2×). They are real Playwright captures, not mockups.
- **No remote assets.** There are no CDN fonts, downloaded images, third-party sounds
  or external services. All board and marble art is CSS.
