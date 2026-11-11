# Sweet Carousel · Known limitations (v0.1)

This is a deliberately small vertical slice. The following are **not** implemented; they are next-milestone items, not hidden claims.

## Platform and distribution

- **Web app + Tauri v2 shell.** The web app runs from `npm run dev` or a static `dist/`; the Tauri shell and `src-tauri` config are present and kept working. A per-user NSIS installer is built centrally in the release job, **not in this parallel pass**; no installer size or clean-machine claim is made here.
- **LAN host/guest is implemented.** The host creates a room, shows a QR/invite and starts when every seat is connected. Guests join the shared `@family-arcade/lan` relay from a browser on the same Wi-Fi. The host validates every intent and sends each guest only `view(state, seat)`; full hands are never sent. Reconnect uses the shared client token and keeps the seat.
- **No accounts, cloud sync, leaderboards or telemetry.** Stats and saves live in this browser's `localStorage`. The LAN host records the table result locally; guest devices do not write the host's record.
- **No service worker/PWA install.** The web build needs a local/static host; the Tauri shell is the packaged path.

## LAN gaps

- **Same Wi-Fi only.** No public internet, relay tunneling or NAT traversal.
- **Host must stay open.** If the host page/app closes, the shared relay room ends. Guests cannot continue.
- **No spectator mode and no AI takeover.** A disconnected guest keeps their seat and can rejoin, but the host waits for them; the seat is not auto-played.
- **No UDP room discovery.** You need the QR/invite link or room+code. There is no “nearby rooms” list.
- **Invite hostname matters.** A browser host opened via `localhost` produces a `localhost` invite that phones cannot reach; use the machine's LAN IP or the Tauri relay's URL.
- **LAN games are not autosaved across app restarts.** Reconnect resumes from the host's live state; a host restart loses the live table.

## Gameplay and AI

- **No 6+ player mode.** The engine and UI enforce 2–5 seats.
- **No campaign, achievements, daily tasks, shop or skins.**
- **No full move-by-move animated replay.** “Review this game” shows the stored rounds, every pick, and the score breakdowns; it does not re-apply each move through the engine or scrub a timeline.
- **Undo is session-only.** You can undo back through the current session, but the undo stack is not stored in the autosave. Reloading resumes the current state without history.
- **AI calibration is 2-player self-play.** 400 games per matchup are reported in `docs/ai-calibration.md`; 3–5 player win rates are not separately calibrated.
- **Companion is a heuristic promise, not a hard constraint.** It avoids taking the last copy of a dessert a human needs when another candidate exists. If every candidate is that card, it must take one.
- **No difficulty auto-balance.** The AI does not adapt during a game.

## UI and accessibility

- **Mobile was verified in Chrome device emulation**, not on a physical phone. Hot-seat cover screens assume people physically pass one device.
- **Focus trapping in modals is basic.** The tutorial and dialogs are keyboard operable and close with Escape/close buttons, but focus is not formally looped.
- **Screen-reader coverage is pragmatic.** Cards, seats and actions have labels; a dedicated screen-reader audit has not been done.
- **No colour-blind simulation screenshots.** The design uses shape + text for every dessert and a mark for every seat, but the formal simulation pass is pending.
- **Animations are intentionally simple.** No 3D carousel, no particle system, no video in the app.

## Content and rules

- The rules make three family-friendly interpretations explicit:
  - one same-type combo per dessert per round;
  - a sampler must be exactly three different leftover desserts;
  - crowns are final-only, unique leader, at least six copies.
- These are documented in `docs/rules.md`; they are the canonical version for this release.
- No third-party card text, art, publisher name or logo is used.

## Video and packaging

- The root studio uses [`video.json`](../video.json): eight EN/ZH lines, facts, accent and three screenshot names. The previously rendered 48.5 s cuts remain in `docs/promo/` (1920×1080, 60 fps, H.264/AAC, yuv420p) with SRTs and 1200×1600 posters. The app does not build a second Remotion project in this pass.
- Audio is an original synth bed plus Edge TTS narration; it is not a human voice recording. Mastered to about −14 LUFS / ≤ −1 dBTP.
- The existing promo predates LAN; `video.json` includes “Hot-seat + LAN” for the root studio. No 4K master, vertical/social cut or separate 30 s cut is shipped.
- No installer size, startup time or FPS claims are made until the central package and clean-machine run exist.

## What is intentionally solid

- Pure deterministic engine, seeded random deals, versioned saves and invariants.
- Simultaneous picks, reveal, pass left/right/left, three-round scoring and tie-breaks.
- Hot-seat privacy cover, solo AI seats, undo, hint, autosave/resume.
- LAN host/guest with QR invite, seat status, host-authoritative intents, per-seat filtered views and reconnect.
- Chinese/English UI, local stats, JSON export and a complete rule audit.
