# Four · known limitations (v0.1)

- **Two players only.** The engine, record and LAN seats are built around red and
  yellow. There is no three-player or team mode.
- **Hard is strong, not perfect.** It searches five plies with alpha-beta pruning
  and a window heuristic; it is not a solved-game oracle and a deeper search can
  beat it. This is the brief's 5-ply level, not a claim of invincibility.
- **Companion is deliberately imperfect.** It takes some wins and blocks most
  immediate threats, but it can miss a block so a child gets a chance. Its
  randomness is injected and reproducible in tests, but not in normal play.
- **Draws are legal but rare.** A full 42-slot board with no four is a draw; the
  test suite uses a known 42-move draw to prove it.
- **Undo is local only.** Hot-seat and AI games can undo while the game is still
  in progress. LAN undo is disabled because the host is authoritative and a
  retroactive undo would desynchronise the guest.
- **LAN is same-subnet IPv4.** Browser LAN needs the shared relay:
  `npm run build && npm run lan`. The relay listens on `:8080` by default. If
  that port is taken, start the relay on another port and open the host page
  with `?lanPort=PORT`; the QR invite then uses that port. The host firewall must
  allow the relay, and there is no spectator mode or online matchmaking.
- **LAN results are not recorded.** Only finished AI/hot-seat games are added to
  the local family record; neither the host nor the guest counts a LAN game.
- **No cloud saves or accounts.** The autosave and record live in `localStorage`
  on one browser/device. Clearing site data clears both.
- **No installer was built in this pass.** The Tauri 2 shell and `lan_start`
  command are kept and `npx tsc --noEmit` passes; the central Family Arcade build
  produces the unsigned NSIS installer. SmartScreen warnings are expected.
- **Promo is a manifest, not a rendered video.** `video.json` has eight EN/ZH
  narration lines and screenshot names; the root studio renders the 45-second
  cut. No separate Remotion project or fake poster is included.
- **No 4K or vertical promo cut.** Screenshots are desktop 1440×1000 and mobile
  390×844 @2×, as specified.
- **Sound is a small synthesised chime.** There is no music, voice track or
  downloaded audio; sound respects the toggle and reduced-motion mode removes
  the drop animation.
