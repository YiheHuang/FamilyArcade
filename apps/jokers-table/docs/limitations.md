# Joker's Table · known limitations (v0.1)

- **Balance is a first pass.** The six-ante target curve, joker prices and shop
  weights are tuned for a family table, not for tournament play. A strong build can
  overshoot the late targets; an unlucky shop can make Ante 5–6 hard. The engine and
  content are complete, but the numbers will move after more playtesting.
- **No Tauri/cargo build was run here.** The shared Tauri shell is kept and the web
  build is type-checked. The central build agent produces installers. The NSIS
  installer will be unsigned and may trigger a SmartScreen warning.
- **LAN disconnects pause the affected seat.** There is no reconnection token,
  host migration or automatic forfeit. Restart the room if a phone drops mid-match.
  If the host disappears, guests stay on the connection screen and must rejoin.
- **LAN score submission is trust-based.** The host validates the blind index and
  the seat but cannot prove that a guest’s local score came from legal play. This is
  a family game, not an anti-cheat service.
- **Hands are private; shops are sequential.** Hot-seat hides hands behind a cover.
  Once a seat opens the shop, the shop and owned jokers are visible to anyone
  watching the shared device. The cover is etiquette, not encryption.
- **The host records LAN results.** Each device keeps its own local family record.
  Clearing a record affects only that device.
- **Finale fallback.** Competitive play has six extra escalating finale blinds after
  the six core antes. If all 24 blinds are played and more than one player still has
  hearts, the highest hearts win; a tie on hearts is broken by cumulative score, then
  by lowest seat index. This is an honest fallback, not a seventh ante.
- **Rivals stop when the human is eliminated.** In the AI rival table, the human’s
  run ends when they lose their last heart. The game does not simulate the remaining
  AI-only match to a winner.
- **Money never goes negative.** The Tax Collector takes at most the money you have.
  A hand still costs $2 for the purpose of the rule, but the balance is clamped at 0.
- **Enhancements need an unenhanced target.** If every one of the 52 cards is already
  enhanced (a very long run), an enhancement offer cannot be applied. The shop still
  displays it; buying it returns the “choose a card” error.
- **The Sphinx is a base-value boss.** It makes straights and flushes use High Card’s
  base chips and mult, but joker conditions still read the real pattern. This is a
  deliberate ruling documented in `docs/rules.md`.
- **Prism is suit-wild only.** It does not change rank or help a straight. A mixed
  hand with Prism is only a flush if every non-Prism card already shares one suit.
- **AI is honest, not perfect.** Hard searches every 1–5 card subset and discards
  aggressively, but it does not simulate unseen draws or future shops. It never reads
  hidden cards because there are none in a solo board.
- **Hints always recommend a play.** The hint uses the Hard best-play search and
  explains the hand, chips, mult and total. It does not offer a discard-only hint.
- **Undo is limited.** It is available only during a local blind and before the
  blind resolves. It cannot rewind a shop purchase, a resolved blind, a LAN action,
  or the start of a new ante.
- **No mid-match joining.** The host roster is fixed when the first blind starts.
  A device that joins the room after that can see the lobby but receives no seat
  until the host creates a new room.
- **LAN sessions do not autosave.** Local runs (solo, rivals, hot-seat) save after
  every action. A LAN room is held in memory and must be completed in one sitting.
- **Manual LAN join uses the page origin.** Opening a guest form on the Vite dev port
  cannot reach the relay; use the host’s invite URL or run the built app from the
  shared relay. This is a development-server limitation, not a game rule.
- **No online matchmaking.** LAN is IPv4 on the same subnet. The four-digit room code
  is a family convenience, not a security boundary.
- **No mid-run setup.** Deck, seed, AI level and player count are chosen before the
  first blind. The seed is shown in the game header.
- **Play money only.** There is no real-money play, cash-out, odds or gambling
  feature anywhere in the app.
- **No drag-and-drop.** Cards are selected by tap/click or number keys. The mobile
  layout is a compact eight-card row, not a fan gesture.
- **No cloud saves or accounts.** Save data and the family record live in this
  browser/WebView only.
- **Screenshot fixtures.** The shop, comparison and end screenshots use valid
  deterministic engine states built by `?demo=shop`, `?demo=compare` and `?demo=end`.
  Live solo, rival, hot-seat and LAN flows are exercised by the E2E scripts; the
  fixtures are not mock images.
- **No promo render in this workspace.** `video.json` contains the eight bilingual
  lines, facts and screenshot names. The root studio renders the 45-second promo;
  this app does not ship a separate Remotion project.
- **No external assets.** All card faces, backs, table ornaments, joker glyphs and
  the favicon are CSS/inline SVG. Sound is synthesised with the Web Audio API. There
  are no remote fonts, third-party samples or downloaded art.
