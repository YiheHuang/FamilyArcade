# Chess · known limitations (v0.1)

- **Two players only.** No variants (Chess960, atomic, king of the hill), no
  three-player table, no team play.
- **No chess clocks.** There is no increment, flag fall or time control.
- **No draw offer or resignation button.** The engine ends a game on checkmate,
  stalemate, the fifty-move rule, threefold repetition or insufficient material.
  The first two draw rules are claimed automatically rather than offered as a
  claim button, which is a deliberate family simplification.
- **No online matchmaking, accounts, spectators or cloud saves.** The record and
  the autosave live in the browser/device. LAN is local-subnet IPv4 only.
- **Host plays White, guest plays Black.** There is no colour choice for a LAN
  room. The host is also the only side that can start the next game.
- **The four-digit room code is not security.** It keeps an accidental neighbour
  out; it is not a defence against a determined attacker on the same network.
- **LAN results are recorded on the host only.** The guest device keeps its own
  local record and does not duplicate the host's result.
- **The AI is a family opponent, not a grandmaster.** It uses material, piece-square
  tables, alpha-beta search, move ordering and quiescence. Hard searches three
  plies with a short capture search; there is no opening book, endgame tablebase,
  transposition table or pondering.
- **Companion is intentionally gentle.** It may miss a tactic that Hard would find
  and sometimes chooses a quieter move over a capture.
- **Autosave restores the current position, not the undo stack.** Reloading offers
  Continue, but you cannot undo moves made before the reload.
- **Hints are local only.** They use the same search as Hard and are disabled
  during LAN play. Undo is also local only.
- **No analysis board, evaluation bar or engine lines.** The hint shows one move
  and a plain-language reason.
- **No 4K or vertical promo cut.** The root studio renders the 45-second bilingual
  promo from `video.json`; this app does not ship its own Remotion project.
- **The Windows installer is unsigned.** A SmartScreen warning is expected. Tauri
  uses the standard WebView2 bootstrapper.
- **Browser LAN needs the relay.** In dev, run `npm run lan` alongside the Vite
  server; the built browser app is served by the relay on :8080. The Tauri build
  starts the relay internally.
- **Board assets are Unicode glyphs.** They render with the system chess font
  (`Segoe UI Symbol` on Windows, Noto/Apple symbols elsewhere); a very old system
  without chess glyphs would draw fallback squares.
