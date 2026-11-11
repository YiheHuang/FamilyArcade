$ErrorActionPreference = 'Stop'
$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$root = 'C:\Users\Yihe Huang\yihe\FamilyArcade'
$file = Join-Path $root 'releases\family-arcade\FamilyArcade_1.0.1_x64-setup.exe'
$payload = @{ tag_name = 'family-arcade-v1.0.1'; name = 'Family Arcade 1.0.1 — all games'; body = 'Fixes launching portable games from older home directories by self-healing WebView2Loader.dll. Includes the WebView2 offline runtime, all 27 games and the launcher.'; draft = $false; prerelease = $false } | ConvertTo-Json
try {
  $release = Invoke-RestMethod -Headers $headers -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/releases/tags/family-arcade-v1.0.1' -TimeoutSec 30
} catch {
  $release = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/releases' -TimeoutSec 60
}
foreach ($asset in $release.assets) {
  Invoke-RestMethod -Method Delete -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/assets/$($asset.id)" -TimeoutSec 30
}
$uploadHeaders = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/octet-stream' }
Invoke-RestMethod -Method Post -Headers $uploadHeaders -InFile $file -Uri "https://uploads.github.com/repos/YiheHuang/FamilyArcade/releases/$($release.id)/assets?name=FamilyArcade_1.0.1_x64-setup.exe" -TimeoutSec 600 | Out-Null
Write-Host 'uploaded 1.0.1'
