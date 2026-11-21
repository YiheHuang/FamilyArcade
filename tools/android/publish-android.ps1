#requires -Version 5.1
<#
    Publishes the verified Family Arcade Mobile APK to GitHub Releases.
    The hard gate in verify-release.ps1 must pass first.

        powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\publish-android.ps1
        ... -DryRun     # run the gate and print the intended release without uploading
#>
[CmdletBinding()]
param(
    [string]$Repo,
    [string]$Version = '3.2.0',
    [string]$Tag = 'family-arcade-android-v3.2.0',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
if (-not $Repo) {
    $Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}
$apkPath = Join-Path $Repo "releases\android\FamilyArcade_$Version.apk"
$gateScript = Join-Path $PSScriptRoot 'verify-release.ps1'

if (-not (Test-Path $gateScript)) { throw "Missing gate script: $gateScript" }
if (-not (Test-Path $apkPath)) { throw "Missing APK: $apkPath" }

Write-Host 'Running release gate...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $gateScript -Repo $Repo -Version $Version
if ($LASTEXITCODE -ne 0) {
    throw 'Release gate failed. Nothing was published.'
}

$gate = Get-Content -Raw -Path (Join-Path $Repo 'docs\android-release-gate.json') | ConvertFrom-Json
$hash = $gate.apkSha256
$apkBytes = (Get-Item $apkPath).Length
$shaPath = Join-Path (Split-Path $apkPath -Parent) "FamilyArcade_$Version.sha256"
"$hash  FamilyArcade_$Version.apk" | Set-Content -Path $shaPath -Encoding ASCII

$name = "Family Arcade Mobile $Version - 53 games"
$body = @"
Family Arcade Mobile $Version - one Android app with all 53 family games.

- Offline first: no accounts, no ads, no telemetry.
- Responsive Hub for phones and tablets; English and Chinese UI.
- Solo vs AI, same-screen hot-seat, and LAN. The Android device can host a room and other phones or computers can join over Wi-Fi.
- Sideload APK for Android 8.0+ (API 26). Debug-signed; this is not a Play Store build.

## Verification

- 53/53 games launched and interacted with on an Android API 35 emulator.
- 52/52 existing game e2e suites passed.
- 31/31 existing LAN e2e suites passed.
- An Android-hosted LAN match was played with a second client.
- Package, version, minSdk, targetSdk and all 53 bundled game folders were checked before upload.

The full evidence is in ``docs/android-report.md`` and ``docs/android-verification.json`` in the repository.

## Install

1. Download ``FamilyArcade_$Version.apk``.
2. Allow installation from this source when Android asks.
3. Open Family Arcade and choose a game.

SHA256: ``$hash``

APK size: $([math]::Round($apkBytes / 1MB, 1)) MB
"@

$credFile = Join-Path $env:TEMP ('familyarcade-cred-' + [guid]::NewGuid().ToString('N') + '.txt')
"protocol=https`nhost=github.com`n" | Set-Content -Path $credFile -Encoding ASCII
try {
    $cred = cmd /c "git credential fill < `"$credFile`"" 2>&1
}
finally {
    Remove-Item $credFile -Force -ErrorAction SilentlyContinue
}
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=', ''
if (-not $token) { throw 'No GitHub token found through git credential fill.' }

$headers = @{
    Authorization = "Bearer $token"
    Accept = 'application/vnd.github+json'
}
$api = 'https://api.github.com/repos/YiheHuang/FamilyArcade'

if ($DryRun) {
    Write-Host ''
    Write-Host "DryRun OK: would publish $Tag"
    Write-Host "Name: $name"
    Write-Host "APK: $apkPath ($([math]::Round($apkBytes / 1MB, 1)) MB)"
    Write-Host "SHA256: $hash"
    exit 0
}

$release = $null
try {
    $release = Invoke-RestMethod -Headers $headers -Uri "$api/releases/tags/$Tag" -TimeoutSec 30
    Write-Host "Release exists: $Tag"
    $patch = @{ name = $name; body = $body; draft = $false; prerelease = $false } | ConvertTo-Json -Depth 5
    $release = Invoke-RestMethod -Method Patch -Headers $headers -ContentType 'application/json' -Body $patch -Uri "$api/releases/$($release.id)" -TimeoutSec 60
}
catch {
    $payload = @{
        tag_name = $Tag
        target_commitish = 'main'
        name = $name
        body = $body
        draft = $false
        prerelease = $false
    } | ConvertTo-Json -Depth 5
    $release = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -Uri "$api/releases" -TimeoutSec 60
    Write-Host "Release created: $Tag"
}

$assets = @(
    @{ path = $apkPath; name = "FamilyArcade_$Version.apk" },
    @{ path = $shaPath; name = "FamilyArcade_$Version.sha256" }
)

foreach ($asset in $assets) {
    $existing = @($release.assets | Where-Object { $_.name -eq $asset.name })
    foreach ($old in $existing) {
        Invoke-RestMethod -Method Delete -Headers $headers -Uri "$api/releases/assets/$($old.id)" -TimeoutSec 30 | Out-Null
        Write-Host "Removed old asset $($asset.name)"
    }

    $uploaded = $false
    for ($attempt = 1; $attempt -le 3 -and -not $uploaded; $attempt++) {
        & curl.exe -L --fail --retry 3 --retry-delay 5 -X POST `
            -H "Authorization: Bearer $token" `
            -H 'Content-Type: application/octet-stream' `
            --data-binary "@$($asset.path)" `
            "https://uploads.github.com/repos/YiheHuang/FamilyArcade/releases/$($release.id)/assets?name=$($asset.name)"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Uploaded $($asset.name)"
            $uploaded = $true
        }
        else {
            Write-Host "Retry $attempt for $($asset.name)"
            Start-Sleep -Seconds 5
        }
    }
    if (-not $uploaded) { throw "Upload failed: $($asset.name)" }
}

Write-Host ''
Write-Host "Published: https://github.com/YiheHuang/FamilyArcade/releases/tag/$Tag"
