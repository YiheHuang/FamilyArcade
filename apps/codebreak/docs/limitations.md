# Codebreak · known limitations (v0.1)

- **Two seats only.** The engine, hot-seat flow and LAN room are built for one
  setter and one breaker. There is no 3–4 player variant or team mode.
- **No online matchmaking.** LAN is local-subnet IPv4; the browser host needs
  `npm run lan` running on the same machine. The Tauri build starts the shared
  relay when you host. Firewalls may block guest phones. In the browser dev flow
  the QR invite uses the host page’s hostname, so open the host page via the
  machine’s LAN IP (`npm run dev -- --host`) when inviting a phone; the desktop
  build fills in LAN addresses from the relay.
- **Host-authoritative LAN, not cryptographic secrecy.** In a guest-sets round
  the secret is sent to the host so guesses can be validated. It is never drawn
  in the host’s breaker UI and is removed from the breaker’s seat view, but a
  determined person with developer tools could inspect the host’s in-memory
  state. LAN privacy is for a trusting family table, not hostile networks.
- **No LAN reconnect or spectators.** If a guest drops mid-round, the host can
  leave the room and host a new one. There is no reconnect token flow in the UI.
- **No LAN undo or autosave.** Undo is available in solo and hot-seat rounds.
  LAN rounds are not saved to the local record; only the host can start a rematch,
  and rematches swap roles.
- **Local record is aggregate.** It counts games, cracked codes, held codes, the
  best crack and a recent strip. It does not name family members or keep a
  per-player table.
- **Companion’s extra peek only applies in solo play.** In a hot-seat or LAN
  game the code is held by a human, so the “Companion peek” control is hidden.
- **Hints suggest, they do not solve.** A hint shows one legal guess consistent
  with the public clues and explains why it was chosen. It never reads the secret
  except for Companion’s explicit, limited one-peg peek.
- **Hard is a real opponent.** It is not suitable as a first teaching level for
  a young child. Companion is the intended teaching setting.
- **Colour accessibility is partial.** Palette buttons are named and all board
  pegs have screen-reader labels, but placed pegs are distinguished visually by
  colour; there are no per-colour symbols on the pegs themselves.
- **Sound is simple WebAudio.** Browsers may keep audio suspended until the first
  user gesture; the toggle is remembered per device.
- **No cloud saves or accounts.** The current game and record live in
  `localStorage` on this browser/device. Clearing site data removes them.
- **Browser build is v0.1.** The Tauri shell and LAN relay are included, but the
  installer is built centrally and is unsigned; Windows SmartScreen will warn.
- **Promo is manifest-only in this app.** `video.json` is rendered by the Family Arcade
  studio. No MP4, poster or remote asset is shipped in `apps/codebreak`.
- **No 4K or vertical promo cut.** The studio manifest is the single 45-second
  bilingual source.
- **Room code is four digits.** It keeps an honest family member out of the wrong
  room; it is not a security boundary.
- **Guest entry is invite-first.** The guest needs the QR/invite URL to learn the
  room id; there is no lobby browser for typing a room id without an invite.
