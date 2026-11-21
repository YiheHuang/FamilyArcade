#requires -Version 5.1
<#
    Family Arcade Android overnight build runner.

    Registered as a one-shot Windows Scheduled Task for 2026-11-22 01:00.
    Starts a headless OpenCode session that reads NIGHTLY_PROMPT.md, builds the
    Android app, verifies it, and writes docs/android-report.md.

    Manual run:
        powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\run-nightly.ps1
    Command-only check:
        powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\run-nightly.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$logDir = Join-Path $PSScriptRoot 'logs'
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$stdoutLog = Join-Path $logDir "nightly-$stamp.out.log"
$stderrLog = Join-Path $logDir "nightly-$stamp.err.log"
$summaryLog = Join-Path $logDir "nightly-$stamp.summary.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Summary {
    param([string]$Message)
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $summaryLog -Value $line -Encoding UTF8
    Write-Host $line
}

$cliCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\ai.opencode.desktop\resources\opencode-cli.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\opencode\opencode.exe')
)
$cli = $cliCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $cli) {
    $cmd = Get-Command opencode -ErrorAction SilentlyContinue
    if ($cmd) { $cli = $cmd.Source }
}
if (-not $cli) {
    Write-Summary 'BLOCKER: OpenCode CLI not found.'
    exit 2
}

$javaHome = 'C:\Program Files\Java\jdk-21.0.10'
if (Test-Path $javaHome) {
    $env:JAVA_HOME = $javaHome
    $env:PATH = "$javaHome\bin;$env:PATH"
}
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:PATH = "$sdkRoot\platform-tools;$sdkRoot\cmdline-tools\latest\bin;$env:PATH"

$gradleBin = Join-Path $PSScriptRoot '.toolchain\gradle-8.10.2\bin'
if (Test-Path $gradleBin) {
    $env:PATH = "$gradleBin;$env:PATH"
}

$brief = Join-Path $repo 'tools\android\NIGHTLY_PROMPT.md'
if (-not (Test-Path $brief)) {
    Write-Summary "BLOCKER: brief missing at $brief"
    exit 3
}

$message = @'
Read tools/android/NIGHTLY_PROMPT.md in this repository and execute it completely and autonomously. Do not stop to ask questions. Build and verify the single Family Arcade Android app, produce releases/android/FamilyArcade_3.2.0.apk and docs/android-report.md, commit on a new android-mobile branch, and do not push. If a hard blocker remains, document the exact blocker and leave the repository clean enough to continue.
'@

$argList = @(
    'run',
    '--auto',
    '--standalone',
    '--model', 'opencode-go/deepseek-v4.1-flash',
    '--title', '"Family Arcade Android 3.2.0 overnight build"',
    $message
)

Write-Summary "Runner start. Repo=$repo"
Write-Summary "CLI=$cli"
Write-Summary "JAVA_HOME=$env:JAVA_HOME"
Write-Summary "ANDROID_HOME=$env:ANDROID_HOME"
Write-Summary "Gradle=$gradleBin"
Write-Summary "Stdout log=$stdoutLog"
Write-Summary "Stderr log=$stderrLog"

$powerSource = @'
using System;
using System.Runtime.InteropServices;
public static class FamilyArcadePower {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint esFlags);
    public const uint ES_CONTINUOUS = 0x80000000;
    public const uint ES_SYSTEM_REQUIRED = 0x00000001;
}
'@
$keepAwake = $false
try {
    Add-Type -TypeDefinition $powerSource -ErrorAction Stop
    [FamilyArcadePower]::SetThreadExecutionState(
        [FamilyArcadePower]::ES_CONTINUOUS -bor [FamilyArcadePower]::ES_SYSTEM_REQUIRED
    ) | Out-Null
    $keepAwake = $true
    Write-Summary 'Keep-awake enabled for the build'
}
catch {
    Write-Summary "WARN: keep-awake unavailable: $($_.Exception.Message)"
}

Push-Location $repo
try {
    $commit = (& git rev-parse --short HEAD 2>$null)
    $branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
    Write-Summary "Git=$branch@$commit"
}
finally {
    Pop-Location
}

if ($DryRun) {
    Write-Summary 'DryRun: command resolved successfully; OpenCode was not started.'
    Write-Summary "DryRun args: $($argList -join ' ')"
    exit 0
}

$started = Get-Date
try {
    $proc = Start-Process -FilePath $cli `
        -ArgumentList $argList `
        -WorkingDirectory $repo `
        -NoNewWindow `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog
    $exitCode = $proc.ExitCode
}
catch {
    Write-Summary "ERROR: failed to start OpenCode: $($_.Exception.Message)"
    if ($keepAwake) {
        [FamilyArcadePower]::SetThreadExecutionState([FamilyArcadePower]::ES_CONTINUOUS) | Out-Null
    }
    exit 4
}

$elapsed = (Get-Date) - $started
Write-Summary ("Runner finish. ExitCode={0} Elapsed={1:hh\:mm\:ss}" -f $exitCode, $elapsed)

Push-Location $repo
try {
    $branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
    $commit = (& git rev-parse --short HEAD 2>$null)
    $dirty = (& git status --porcelain 2>$null | Measure-Object).Count
    Write-Summary "Git after run: $branch@$commit dirtyFiles=$dirty"
    if (Test-Path 'docs\android-report.md') {
        Write-Summary "Report: $repo\docs\android-report.md"
    }
    if (Test-Path 'releases\android\FamilyArcade_3.2.0.apk') {
        $apk = Get-Item 'releases\android\FamilyArcade_3.2.0.apk'
        Write-Summary ("APK: {0} ({1:N1} MB)" -f $apk.FullName, ($apk.Length / 1MB))
    }
    else {
        Write-Summary 'APK: missing'
    }
}
finally {
    Pop-Location
}

if ($keepAwake) {
    [FamilyArcadePower]::SetThreadExecutionState([FamilyArcadePower]::ES_CONTINUOUS) | Out-Null
    Write-Summary 'Keep-awake released'
}

exit $exitCode
