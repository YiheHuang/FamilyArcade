# Switching from the old (Electron) shell

The 101 MB Electron build is retired (its source was removed from the repository after
v2.2.1; the installers stay on GitHub Releases / in git history). Family machines move
over once:

1. Install or patch the **last Electron build (v2.2.1)** — released as
   `Splendor-Patch-2.2.1.exe` — and open it once.
2. *Settings → Data backup → Export data* (writes `splendor-backup-<date>.json` with
   settings, the saved game and every record).
3. Install **Splendor-Setup-&lt;version&gt;.exe** (per-user, no admin) and start it.
4. *Settings → Data backup → Import data* and pick the file from step 2.
5. Uninstall the old “Splendor” entry from *Apps & features* (user data is untouched).

From then on the app updates itself from the LAN source, and one upgraded machine can
publish or share the new version for everyone else. See [Updates](updates.md).
