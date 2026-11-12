# Zheng Shangyou · limitations

This is an honest list of the choices and gaps in this build. The engine and all
tests are in the app; nothing here is hidden in the UI.

## Rules and table choices

- **No jokers.** The deck is exactly 52 cards. There is no rocket, no joker bomb
  and no wildcard play.
- **Combination set.** Only single, pair, triple, triple + single, triple + pair,
  straight of five or more, consecutive pairs of three or more, and a four-card
  bomb are implemented. Airplanes, four + two, four + two pairs, and other regional
  shapes are not.
- **Roads stop at the ace.** Both straights and consecutive pairs run 3 through
  Ace. A 2 may appear in singles, pairs, triples and as a kicker, but never in a
  road.
- **Strict climbing.** A follower must be strictly higher. An equal rank does not
  beat the table, unlike some friendly variants that allow “same or higher”.
- **Two passes, literally.** Two consecutive passes clear the trick even at five or
  six seats, as specified by the delivery brief. The app does not require every
  other player to pass first.
- **No pass lock-out.** Because the pass rule is the two-consecutive-pass variant,
  the engine keeps only a pass counter. A player who passed earlier can act again
  if somebody else plays before the second consecutive pass. Some families lock a
  passer out until the trick clears; that is a different table rule.
- **3♣ every deal.** The holder of 3♣ leads the first trick of every deal and must
  include it. The app does not switch to “winner leads” after the first deal.
- **Bombs are exactly four cards.** There are no five-card bombs, straight flushes
  or joker bombs.

## Scoring

- **Fixed zero-sum tables.** Four seats use +3 / +1 / −1 / −3. The other tables use
  +3 / 0 / −3 at three seats, +3 / +1 / 0 / −1 / −3 at five, and
  +3 / +2 / +1 / −1 / −2 / −3 at six. There is no configurable score table.
- **No match target.** The app shows the current round points and a running local
  total. It does not stop at a target score or promote/demote seats.
- **Local totals only.** The family record accumulates on the device that finishes
  the round. A LAN guest does not duplicate the host's record.

## Tribute

- **The given card is forced.** The downstream player automatically gives their
  highest card (rank first, suit as a deterministic tie-break). The giver cannot
  choose a different card in this build.
- **The return is manual for a human.** The receiver sees their own hand and chooses
  any card. An AI receiver uses the same low-singleton heuristic as the hint. In
  LAN play a remote receiver gets a private return prompt.
- **One or two pairs.** Three- and four-seat tables pay one tribute (last→first).
  Five- and six-seat tables pay two (last→first, second-last→second). The app does
  not support the alternative “both bottom players pay the same upstream” reading.
- **Tribute can be switched off.** This is a family-table option at setup; it is on
  by default.

## Modes and privacy

- **3–6 seats only.** There is no two-player duel and no seven-player table.
- **LAN guests plus AI.** The host can invite several guests up to the table size;
  empty seats are filled by AI. A guest who joins after the deal may take over an
  AI seat, but a seat already held by a human is never taken.
- **No spectator mode.** Every connected client is a player.
- **LAN scope.** The browser relay is IPv4 on the same subnet. Phone guests need the
  host firewall to allow the app. The Tauri build starts the same relay internally.
- **LAN pause of comforts.** Undo and hints are disabled in LAN play. The host does
  not offer a take-back. A disconnected seat is played by a legal fallback after a
  short wait so the table cannot freeze.
- **Per-seat views.** The host sends `view(state, seat, names)` and never broadcasts
  the full `hands` array. Tribute given/returned cards are public once resolved.
- **Autosave scope.** Autosave covers solo and hot-seat only. LAN state is
  authoritative on the host and is not written to a guest device.

## AI

- **Hard is strong, not solved.** It uses hand decomposition, public counts and a
  small sample-rollout search. It does not solve the game, and it never peeks at
  hidden hands.
- **No partnership.** Zheng Shangyou is a free-for-all here. There is no team or
  partner cooperation, and Companion's gentleness is only towards the human at seat
  zero.
- **Deterministic with the app RNG.** The app passes `Math.random` at the UI edge.
  Tests use a seeded generator. Given the same state and seed, an AI choice is
  reproducible.

## Interface and delivery

- **Undo stops at the result.** Undo works during play and tribute in solo/hot-seat.
  It is disabled on the result screen to avoid writing the same round to the family
  record twice.
- **Reduced motion.** The app follows the operating system's
  `prefers-reduced-motion` setting and removes card/panel animations. There is no
  separate in-app motion switch.
- **Screenshots are real.** The ten English and ten Chinese PNGs come from the
  running app at 1440×1000 and 780×1688 (390×844 @2×). No mockups or placeholder
  art are used.
- **Promo is central.** `video.json` supplies eight bilingual lines and three
  screenshots; the root studio renders the 45-second video. This app stores no
  Remotion project, narration audio or video file.
- **No Tauri or Cargo build here.** The shared build agent builds all installers
  centrally. The app keeps the shared `family_arcade_lan_host` crate name and the
  Tauri shell working.
- **No remote assets.** No CDN, remote fonts, downloaded card art or third-party
  audio samples are included.

## Verification

- `npm run check`: TypeScript, **53 tests**, production build.
- `node scripts/e2e.mjs`: hot-seat privacy, hint, undo, pass, autosave, a complete
  six-player AI round, tribute, resume, record, rules, language switch and mobile.
- `node scripts/shots.mjs`: ten real screenshots per language.
- `LAN_PORT=19018 npm run lan:e2e`: host room, invite, guest join, four-seat table,
  private hands, live turns, reconnect and host close.
