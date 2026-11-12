$ErrorActionPreference = 'Stop'
$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root 'releases\manifest.json') -Raw | ConvertFrom-Json
$newGames = @(
  'gomoku','xiangqi','chess','go','shogi','intl-draughts','jungle-chess',
  'hearts','spades','rummy-500','cribbage','abalone','hive','quarto','president'
)

function Publish-Asset($item, $tag, $name, $body) {
  try {
    $release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/tags/$tag" -TimeoutSec 30
    Write-Host "exists $tag"
  } catch {
    $payload = @{ tag_name = $tag; name = $name; body = $body; draft = $false; prerelease = $false } | ConvertTo-Json
    $release = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/releases' -TimeoutSec 60
    Write-Host "created $tag"
  }
  $assetName = Split-Path $item.file -Leaf
  $assetPath = Join-Path $root ($item.file -replace '/', '\')
  $exists = $release.assets | Where-Object { $_.name -eq $assetName }
  if ($exists) {
    Write-Host "asset already present $assetName"
    return
  }
  $uploaded = $false
  for ($attempt = 1; $attempt -le 3 -and -not $uploaded; $attempt++) {
    try {
      $uploadHeaders = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/octet-stream' }
      Invoke-RestMethod -Method Post -Headers $uploadHeaders -InFile $assetPath -Uri "https://uploads.github.com/repos/YiheHuang/FamilyArcade/releases/$($release.id)/assets?name=$assetName" -TimeoutSec 900 | Out-Null
      Write-Host "uploaded $assetName"
      $uploaded = $true
    } catch {
      Write-Host "upload retry $attempt $assetName : $($_.Exception.Message)"
      Start-Sleep -Seconds 3
    }
  }
  if (-not $uploaded) { throw "FAILED $tag $assetName" }
}

foreach ($slug in $newGames) {
  $item = $manifest | Where-Object { $_.slug -eq $slug }
  if (-not $item) { Write-Host "missing manifest entry $slug"; continue }
  $tag = "$slug-v$($item.version)"
  $body = "Lightweight Windows installer for **$($item.name)**.`n`nAI, hot-seat and LAN are included. Offline, no account, no ads. See the game README for rules and honest limitations."
  Publish-Asset $item $tag "$($item.name) v$($item.version)" $body
}

$hub = $manifest | Where-Object { $_.slug -eq 'family-arcade' }
if ($hub) {
  $hubBody = "All-in-one Family Arcade launcher: **42 games**, the WebView2 offline runtime and every portable game in one installer.`n`nEvery game has AI, hot-seat and LAN. Per-game installers are also available under Releases."
  Publish-Asset $hub "family-arcade-v$($hub.version)" "Family Arcade $($hub.version) — all 42 games" $hubBody
}

Write-Host 'publish done'
