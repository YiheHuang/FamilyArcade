$ErrorActionPreference = 'Stop'
$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$root = 'C:\Users\Yihe Huang\yihe\FamilyArcade'
$source = Join-Path $root 'releases\family-arcade\FamilyArcade_1.0.0_x64-setup.exe'
Copy-Item 'T:\target\release\bundle\nsis\Family Arcade_1.0.0_x64-setup.exe' $source -Force
$release = Invoke-RestMethod -Headers $headers -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/releases/tags/family-arcade-v1.0.0' -TimeoutSec 30
foreach ($asset in $release.assets) {
  Invoke-RestMethod -Method Delete -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/assets/$($asset.id)" -TimeoutSec 30
  Write-Host "deleted old $($asset.name)"
}
$uploadHeaders = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/octet-stream' }
Invoke-RestMethod -Method Post -Headers $uploadHeaders -InFile $source -Uri "https://uploads.github.com/repos/YiheHuang/FamilyArcade/releases/$($release.id)/assets?name=FamilyArcade_1.0.0_x64-setup.exe" -TimeoutSec 600 | Out-Null
Write-Host "uploaded FamilyArcade_1.0.0_x64-setup.exe"
