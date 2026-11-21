# Android overnight build schedule

The one-shot Windows task **FamilyArcade Android 3.2.0 Build** runs at
**2026-11-22 01:00 local time**. It starts a headless OpenCode session that follows
`tools/android/NIGHTLY_PROMPT.md`:

- builds one `com.familyarcade.mobile` app with all 53 games in `assets/`;
- adds an embedded HTTP + WebSocket LAN host so the phone can host rooms;
- adapts the Hub to phones and tablets;
- verifies the Hub, games and LAN play;
- writes `releases/android/FamilyArcade_3.2.0.apk` and `docs/android-report.md`;
- commits on a new `android-mobile` branch and does not push.

## Task settings

- Trigger: once, 2026-11-22 01:00
- Wake the computer: enabled
- Start when available: enabled (catches up if the PC was asleep)
- Execution limit: 8 hours
- Runs as the current user, interactive session (needed for Gradle, browser and
  emulator work)
- Working directory: repository root

## Logs and results

- Summary: `tools/android/logs/nightly-<timestamp>.summary.log`
- Agent stdout: `tools/android/logs/nightly-<timestamp>.out.log`
- Agent stderr: `tools/android/logs/nightly-<timestamp>.err.log`
- APK: `releases/android/FamilyArcade_3.2.0.apk`
- Report: `docs/android-report.md`

`*.log` is already ignored by git.

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
