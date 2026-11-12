$ErrorActionPreference = 'Stop'
$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$root = Split-Path -Parent $PSScriptRoot
$tag = 'family-arcade-v2.0.0'
$assetName = 'FamilyArcade_2.0.0_slim_x64-setup.exe'
$assetPath = Join-Path $root "releases\family-arcade\$assetName"
$release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/tags/$tag" -TimeoutSec 30
$existing = $release.assets | Where-Object { $_.name -eq $assetName }
if ($existing) {
  Write-Host "asset already present: $($existing.size) bytes"
  exit 0
}
$url = "https://uploads.github.com/repos/YiheHuang/FamilyArcade/releases/$($release.id)/assets?name=$assetName"
& curl.exe -L --fail --retry 3 --retry-delay 5 -X POST `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/octet-stream" `
  --data-binary "@$assetPath" `
  $url
if ($LASTEXITCODE -ne 0) { throw "curl upload failed with exit code $LASTEXITCODE" }
Write-Host "uploaded $assetName"
