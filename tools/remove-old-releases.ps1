$ErrorActionPreference = 'Stop'
$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$keep = @('family-arcade-v3.1.0', 'game-packages-v3.1.0', 'webview2-runtime-v1.0.0')
$releases = Invoke-RestMethod -Headers $headers -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/releases?per_page=100' -TimeoutSec 60

foreach ($release in $releases) {
  if ($keep -contains $release.tag_name) { continue }
  Write-Host "delete release $($release.tag_name)"
  try {
    Invoke-RestMethod -Method Delete -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/$($release.id)" -TimeoutSec 60 | Out-Null
    try {
      Invoke-RestMethod -Method Delete -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/git/refs/tags/$($release.tag_name)" -TimeoutSec 30 | Out-Null
    } catch {
      Write-Host "tag already gone or protected: $($release.tag_name)"
    }
  } catch {
    Write-Host "could not delete $($release.tag_name): $($_.Exception.Message)"
  }
}
Write-Host 'old releases cleaned'
