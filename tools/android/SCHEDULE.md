# Android overnight build schedule

The one-shot Windows task **FamilyArcade Android 3.2.0 Build** runs at
**2026-11-22 01:00 local time**. It starts a headless OpenCode session that follows
`tools/android/NIGHTLY_PROMPT.md`:

- builds one `com.familyarcade.mobile` app with all 53 games in `assets/`;
- adds an embedded HTTP + WebSocket LAN host so the phone can host rooms;
- adapts the Hub to phones and tablets;
- launches and interacts with **all 53 games** on the Android emulator, with
  post-interaction screenshots and a 53-row evidence matrix;
- runs the existing per-game e2e suites (52) and LAN e2e suites (31) plus an
  Android-hosted LAN match;
- writes `releases/android/FamilyArcade_3.2.0.apk`, `docs/android-report.md`,
  `docs/android-verification.json` and `docs/android-shots/*.png`;
- passes `tools/android/verify-release.ps1`, then commits, pushes and publishes
  `family-arcade-android-v3.2.0`. If the gate fails, nothing is pushed or
  published.

## Task settings

- Trigger: once, 2026-11-22 01:00
- Wake the computer: enabled
- Start when available: enabled (catches up if the PC was asleep)
- Execution limit: 10 hours
- Runs as the current user, interactive session (needed for Gradle, browser and
  emulator work)
- Working directory: repository root

## Logs and results

- Summary: `tools/android/logs/nightly-<timestamp>.summary.log`
- Agent stdout: `tools/android/logs/nightly-<timestamp>.out.log`
- Agent stderr: `tools/android/logs/nightly-<timestamp>.err.log`
- APK: `releases/android/FamilyArcade_3.2.0.apk`
- Report: `docs/android-report.md`
- 53-game evidence: `docs/android-verification.json`
- Screenshots: `docs/android-shots/<slug>.png`
- Gate result: `docs/android-release-gate.json`
- Release: https://github.com/YiheHuang/FamilyArcade/releases/tag/family-arcade-android-v3.2.0

`*.log` is already ignored by git.

## Release gate

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\verify-release.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\publish-android.ps1 -DryRun
```

The gate checks 53/53 game rows, 53 non-trivial screenshots, the e2e/LAN totals,
an Android-hosted LAN pass, APK package/version/SDK metadata, and all 53 bundled
game folders. The publish script refuses to upload if the gate fails.

## Manage the task

```powershell
# Show state and next run
Get-ScheduledTask -TaskName 'FamilyArcade Android 3.2.0 Build' | Format-List
Get-ScheduledTaskInfo -TaskName 'FamilyArcade Android 3.2.0 Build'

# Start it now
Start-ScheduledTask -TaskName 'FamilyArcade Android 3.2.0 Build'

# Cancel / remove it
Stop-ScheduledTask -TaskName 'FamilyArcade Android 3.2.0 Build'
Unregister-ScheduledTask -TaskName 'FamilyArcade Android 3.2.0 Build' -Confirm:$false

# Re-register for the next 01:00
powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\register-nightly-task.ps1
```

## Manual dry run

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\run-nightly.ps1 -DryRun
```

The dry run resolves the CLI, Java, SDK and log paths but does not start the agent.
