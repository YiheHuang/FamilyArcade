# Mill · known limitations (v0.1)

Honest notes about what this build does and does not do.

## Rules

- **No flying rule.** The brief specifies moving along the lines; this build never
  grants the optional “flying” rule that some Nine Men's Morris variants give a
  player who is down to three men. A blocked three-man player loses.
- **Draw is a quiet-move draw.** The engine declares a draw after 100 plies
  (50 full moves) without a capture. It does not detect threefold repetition.
- **Mills may be re-formed.** Moving a man out of a mill and back in is allowed;
  the resulting mill captures again, as in most modern rulesets.
- **One capture per mill.** If a placement or move closes two mills at once, only
  one opposing man is removed.

## Modes and record

- **Two players only.** Solo vs AI, hot-seat and one LAN guest. There is no
  spectator seat and no three-player variant.
- **Host records the LAN result.** A guest sees the result and rematch state but
  does not write a second copy into its own family record. Local and AI games are
  recorded on the device that played them.
- **No account or cloud sync.** The save and record live in this browser/WebView's
  `localStorage`. Clearing site data clears both.
- **No reconnect dialog.** The relay keeps a reconnect token; reopening the same
  invite joins again. A guest who loses Wi-Fi sees the last host view, not a live
  “reconnecting” spinner.

## AI

- **Hard is a four-action alpha–beta search, not a solved game.** It is strong for
  a family game and takes immediate mills and captures, but it is not proven to
  play perfectly and can still be beaten by a good human.
- **Companion is deliberately gentle.** It avoids capture sprees and may prefer a
  safe developmental move over a capture that would end the game quickly.
- **Search runs on the main thread.** On a low-end phone, Hard may pause the UI for
  a fraction of a second before it moves. There is no worker.
- **Determinism needs an injected RNG.** The app passes `Math.random`; tests and
  replays can pass a seeded generator. The same state and RNG sequence always
  produce the same move.

## LAN

- **Same-subnet IPv4.** The relay is local; there is no matchmaking, NAT traversal
  or internet play.
- **Port 8080 by default.** Browser LAN needs the relay serving the built app:

  ```bash
  npm run build
  npm run lan
  ```

  If another local app owns :8080, start the relay on another port and open the
  host page with `?lanPort=<port>`, e.g.
  `node ../../tools/lan-server.mjs --dist dist --port 8100` and
  `http://localhost:5184/?lanPort=8100`.
- **Firewall.** The host machine must allow inbound connections on the relay port
  so a phone on the same Wi-Fi can open the invite.
- **Guest needs the built app.** In browser mode the guest opens the relay-served
  `dist`, not the Vite dev page. The desktop build serves the same files itself.

## Build and assets

- **The Tauri installer is not signed.** A Windows SmartScreen warning is expected;
  no certificates are included. The central release job builds installers; this
  app only keeps the shell buildable and was not `cargo build`-ed here.
- **No downloaded assets.** Board lines, stones, icons and textures are CSS/SVG.
  Sound is synthesised with Web Audio oscillators. There are no remote fonts,
  sample files or third-party art.
- **Screenshots use the real app.** `scripts/shots.mjs` drives Chrome against the
  running app. Late-game and record screenshots are created by loading valid game
  states through the app's own autosave format and finishing the games through the
  UI; they are not design mockups.
- **No promo video in this app folder.** The root studio renders the 45-second
  EN/ZH promo from `video.json`; this repository does not include a checked-in MP4
  for Mill. The README links to the manifest rather than a missing file.
