# Mini Chess · known limitations (v0.1)

## Rules

- **Original variant, not FIDE chess.** The 5×6 board, compact army and absent
  queen are the point of Mini Chess.
- **No castling and no en passant.** Both are deliberately omitted and are
  documented in `rules.md` and the in-app rules.
- **No threefold-repetition draw and no draw agreement.** The automatic draws are
  the fifty-move rule and insufficient material.
- **The fifty-move draw triggers automatically** at 100 quiet plies rather than
  waiting for a player to claim it.
- **No chess clock, resignation, arbiter or tournament pairing.**
- **No move replay viewer.** The move log is a compact coordinate list; there is
  no board scrubbing or PGN export/import.
- **FEN is a test format.** It supports placement and side to move, plus counters;
  it is not a full PGN/FEN tool and does not auto-apply material draws on parse.

## Play and AI

- **Hard is deliberately strong** (alpha–beta depth 5 plus quiescence) and may
  take about a second per move on an older laptop. It is not a teaching engine.
- **No opening book, endgame tablebase or pondering.** Search is synchronous in
  the UI thread.
- **No difficulty slider.** The four levels are fixed by the brief.
- **The AI always plays Black against a human.** Choosing a side is not exposed in
  the current UI.
- **Undo is disabled after checkmate/stalemate/draw.** This keeps the local family
  record honest. Undo is also disabled in LAN games.
- **No board editor or puzzle library.**

## LAN

- **Same subnet, IPv4.** The relay needs the host firewall to allow the chosen
  port; guest phones must be on the same Wi-Fi.
- **No spectators.** The room is exactly two seats; a third guest is rejected.
- **Reloading the host page drops the room.** A guest page reload can rejoin from
  the invite URL because the client token is stored locally, but there is no
  dedicated reconnection lobby or host state restore.
- **Host departure is not a close message to the guest.** The shared relay emits
  `peer-leave`, which the shared guest helper currently ignores. A guest can keep
  seeing the last view until they go back; a new room is needed to play again.
  The app does recover if the whole relay connection drops.
- **No chat, emotes or rematch handshake.** The host can start a new game and the
  guest receives the new view.
- **Browser host invites can point at `localhost`** if the host page itself was
  opened on `localhost`. Open the host page using the machine's LAN IP, or use the
  Tauri build, which supplies the correct invite URLs.
- **Room code is four digits.** It keeps honest family members out, not a
  determined attacker on the same LAN.

## Platform and packaging

- **Browser v0.1 plus a local Tauri shell.** No cloud saves, accounts,
  matchmaking, telemetry or ads.
- **The Tauri installer is built centrally.** This app agent keeps `src-tauri`
  working and does not run `cargo build`/`tauri build`.
- **The Windows build is unsigned.** SmartScreen may warn.
- **No separate promo MP4 is checked in.** `video.json` feeds the root promo
  studio; posters/renders are produced there.
- **Chess pieces are Unicode glyphs** rendered by the operating system. Their
  exact shapes vary slightly by platform; no piece font or SVG set is bundled.
- **No 4K or vertical promo cut** is produced by this app.

## Accessibility and comfort

- Arrow-key board navigation, native button activation and visible focus are
  provided. There is no screen-reader-specific move announcement beyond the live
  status line and square labels.
- Reduced-motion support removes transitions and the check pulse.
- Sound is a simple generated WebAudio chime; there is no music or ambient loop.
