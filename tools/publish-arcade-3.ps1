$ErrorActionPreference = 'Stop'
$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$root = Split-Path -Parent $PSScriptRoot
$tag = 'family-arcade-v3.0.0'
$name = 'Family Arcade 3.0.0 — 53 games'
$body = @'
Three launchers, one family library.

- **Offline** — `FamilyArcade_3.0.0_x64-setup.exe`: all 53 games plus the WebView2 offline runtime.
- **Slim** — `FamilyArcade_3.0.0_slim_x64-setup.exe`: all 53 games, no bundled runtime; WebView2 is installed by the small bootstrapper if needed.
- **Lite** — `FamilyArcade_Lite_3.0.0_x64-setup.exe`: about 8 MB; installs only the games you choose, and checks/installs WebView2 before opening.

Lite game packages are in the `game-packages-v3.0.0` release. All games are offline, bilingual, and support AI, hot-seat and LAN.
'@

try {
  $release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/tags/$tag" -TimeoutSec 30
  Write-Host "exists $tag"
} catch {
  $payload = @{ tag_name = $tag; name = $name; body = $body; draft = $false; prerelease = $false } | ConvertTo-Json
  $release = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/releases' -TimeoutSec 60
  Write-Host "created $tag"
}

$assets = @(
  @{ path = 'releases\family-arcade\FamilyArcade_3.0.0_x64-setup.exe'; name = 'FamilyArcade_3.0.0_x64-setup.exe' },
  @{ path = 'releases\family-arcade\FamilyArcade_3.0.0_slim_x64-setup.exe'; name = 'FamilyArcade_3.0.0_slim_x64-setup.exe' },
  @{ path = 'releases\family-arcade\FamilyArcade_Lite_3.0.0_x64-setup.exe'; name = 'FamilyArcade_Lite_3.0.0_x64-setup.exe' }
)

foreach ($asset in $assets) {
  $full = Join-Path $root $asset.path
  if (-not (Test-Path $full)) { throw "missing $($asset.path)" }
  $existing = $release.assets | Where-Object { $_.name -eq $asset.name }
  if ($existing) {
    Invoke-RestMethod -Method Delete -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/assets/$($existing.id)" -TimeoutSec 30 | Out-Null
    Write-Host "removed old $($asset.name)"
  }
  $url = "https://uploads.github.com/repos/YiheHuang/FamilyArcade/releases/$($release.id)/assets?name=$($asset.name)"
  $uploaded = $false
  for ($attempt = 1; $attempt -le 3 -and -not $uploaded; $attempt++) {
    & curl.exe -L --fail --retry 3 --retry-delay 5 -X POST `
      -H "Authorization: Bearer $token" `
      -H "Content-Type: application/octet-stream" `
      --data-binary "@$full" `
      $url
    if ($LASTEXITCODE -eq 0) {
      Write-Host "uploaded $($asset.name)"
      $uploaded = $true
    } else {
      Write-Host "retry $attempt $($asset.name)"
      Start-Sleep -Seconds 5
    }
  }
  if (-not $uploaded) { throw "FAILED $($asset.name)" }
}
Write-Host 'launchers published'
