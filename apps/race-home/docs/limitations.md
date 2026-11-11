# Race Home · known limitations (v0.1)

## Rules and board

- **No safe squares.** The brief only requires capturing on a landing. This house
  has no star/safe cells: every meeting on the ring is a capture. The four coloured
  start cells are visually marked but are not safe.
- **Exact finish.** A pawn must land exactly on the central house. An overshoot is
  not a legal move, which can add a few “dead” rolls near the end. The UI auto-passes
  when a roll has no legal pawn.
- **Stacking is allowed.** Own pawns may share a square. There is no blockade rule.
- **Fixed seat colours.** Seats are always red, then green, yellow and blue. There is
  no colour picker and no rearrangement of the turn order.
- **2–4 players only.** One-player solitaire is not a mode; solo means one human
  (red) plus one to three AI seats.

## AI

- **Companion is gentle, not a pushover.** It penalises captures heavily but will
  still take an immediate win, and will capture if no reasonable alternative exists.
- **Easy is deliberately noisy.** It chooses a random legal pawn 62% of the time, so
  it can miss obvious plans.
- **Hard is one-ply, not perfect.** It weighs the destination's risk from opponents
  within six squares, but does not search a multi-turn game tree. On a lucky table it
  can lose.
- **AI thinking time is cosmetic.** The 560 ms pause is for readability; the decision
  is instantaneous and deterministic for a fixed RNG.

## LAN

- **Single host, same subnet.** The relay is IPv4 on the host's local network. There
  is no internet matchmaking, room discovery or NAT traversal.
- **Host authoritative, host online.** The host keeps the only authoritative board.
  If the host closes the tab, the race ends for everyone. State is not persisted in
  the relay.
- **Browser invite hostname.** In the browser relay, the QR/invite uses the hostname
  from the host page. If the host opens `localhost`, a phone cannot use that invite.
  Open the relay at `http://<LAN-IP>:8080` on the host before opening the room.
- **No spectator mode.** A room accepts exactly the number of seats chosen (2–4).
  Extra guests are rejected as full.
- **No in-game chat.** The shared library exposes `sendChat`, but this app does not
  render a chat UI.
- **Reconnect is best-effort.** The shared token restores a seat when the guest
  reconnects, and the host re-sends a view, but there is no countdown, pause overlay
  or automatic result recovery if the host reloads.
- **Offline seat skip.** If a guest disconnects mid-game, the host can press “Skip
  offline player” when that seat comes around. The skipped seat is not played by AI.

## Persistence and record

- **Autosave covers solo and hot-seat only.** LAN state is never written to
  `localStorage`.
- **One save slot.** Starting a new local race replaces the previous save.
- **Local record only.** The family record lives in this browser or WebView profile.
  Clearing site data removes it. LAN games do not increment it.
- **No player names in local record.** The record is by colour and mode, not by a
  custom family member profile.

## Platform and packaging

- **Tauri shell only.** This task kept `src-tauri` working and type-checked the front
  end, but deliberately did not run `cargo build` or `tauri build`; the main Family Arcade
  build produces the installers centrally.
- **Unsigned Windows build.** Expect a SmartScreen warning for the family installer.
- **Installer not tested here.** The Tauri configuration and shared LAN command are
  intact, but no NSIS artifact was produced in this workspace.
- **No PWA/service worker.** “Offline-first” means the local files work without a
  network; it is not an installable web app.
- **No 4K or vertical promo.** `video.json` is the manifest for the root Family Arcade
  studio; this app does not ship its own Remotion project.

## Accessibility and input

- **Keyboard path is complete but compact.** Space/R, 1–4, H, U and Esc. There is no
  roving tabindex grid or screen-reader announcement for every die face; the turn bar
  and toast use `role="status"`.
- **Touch targets on the smallest phones.** Pawns are about 22 CSS px at 390 px wide.
  Legal moves also glow, but very young children may benefit from a larger device.
- **Reduced motion is respected.** CSS transitions and the legal-move glow are
  disabled with `prefers-reduced-motion: reduce`.

## Testing and screenshots

- **`?seed=` is a test hook.** It makes dice repeatable for Playwright and the
  screenshot generator. It is not a cheat mode and does not expose game state.
- **Screenshots use real play-throughs.** The generator plays actual turns and a full
  seeded game; it does not mock the UI. The final result depends on the seed, so a
  future rules change may require updating the seed or target roll count.
