# Known limitations

- **Windows only** (x64) and requires the **WebView2 runtime** — present on Windows 11
  and on any Windows 10 with Microsoft Edge. The installer deliberately bundles no
  browser runtime (that is where the ≈3.6 MB comes from).
- The installer is **not code-signed**, so Windows may show “Unknown publisher”.
- Updates travel over plain **HTTP on the local network**; the payload is sha256-verified
  and the manifest is **Ed25519-signed**, so a tampered file is rejected — but there is
  no transport encryption.
- LAN play is authoritative on the host machine: closing the host app ends the session
  (rooms are saved and players rejoin with their token once the host is back).
- **Nearby rooms** needs the app to be allowed through the **Windows firewall on private
  networks** (the same prompt the HTTP server triggers). If that is blocked, the QR code
  and the 4-letter room code still work.
- Tested on the family's machines and in CI; no telemetry, no cloud, no internet
  requirement.
