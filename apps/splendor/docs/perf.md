# Performance snapshot

Measured on the development machine with `node scripts/dev/perf-check.mjs`
(the same command can be re-run after any change to keep the numbers honest).

| Metric | Value |
| --- | --- |
| Version | 2.3.1 |
| Cold start (spawn → HTTP `/healthz` answering) | 173 ms |
| Time to mounted UI | 768 ms |
| Idle memory (app + WebView2 children) | 26 MB |
| Installed footprint (exe + runtime DLLs) | 30.53 MB |
| Installer | 3.58 MB |
| Measured at | 2026-10-19 |

Notes:

- The Chromium runtime is **not** bundled: the app uses the system WebView2 (shared by
  every WebView2 app on the machine), which is where the size difference comes from.
- LAN hosting, the embedded frontend and the updater all run inside the same executable.
