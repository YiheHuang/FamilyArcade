#requires -Version 5.1
<#
    Hard release gate for Family Arcade Mobile.

    Refuses to publish unless the 53-game verification matrix, screenshots,
    APK contents, package metadata and report all agree. Run manually:
        powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\verify-release.ps1
#>
[CmdletBinding()]
param(
    [string]$Repo,
    [string]$Version = '3.2.0'
)

$ErrorActionPreference = 'Stop'
if (-not $Repo) {
    $Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}
$verificationPath = Join-Path $Repo 'docs\android-verification.json'
$reportPath = Join-Path $Repo 'docs\android-report.md'
$apkPath = Join-Path $Repo "releases\android\FamilyArcade_$Version.apk"
$gatePath = Join-Path $Repo 'docs\android-release-gate.json'

$failures = [System.Collections.Generic.List[string]]::new()

function Check {
    param([bool]$Condition, [string]$Message)
    if ($Condition) {
        Write-Host "OK   $Message"
    }
    else {
        Write-Host "FAIL $Message"
        $failures.Add($Message)
    }
}

function Test-Ratio {
    param([string]$Value, [string]$Label, [int]$MinimumTotal)
    if ($Value -match '^(\d+)/(\d+)$') {
        $passed = [int]$Matches[1]
        $total = [int]$Matches[2]
        Check ($total -ge $MinimumTotal -and $passed -eq $total) "$Label $Value (need $MinimumTotal/$MinimumTotal or better)"
    }
    else {
        Check $false "$Label missing or invalid: '$Value'"
    }
}

Check (Test-Path $verificationPath) "verification matrix exists"
Check (Test-Path $reportPath) "android report exists"
Check (Test-Path $apkPath) "APK exists"

if (-not (Test-Path $verificationPath) -or -not (Test-Path $apkPath)) {
    Write-Host ''
    Write-Host 'Release gate failed: required artifacts are missing.'
    exit 1
}

$verification = Get-Content -Raw -Path $verificationPath | ConvertFrom-Json
$games = @($verification.games)
$lan = @($verification.lan)

Check ($verification.version -eq $Version) "verification version is $Version"
Check ($games.Count -eq 53) "verification covers 53 games (got $($games.Count))"
Check ($verification.summary.games -eq 53) 'summary.games is 53'
Check ($verification.summary.passed -eq 53) 'summary.passed is 53'
Check ($verification.summary.failed -eq 0) 'summary.failed is 0'

$badGames = @($games | Where-Object { $_.status -ne 'pass' })
Check ($badGames.Count -eq 0) "all 53 game rows pass (failed: $($badGames.Count))"

$missingShots = [System.Collections.Generic.List[string]]::new()
foreach ($game in $games) {
    if ([string]::IsNullOrWhiteSpace($game.slug) -or [string]::IsNullOrWhiteSpace($game.screenshot)) {
        $missingShots.Add("$($game.slug) (no screenshot path)")
        continue
    }
    $shot = Join-Path $Repo $game.screenshot
    if (-not (Test-Path $shot)) {
        $missingShots.Add("$($game.slug) (missing)")
    }
    elseif ((Get-Item $shot).Length -lt 8000) {
        $missingShots.Add("$($game.slug) (suspiciously small)")
    }
}
Check ($missingShots.Count -eq 0) "53 game screenshots exist and are non-trivial (bad: $($missingShots.Count))"
if ($missingShots.Count -gt 0) {
    Write-Host ('     ' + (($missingShots | Select-Object -First 10) -join ', '))
}

Check ($verification.device.api -eq 35) 'verification ran on Android API 35'
Check (@('emulator', 'device') -contains $verification.device.kind) 'verification ran on an emulator or device'

Test-Ratio $verification.checks.checkAll 'checkAll' 53
Test-Ratio $verification.checks.e2e 'e2e' 52
Test-Ratio $verification.checks.lanE2e 'lanE2e' 31

$androidLan = @($lan | Where-Object { $_.kind -eq 'android-host' -and $_.status -eq 'pass' })
Check ($androidLan.Count -ge 1) 'at least one Android-hosted LAN match passed'
Check ($lan.Count -ge 1) 'LAN evidence is present'

$playtestPath = Join-Path $Repo 'docs\android-playtest.json'
Check (Test-Path $playtestPath) 'subagent playtest matrix exists'
if (Test-Path $playtestPath) {
    $playtest = Get-Content -Raw -Path $playtestPath | ConvertFrom-Json
    $playtestGames = @($playtest.games)
    Check ($playtest.version -eq $Version) "playtest version is $Version"
    Check ($playtest.agents -ge 10) "at least 10 playtest subagents (got $($playtest.agents))"
    Check ($playtestGames.Count -eq 53) "playtest covers 53 games (got $($playtestGames.Count))"
    Check ($playtest.summary.games -eq 53) 'playtest summary.games is 53'
    Check ($playtest.summary.passed -eq 53) 'playtest summary.passed is 53'
    Check ($playtest.summary.failed -eq 0) 'playtest summary.failed is 0'
    Check ($playtest.summary.p0 -eq 0) 'playtest has zero unresolved P0 issues'
    Check ($playtest.summary.p1 -eq 0) 'playtest has zero unresolved P1 issues'

    $badPlaytest = @($playtestGames | Where-Object { $_.verdict -ne 'pass' })
    Check ($badPlaytest.Count -eq 0) "all 53 subagent verdicts pass (failed: $($badPlaytest.Count))"

    $missingPlayShots = [System.Collections.Generic.List[string]]::new()
    foreach ($game in $playtestGames) {
        $shots = @($game.screenshots)
        if ($shots.Count -lt 2) {
            $missingPlayShots.Add("$($game.slug) (fewer than 2 screenshots)")
            continue
        }
        foreach ($shotPath in $shots) {
            $shot = Join-Path $Repo $shotPath
            if (-not (Test-Path $shot)) {
                $missingPlayShots.Add("$($game.slug) (missing $shotPath)")
            }
            elseif ((Get-Item $shot).Length -lt 8000) {
                $missingPlayShots.Add("$($game.slug) (small $shotPath)")
            }
        }
    }
    Check ($missingPlayShots.Count -eq 0) "53 games have at least 2 non-trivial playtest screenshots (bad: $($missingPlayShots.Count))"
    if ($missingPlayShots.Count -gt 0) {
        Write-Host ('     ' + (($missingPlayShots | Select-Object -First 10) -join ', '))
    }
}

$apk = Get-Item $apkPath
Check ($apk.Length -gt 10MB) ("APK is larger than 10 MB ({0:N1} MB)" -f ($apk.Length / 1MB))

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$aapt = Get-ChildItem (Join-Path $sdk 'build-tools') -Recurse -Filter aapt.exe -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1
Check ([bool]$aapt) 'aapt is available'
if ($aapt) {
    $badging = (& $aapt.FullName dump badging $apkPath 2>&1 | Out-String)
    Check ($badging -match "package: name='com\.familyarcade\.mobile'") 'APK package is com.familyarcade.mobile'
    Check ($badging -match "versionName='$([regex]::Escape($Version))'") "APK versionName is $Version"
    Check ($badging -match "sdkVersion:'26'") 'APK minSdk is 26'
    Check ($badging -match "targetSdkVersion:'35'") 'APK targetSdk is 35'
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($apkPath)
try {
    $entries = @($zip.Entries | ForEach-Object { $_.FullName })
    Check ($entries -contains 'assets/www/index.html') 'APK contains assets/www/index.html'
    $gameIndexes = @($entries | Where-Object { $_ -match '^assets/games/[^/]+/index\.html$' })
    $gameSlugs = @($gameIndexes | ForEach-Object { ($_ -split '/')[2] } | Sort-Object -Unique)
    Check ($gameSlugs.Count -eq 53) "APK bundles 53 game folders (got $($gameSlugs.Count))"
}
finally {
    $zip.Dispose()
}

$hash = (Get-FileHash -Path $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
$result = [ordered]@{
    ok = ($failures.Count -eq 0)
    checkedAt = (Get-Date).ToString('o')
    version = $Version
    apk = "releases/android/FamilyArcade_$Version.apk"
    apkBytes = $apk.Length
    apkSha256 = $hash
    games = $games.Count
    lanChecks = $lan.Count
    playtestAgents = if ($playtest) { $playtest.agents } else { 0 }
    playtestGames = if ($playtestGames) { $playtestGames.Count } else { 0 }
    failures = @($failures)
}
$result | ConvertTo-Json -Depth 6 | Set-Content -Path $gatePath -Encoding UTF8

Write-Host ''
if ($failures.Count -eq 0) {
    Write-Host "RELEASE GATE PASSED — $($games.Count)/53 games, SHA256 $hash"
    exit 0
}

Write-Host "RELEASE GATE FAILED — $($failures.Count) blocker(s). Do not publish."
exit 1
