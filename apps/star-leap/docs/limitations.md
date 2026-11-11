# Known limitations — v0.2

- **LAN is local-network only.** The host listens on the local machine and guests
  join over the same Wi-Fi/LAN. There is no internet play, NAT traversal,
  matchmaking, cloud room directory or account. Do not expose the relay to the
  internet.
- **A browser host needs the shared relay.** In browser development the host page
  (`:5173`) and the `npm run lan` relay (`:8080`) are separate processes; the
  desktop build calls `lan_start` in the Tauri shell and starts the relay itself.
  If the relay is not running, the lobby says so instead of pretending to be
  online.
- **The host is authoritative.** Guests only send move intents. All selected
  guest seats must be online before the host can start. There is no AI caretaker
  for a dropped seat, no spectator mode and no host migration; if the host closes
  the room, the game ends.
- **Reconnect is token-based.** The same browser auto-reconnects with the token
  stored in `localStorage`. The guest lobby shows the token so it can be pasted on
  another device. Clearing site data loses the token and the old seat.
- **Guest names come from the invite.** A scanned invite auto-joins with the name
  in the URL (`Guest` / `家人`). There is no rename control after joining yet;
  seats are distinguished by colour and number.
- **No undo or hints over LAN.** Undo and hints are local-only conveniences and are
  disabled in a LAN game. Autosave/resume is disabled for LAN games too; the host
  records a finished LAN game in family stats, guests do not.
- **Seat count is 2–4.** A room is created with four physical guest slots. If more
  browsers join than the selected player count, the host lobby warns that the
  extras will not play; there is no dedicated spectator view for them.
- **The installer is pre-created, not rebuilt here.** `src-tauri/` is configured
  for a Tauri 2 NSIS current-user installer (Simplified Chinese + English,
  WebView2 download bootstrapper). This pass did not run `cargo build` or
  `tauri build`; the main project builds installers centrally.
- **Two codes in the URL, one on screen.** The invite carries `lan` (room) and
  `code`; both are the same 4-digit value in this version. The shared relay still
  keeps the normal host/guest protocol contract.
- **AI calibration is honest but limited.** The report now uses **200 games per
  match-up**, alternating colours, with short per-move caps (Companion/Easy 2 ms,
  Normal 5 ms, Hard 10 ms). Hard vs Normal is very draw-heavy and Normal won more
  decisive games in this sample; the live app allows larger budgets. It is a
  regression baseline, not a strength guarantee.
- **Saves and stats are local.** Autosave, family stats and settings live in this
  browser's `localStorage`. Clearing site data clears them.
- **Mobile is playable, not perfect.** The board is large; on a small phone the
  player panel is below the board and requires scrolling. Touch targets are
  enlarged, but a tablet is nicer.
- **No music.** The app synthesizes short UI sounds only; the promo has its own
  score.
- **3/4-player seating is a house choice.** See `docs/rules.md` for the start
  triangles; it may differ from a particular physical set.
- **No 6-player party mode.** The classic six-point star is drawn, but the game
  supports two to four seats in this release.
- **Not affiliated with any publisher.** Chinese Checkers is traditional; this is
  a private, non-commercial family project.
