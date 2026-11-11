# Updates

The desktop app keeps itself up to date on the family LAN — no cloud, no account.

## How it works

- On launch the app starts a **built-in LAN server** (port 8080, falling back to
  8081–8085) and saves rooms to `%APPDATA%/Splendor/lan-rooms.json`, so room codes
  survive a restart.
- The app discovers its **update source** from the LAN server it talks to. It checks
  for a newer version in the background, downloads the installer, and installs it
  silently on the next restart (per-user, no UAC).
- **Settings → Updates** can also:
  - **Publish this version** — writes the update bundle into this machine's
    `%APPDATA%/Splendor/updates/` so other machines can pick it up;
  - **Share this version** — uploads it to the configured update source
    (off by default on the receiving side).
- One upgraded machine can therefore lift the whole family.

## Security and rollback

- Every payload is **sha256-verified**.
- Every manifest is **Ed25519-signed**; a tampered file is rejected.
- If a new build fails to start, the app **rolls back** to the previous installer
  automatically.

Updates travel over plain **HTTP on the local network**; the signatures and checksums
are what protect the payload (there is no transport encryption). See
[Known limitations](limitations.md).
