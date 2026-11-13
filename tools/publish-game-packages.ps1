$ErrorActionPreference = 'Stop'
$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$root = Split-Path -Parent $PSScriptRoot
$packages = Join-Path $root 'releases\packages'
$tag = 'game-packages-v3.1.0'
$name = 'Family Arcade game packages 3.1.0'
$body = @'
Portable ZIP packages for **Family Arcade Lite**.

Download the Lite launcher, open Settings, and install only the games you want. Each package contains the portable Tauri game, its web bundle and `WebView2Loader.dll`.

The full offline and slim launchers are available in the `family-arcade-v3.1.0` release.
'@

try {
  $release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/tags/$tag" -TimeoutSec 30
  Write-Host "exists $tag"
} catch {
  $payload = @{ tag_name = $tag; name = $name; body = $body; draft = $false; prerelease = $false } | ConvertTo-Json
  $release = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/releases' -TimeoutSec 60
  Write-Host "created $tag"
}

$files = @(Join-Path $packages 'packages.json')
$files += Get-ChildItem $packages -Filter *.zip | Sort-Object Name | Select-Object -ExpandProperty FullName

foreach ($file in $files) {
  $assetName = Split-Path $file -Leaf
  $exists = $release.assets | Where-Object { $_.name -eq $assetName }
  if ($exists -and $assetName -eq 'packages.json') {
    Invoke-RestMethod -Method Delete -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/assets/$($exists.id)" -TimeoutSec 30 | Out-Null
    Write-Host "replaced catalog $assetName"
  } elseif ($exists) {
    Write-Host "skip $assetName"
    continue
  }
  $uploaded = $false
  for ($attempt = 1; $attempt -le 3 -and -not $uploaded; $attempt++) {
    try {
      $uploadHeaders = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/octet-stream' }
      Invoke-RestMethod -Method Post -Headers $uploadHeaders -InFile $file -Uri "https://uploads.github.com/repos/YiheHuang/FamilyArcade/releases/$($release.id)/assets?name=$assetName" -TimeoutSec 600 | Out-Null
      Write-Host "uploaded $assetName"
      $uploaded = $true
    } catch {
      Write-Host "retry $attempt $assetName : $($_.Exception.Message)"
      Start-Sleep -Seconds 3
    }
  }
  if (-not $uploaded) { throw "FAILED $assetName" }
}
Write-Host 'packages published'
