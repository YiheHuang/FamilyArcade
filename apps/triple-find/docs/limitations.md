# Triple Find · known limitations (v0.1)

Honest notes for the family table and for the next build.

## Game rules and pace

- **Fixed five-minute game.** There is no 3/8-minute selector. The clock is
  wall-clock time in the app; the pure engine itself has no clock.
- **The timer keeps running if the tab is hidden.** Leaving the game screen saves
  the remaining time, but switching tabs during a game does not pause it.
- **Hot-seat “first caller” is a shared-device convention.** Players tap their own
  name, then have 12 seconds to pick three cards. A wrong call is a 2.6-second
  rest, not a score penalty; this is deliberately gentle for children.
- **Solo has no call window.** The human can pick at any time; the AI calls on its
  own seeded timer. Hard is effectively instant (0.7–1.3 s), so it is a race, not
  a teaching opponent.
- **AI levels differ in pace, not insight.** Every level enumerates the whole
  table and always finds a real set. Companion waits 10–16 seconds, Easy 6–11,
  Normal 3–6, Hard 0.7–1.3. This matches the brief but is simpler than a
  human-like mistake model.
- **Only one AI timer runs at a time.** With multiple AI opponents, the earliest
  scheduled AI claims; the others wait for the next table. This keeps the race
  readable but means three Hard AIs do not all dive at once.
- **Undo rewinds the last found set**, including an AI claim. A fast AI may claim
  again immediately. Undo is disabled after the game finishes and in LAN games.

## Cards and table

- The deck is the full 81-card space of 3 colours × 3 shapes × 3 fills × 3
  counts. Shapes are pill, diamond and star (an original set of silhouettes, not
  the traditional oval/squiggle/diamond art).
- When a table has no set, three cards are added after a 1.9-second pause. The
  table can reach 15 or 18 cards. If the deck is empty and no set remains, the
  game ends with the dead cards still visible behind the result sheet.
- A table with a visible set never auto-deals; players must find it or the clock
  runs out.
- Cards are rendered with SVG and CSS. There are no bitmap assets, remote fonts or
  audio samples.

## Modes and LAN

- **2–4 players.** Solo is 1 human + 1–3 AI. Hot-seat is 2–4 humans on one
  screen. LAN rooms hold up to 4 humans.
- **LAN is local-subnet IPv4 only.** The relay does not do NAT traversal, TLS,
  matchmaking or internet play. The guest and host must be on the same Wi-Fi/LAN.
- **Join before the host starts.** There is no mid-game seat claim and no
  reconnect flow. A late joiner reaches the lobby but is not in the current
  round. The host can start a new round for everyone.
- **A closed host leaves the guest on its last view.** The shared relay has no
  reconnect handshake; leave the room and join a new one. This is a family-LAN
  convenience, not a resilient online game.
- **No spectators.** Every connected seat is a player. Disconnected seats remain
  in the score list for the current round.
- **Network latency decides very close races.** The host applies claims in
  arrival order and its clock is authoritative. The guest’s countdown interpolates
  between host views (sent every 2 s and after each claim), so it can differ by a
  few hundred milliseconds from the host display.
- **Browser relay default is port 8080.** If another app already uses it, start
  the relay on another port and open the host page with `?lanPort=PORT`. The QR
  invite uses that port. The normal Tauri installer starts its own relay.
- **Browser invites use the page hostname.** If you open the host on `localhost`,
  the QR says localhost and a phone cannot reach it. Open the host page through
  the laptop's LAN address (for example `http://192.168.1.20:5196`) first. The
  Tauri build gets the LAN URLs from the shared host process.
- **Room codes are 4 digits.** They keep honest family members out, not a
  determined attacker on the same LAN.

## Saving and records

- **Local only.** The current game and family record live in `localStorage` on
  this browser/device. There is no account, cloud sync or cross-device profile.
- **Autosave is periodic.** A claim saves immediately; the clock is also saved
  every 2.5 seconds. A hard browser crash can lose up to a couple of seconds.
- **Undo history is not saved.** Continuing a game after a reload keeps the table
  and score, but earlier states in the undo stack are gone.
- **LAN games are recorded only on the host device.** Guests do not write the
  host’s family record. Finished LAN games still count in the host’s local record.
- **Same names share a leaderboard row.** The family record keys players by the
  display name they used at the table.

## Packaging and promo

- **Local, unsigned Tauri NSIS build.** There is no code signing; Windows
  SmartScreen may warn. WebView2 uses the standard bootstrapper.
- **No promo video file in this app.** `video.json` is the manifest for the root
  Family Arcade studio (eight bilingual lines, facts, accent, three screenshots).
- **Screenshots are Chromium captures**, desktop 1440×1000 and mobile 780×1688
  (390×844 at 2×). They were generated by `scripts/shots.mjs` against the running
  app, with a real relay and a real guest for the LAN image.
- **No 4K or vertical promo cut.**

## Accessibility notes

- Every card and control is a button; the game has a keyboard path (`H`, `U`,
  `1–9`, `Q/W/E/R`, `Esc`). Card buttons expose a bilingual `aria-label` with all
  four attributes.
- Color is never the only clue: shape, fill and count are also drawn. Players who
  cannot distinguish the three hues can still use the shapes, patterns and counts.
- `prefers-reduced-motion` disables the hint pulse, shakes and transitions.
- Sound is optional and synthesized with Web Audio; there is no background music.
