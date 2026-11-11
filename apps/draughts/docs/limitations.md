# Draughts · known limitations (v0.1)

Honest notes for the family build. None of these are hidden behind the UI.

## Rules variant

- **English draughts only.** 8×8 board, twelve men each, dark squares. This is
  not 10×10 international draughts, Turkish draughts or Canadian checkers.
- **Red moves first.** Traditional English draughts gives Black the first move;
  the family build maps Black to the red pieces so the bottom side opens.
- **Men capture forward only.** A man may not jump backwards. It may move
  forward only and is crowned on the far row.
- **Kings are one-step.** They move and capture one diagonal square in any
  direction (including backwards), but they are not “flying kings” and do not
  slide across empty squares.
- **No maximum-capture rule.** English draughts lets you choose any legal
  capture. Once you start a jump you must continue it, but you are not forced to
  take the longest sequence. The engine and AI follow that rule.
- **Simplified draw rules.** The app draws after 40 moves by each side with only
  king moves and no capture (80 quiet plies), after a position appears three
  times, or at a 300-ply safety limit. Tournament rules also include other
  move-count and endgame rules that are not implemented.
- **No draw offers or resign button.** A finished game offers “Play again”.

## AI

- **Companion is deliberately gentle.** It chooses the smallest capture and
  avoids handing the child an immediate capture when it can. It is not a
  teaching engine and will still take a forced win.
- **Easy is random.** It will make obvious mistakes.
- **Normal is 2-ply** with material, advancement, back-row and king-safety
  terms. It is beatable.
- **Hard is 5-ply alpha-beta** with capture quiescence and a simple evaluation.
  It is a strong family opponent, not a perfect or tournament engine. Search
  depth is fixed; there is no opening book or endgame tablebase.
- All levels are deterministic for a given position and injected RNG. The UI
  injects `Math.random`; tests inject a seeded generator.

## LAN

- **Same-subnet IPv4 only.** The browser relay is a small Node WebSocket server;
  the Tauri build uses the shared Rust relay. There is no STUN/TURN, internet
  relay or matchmaking.
- **Host firewall.** Phones may need the host machine's firewall to allow the
  relay port. The invite address is built from the host's LAN URL.
- **Browser dev mode and `localhost`.** The browser relay builds the invite from
  the host page hostname. If the host page is opened at `localhost`, the QR
  points at `localhost:8080` and only works on that machine. Open the host page
  via the machine's LAN IP, or use the Tauri build (its Rust relay returns LAN
  URLs), before asking a phone to join.
- **No spectator or reconnect lobby.** A second guest gets “room full”. If a
  guest disconnects, the host keeps the state but there is no automatic seat
  recovery UI.
- **4-digit room code.** It keeps honest family members out, not a determined
  attacker on the same LAN. The relay is a dumb message bus.
- **Host-authoritative.** The guest sends a full move path; the host re-checks
  the turn and validates it against its own legal move list. A malformed intent
  is ignored.

## Platform and build

- **The browser build is the verified build.** `npx tsc --noEmit`, 30 unit
  tests, `vite build` and Playwright E2E/screenshots were run here. The Tauri
  shell and `src-tauri/Cargo.toml` are kept intact, but no `cargo build`,
  `tauri build` or installer was produced in this workspace; the central build
  agent builds installers.
- **Unsigned installer.** A Windows SmartScreen warning is expected.
- **Autosave is local.** The current game and family record live in
  `localStorage` on the device. There is no cloud save or account.
- **No remote assets.** No CDNs, remote fonts, downloaded art or third-party
  audio. Pieces, crowns and the board are CSS/SVG; sounds are synthesised with
  WebAudio.
- **Screenshots are real.** 1440×1000 desktop and 390×844 @2× phone captures from
  the running app, not mockups.
- **No 4K or vertical promo.** `video.json` feeds the root studio's 45-second
  EN/ZH promo. The root studio is not part of this app.
- **Reduced motion.** The CSS disables transitions and the target pulse when the
  OS asks for reduced motion.
