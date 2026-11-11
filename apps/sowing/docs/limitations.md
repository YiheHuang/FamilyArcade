# Sowing · known limitations (v0.1)

- **One mancala variant.** Six pits per side, four seeds per pit, fixed rules. There is
  no variant selector for Bao, Oware, Omweso or other sowing games.
- **Family Kalah capture.** The landing seed is captured even when the opposite pit is
  empty. Some Kalah traditions require a non-empty opposite pit; the app follows the
  Family Arcade brief (“that stone plus the opposite pit”).
- **Finish-and-sweep.** When either row empties, remaining seeds go to their owners'
  stores before scoring. This is a documented family convention, not stated in the
  one-line brief, and it keeps the 48-seed total intact.
- **Two players only.** No teams, spectators or 3–4 player mancala.
- **LAN is local-subnet IPv4.** Guest phones need the host firewall to allow the app.
  The relay does not traverse NAT or the internet.
- **4-digit room code is courtesy, not security.** It keeps honest family members out,
  not a determined attacker on the same LAN. The relay only routes host/guest messages;
  the host still validates every intent.
- **No LAN undo.** Undo is disabled in host and guest games so one seat cannot rewind the
  other. Solo and hot-seat keep undo.
- **Record is local.** It counts finished solo/hot-seat games in this browser only.
  LAN results are not written to the guest's record, and there is no cloud sync.
- **Hard is eight plies, not a solver.** It uses alpha-beta with move ordering and can
  take a moment on a full board or a low-end phone. Companion is intentionally gentle
  and may miss a good capture.
- **No reconnection UI beyond reopening the invite.** The shared LAN package remembers a
  client token; opening the same invite again and joining is the supported recovery path.
- **No installer built here.** The Tauri 2 shell and NSIS config are kept and type-checked,
  but per the build brief the main agent runs `tauri build` centrally.
- **No 4K or vertical promo file in the app.** `video.json` is the single source for the
  root studio's 45-second EN/ZH render.
- **Screenshots are Chrome captures**, not mockups: 1440×1000 desktop and 780×1688 phone
  @2×. System font rendering may differ slightly between machines.
