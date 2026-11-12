$ErrorActionPreference = 'Stop'
$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$root = 'C:\Users\Yihe Huang\yihe\FamilyArcade'
Copy-Item 'T:\target\release\bundle\nsis\Family Arcade_1.0.2_x64-setup.exe' (Join-Path $root 'releases\family-arcade\FamilyArcade_1.0.2_x64-setup.exe') -Force
$file = Join-Path $root 'releases\family-arcade\FamilyArcade_1.0.2_x64-setup.exe'
$payload = @{ tag_name = 'family-arcade-v1.0.2'; name = 'Family Arcade 1.0.2 — all games'; body = 'Clean English/Chinese launcher UI, self-healing WebView2Loader for portable games, WebView2 offline runtime, all 27 games.'; draft = $false; prerelease = $false } | ConvertTo-Json
try { $release = Invoke-RestMethod -Headers $headers -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/releases/tags/family-arcade-v1.0.2' -TimeoutSec 30 } catch { $release = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/releases' -TimeoutSec 60 }
foreach ($asset in $release.assets) { Invoke-RestMethod -Method Delete -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/assets/$($asset.id)" -TimeoutSec 30 }
$uploadHeaders = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/octet-stream' }
Invoke-RestMethod -Method Post -Headers $uploadHeaders -InFile $file -Uri "https://uploads.github.com/repos/YiheHuang/FamilyArcade/releases/$($release.id)/assets?name=FamilyArcade_1.0.2_x64-setup.exe" -TimeoutSec 600 | Out-Null
Write-Host 'uploaded 1.0.2'
