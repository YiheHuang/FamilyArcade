# Idiom Chain · known limitations

- **Shared dictionary, not every idiom.** The game accepts 680 bundled
  simplified-character idioms. A real but unlisted idiom is rejected, and
  traditional characters are not aliased. This is deliberate: the same list
  drives AI, hints, LAN validation and the family table.
- **Subjective frequency labels.** Rarity is a family-familiarity label (1–5),
  not a corpus statistic. 274 entries are marked rare (frequency ≤2) and score
  the +2 bonus.
- **Dead ends are real.** If no unused dictionary idiom can continue the chain,
  every remaining player must pass or time out. Strikes eventually produce a
  last-standing winner, possibly below 10 points. There is no automatic new
  chain or silent restart.
- **The UI starts seat 0.** Solo, hot-seat and LAN always open with the human /
  host / first hot-seat seat. The engine supports another first seat for tests
  and demos, but there is no table option to choose it.
- **AI is a heuristic, not a solver.** Hard values rare points, frequency,
  length and one reply ahead; it can still be trapped by a dictionary dead end
  or beaten by a human who knows a better continuation. Companion deliberately
  avoids rare words and dead ends when it can.
- **LAN is IPv4 on one subnet.** There is no online matchmaking, accounts,
  spectator mode, cloud record or late-seat takeover. The 4-digit code keeps
  honest family members out; it is not a security boundary.
- **Disconnected LAN guests keep their seat.** The host's authoritative timer
  records strikes and eventually eliminates them; there is no mid-game bot
  takeover. A guest can rejoin with the same browser token if the room is still
  open, but a new guest cannot take an AI-filled seat after the deal.
- **Guest timers are forecasts.** The host owns the timer. A guest countdown is
  a visual estimate and may differ by a few hundred milliseconds.
- **Hints in LAN are client-computed.** The guest device ranks the public
  dictionary candidates and sends the `usedHint` flag with the play intent; the
  host re-validates the play and applies the reset. No hidden information is
  involved.
- **No LAN undo.** Undo is disabled in network play to avoid rewinding another
  seat's turn. Local and solo undo uses snapshots; solo undo returns to the
  human's previous decision, including the AI replies that followed it.
- **Hot-seat cover is a handoff curtain.** Idiom chain has no secret hands or
  hidden cards, so the cover prevents accidental taps and gives the next player
  a clean start rather than hiding information. The timer pauses while covered.
- **Autosave and record are device-local.** They live in this browser or
  WebView's `localStorage`. A LAN result is recorded on the host device only;
  guests keep their own local record. There is no cloud sync.
- **Timer choices are discrete.** The UI offers 10, 15, 20 and 30 seconds. The
  engine accepts 5–120 seconds for tests, but there is no free-number input.
- **No promo video is rendered here.** `video.json` feeds the central Family
  Arcade studio; this app does not include a separate Remotion project.
- **No Tauri build was run.** The shared Tauri shell and the
  `family_arcade_lan_host` crate wiring are present and untouched; the central
  build agent builds installers. A local unsigned build would be unsigned and
  may trigger a Windows SmartScreen warning.
- **Browser QR caveat.** If the host page is opened on `localhost`, the QR link
  will also say `localhost` and will not reach a phone. Use the desktop build or
  the host machine's LAN address.
- **Screenshots are real captures.** The game, hint, result and record images
  come from played games in Chrome at 1440×1000; the phone images are
  390×844 @2× (780×1688). No mockup images are used.
