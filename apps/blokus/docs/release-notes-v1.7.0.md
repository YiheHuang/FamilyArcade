# Blokus v1.7.0

**Phones join with a scan, desktops find the room by themselves — and when a firewall eats the broadcast, the app now goes looking over the same port the game uses.**

## What's new

- **QR code in the lobby.** The host's screen shows a QR code of the invite link (room code included). A phone scans it, lands on the join screen with the address *and* the code already filled in, taps Join. Click the code to enlarge it for scanning across the table, and the new **Copy invite** button produces a ready-to-paste sentence: *"Blokus night! Join here: … (room code 1234)"*.
  The QR encoder is our own (no runtime dependency) and is verified two ways in the test suite: module-for-module against the reference `qrcode` package, and by decoding our own rendered output with `jsqr` — the same check the e2e runs against the real lobby canvas.
- **Rooms that broadcast cannot reach are now found by a TCP scan.** UDP discovery still runs first (it is instant), but when it comes back empty the app sweeps your subnet on the room port (254 addresses per interface, bounded concurrency, ~1–2 s). If you can join the room, you can find it. The nearby list marks entries found this way, offers a manual **Deep search** button, refreshes itself every couple of seconds while the screen is open, and shows your own address so you can spot a "different network" problem at a glance.
- **Joining a running game is now allowed** — the room shows up as **Watch** instead of a disabled button (the server has always supported spectators).
- **Clearer joins**: the app asks for the 4-digit room code by highlighting the field instead of failing at the server, and empty searches now explain what to check.
- **Smaller things**: `/room-info` gives machine-readable room details (deliberately *without* the room code), and the rust dev profile no longer keeps debug info for dependencies — the build cache stays a few GB smaller.

## Under the hood

- 91 unit tests + 15 Rust integration tests. New coverage: the QR encoder (reference comparison + independent decode), `/room-info` (and that it never leaks the room code), the subnet sweep (a real room found over TCP, a stopped room not found, /16 trimming), plus the e2e checking the lobby QR with a real decoder and `scan_hosts` finding the local room.
- `cargo clean` is documented as the one-liner that frees the build cache (~7 GB).

## Install

Download `Blokus_1.7.0_x64-setup.exe` below and run it — per-user install, no admin required. Your settings, stats and unfinished game stay.

The release page shows the SHA‑256 digest of the uploaded installer under *Assets*.
