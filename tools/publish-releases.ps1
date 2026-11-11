$ErrorActionPreference = 'Stop'
$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$root = 'C:\Users\Yihe Huang\yihe\Table27'
$manifest = Get-Content (Join-Path $root 'releases\manifest.json') -Raw | ConvertFrom-Json

foreach ($item in $manifest) {
  $tag = if ($item.slug -eq 'family-arcade') { 'family-arcade-v1.0.0' } else { "$($item.slug)-v$($item.version)" }
  $name = if ($item.slug -eq 'family-arcade') { 'Family Arcade 1.0.0 — all games' } else { "$($item.name) v$($item.version)" }
  $bodyText = if ($item.slug -eq 'family-arcade') {
    "All-in-one Family Arcade launcher: 27 games, one installer.`n`nEvery game launches as its own portable Tauri app with AI, hot-seat and LAN. The per-game releases are also available."
  } else {
    "Lightweight Windows installer for **$($item.name)**.`n`nAI, hot-seat and LAN are included. See the repository README for the other games and honest limitations."
  }
  try {
    $existing = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/tags/$tag" -Proxy http://127.0.0.1:8888 -TimeoutSec 30
    $release = $existing
    Write-Host "exists $tag"
  } catch {
    $payload = @{ tag_name = $tag; name = $name; body = $bodyText; draft = $false; prerelease = $false } | ConvertTo-Json
    $release = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/releases' -Proxy http://127.0.0.1:8888 -TimeoutSec 60
    Write-Host "created $tag"
  }
  $assetName = Split-Path $item.file -Leaf
  $assetPath = Join-Path $root ($item.file -replace '/', '\')
  $uploaded = $false
  for ($attempt = 1; $attempt -le 3 -and -not $uploaded; $attempt++) {
    try {
      $uploadHeaders = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/octet-stream' }
      Invoke-RestMethod -Method Post -Headers $uploadHeaders -InFile $assetPath -Uri "https://uploads.github.com/repos/YiheHuang/FamilyArcade/releases/$($release.id)/assets?name=$assetName" -Proxy http://127.0.0.1:8888 -TimeoutSec 600 | Out-Null
      Write-Host "uploaded $assetName"
      $uploaded = $true
    } catch {
      Write-Host "upload retry $attempt $assetName : $($_.Exception.Message)"
      Start-Sleep -Seconds 2
    }
  }
  if (-not $uploaded) { Write-Host "FAILED $tag $assetName" }
}
Write-Host 'publish done'
