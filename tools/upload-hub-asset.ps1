$ErrorActionPreference = 'Stop'
$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root 'releases\manifest.json') -Raw | ConvertFrom-Json
$hub = $manifest | Where-Object { $_.slug -eq 'family-arcade' }
$tag = "family-arcade-v$($hub.version)"
$release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/tags/$tag" -TimeoutSec 30
$assetName = Split-Path $hub.file -Leaf
$existing = $release.assets | Where-Object { $_.name -eq $assetName }
if ($existing) {
  Write-Host "asset already present: $($existing.size) bytes"
  exit 0
}
$assetPath = Join-Path $root ($hub.file -replace '/', '\')
$url = "https://uploads.github.com/repos/YiheHuang/FamilyArcade/releases/$($release.id)/assets?name=$assetName"
& curl.exe -L --fail --retry 3 --retry-delay 5 -X POST `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/octet-stream" `
  --data-binary "@$assetPath" `
  $url
if ($LASTEXITCODE -ne 0) { throw "curl upload failed with exit code $LASTEXITCODE" }
Write-Host "uploaded $assetName"
