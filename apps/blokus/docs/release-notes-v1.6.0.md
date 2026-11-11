# Blokus v1.6.0

**Nothing gets lost, nothing gets stuck, nobody gets in uninvited.** This release is the reliability round: games survive crashes and reloads, illegal moves explain themselves, the keyboard can play the whole game, and LAN rooms are protected by a room code.

## What's new

- **Continue last game**: the running game is saved after every move. Close the window (or crash) and the home page offers **Continue last game** — LAN games cut off by a dropped connection can still be reviewed move by move.
  *(requirements: keep the last valid progress after an abnormal exit; network trouble must not lose the whole game)*
- **Illegal moves explain why**: instead of a vague "can't place here", the app says exactly which rule you hit — "your first piece must cover your corner", "it must touch your own pieces corner-to-corner", "it cannot share an edge with your own pieces", "those squares are taken".
- **A 4-digit room code** protects every LAN room. The invite link carries it (`…:7667/#c=1234`), the lobby shows it large enough to read aloud, and a wrong code is refused with a readable message. Phones opening the invite link land straight on the join screen with address *and* code prefilled.
- **Keyboard can play the whole game**: Tab to a tray piece, `Enter` selects it, arrow keys move it, `Enter` parks, `Enter` places. Rotation (`R`/`Q`), flip (`F`) and cancel (`Esc`) as before.
- **Sturdier LAN**: every action carries the state version it was based on — stale or replayed requests from a reconnecting phone are rejected and answered with a fresh snapshot instead of corrupting the board; the relay checks the WebSocket origin and rate-limits clients; the room port is provably released when a room closes.
- **The table tells you what happened**: when the AI caretaker takes over a dropped seat, everyone sees *"Grandma dropped out — the AI plays for now"*, and *"Grandma is back"* on return. A gentle 90-second "still thinking" reminder never penalises anyone.
- **Smaller quality-of-life**: export records/stats to the clipboard as JSON (backup), unfinished-game banner on the home page, protocol version exposed for troubleshooting.

## Under the hood

- 85 unit tests + 12 Rust integration tests, plus the end-to-end run through the real WebView2 (now also covering the keyboard flow, the reload/resume flow, room codes, stale state versions and the AI caretaker).
- Rule set, data sources and the test map are audited in [`docs/rules.md`](https://github.com/YiheHuang/Blokus/blob/main/docs/rules.md).
- `npm run check` runs every check; `npm run release -- <version>` bumps, checks, commits, tags and pushes.
- Source is now MIT-licensed (`LICENSE`).
- WebView2: if a machine lacks the runtime, the installer fetches Microsoft's bootstrapper once during setup (installer size unchanged, ~1.4 MB).

## Install

Download `Blokus_1.6.0_x64-setup.exe` below and run it — per-user install, no admin required. Your settings, stats and unfinished game stay.

The release page shows the SHA‑256 digest of the uploaded installer under *Assets*.
