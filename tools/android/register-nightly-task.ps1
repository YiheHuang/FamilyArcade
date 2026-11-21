#requires -Version 5.1
<#
    Registers the one-shot Family Arcade Android overnight build task.

    Defaults to the next 01:00 local time. Re-run with -At to move it.
        powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\register-nightly-task.ps1
        powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\register-nightly-task.ps1 -At "2026-11-22 01:00"
#>
[CmdletBinding()]
param(
    [datetime]$At
)

$ErrorActionPreference = 'Stop'
$taskName = 'FamilyArcade Android 3.2.0 Build'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runner = Join-Path $PSScriptRoot 'run-nightly.ps1'

if (-not $At) {
    $todayAtOne = (Get-Date).Date.AddHours(1)
    $At = if ((Get-Date) -lt $todayAtOne) { $todayAtOne } else { $todayAtOne.AddDays(1) }
}

if (-not (Test-Path $runner)) {
    throw "Runner not found: $runner"
}

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $runner) `
    -WorkingDirectory $repo

$trigger = New-ScheduledTaskTrigger -Once -At $At

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -WakeToRun `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 8) `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
    -UserId ('{0}\{1}' -f $env:USERDOMAIN, $env:USERNAME) `
    -LogonType Interactive `
    -RunLevel Limited

$description = 'One-shot overnight OpenCode build and verification of the Family Arcade Android app (53 games, LAN host, responsive phone/tablet UI).'

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description $description `
    -Force | Out-Null

$task = Get-ScheduledTask -TaskName $taskName
$info = Get-ScheduledTaskInfo -TaskName $taskName

[pscustomobject]@{
    TaskName    = $task.TaskName
    State       = $task.State
    NextRunTime = $info.NextRunTime
    Action      = $task.Actions[0].Execute + ' ' + $task.Actions[0].Arguments
    WorkDir     = $task.Actions[0].WorkingDirectory
    WakeToRun   = $task.Settings.WakeToRun
    StartWhenAvailable = $task.Settings.StartWhenAvailable
    TimeLimit   = $task.Settings.ExecutionTimeLimit
} | Format-List
