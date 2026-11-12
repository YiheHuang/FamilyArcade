$ErrorActionPreference = 'Stop'
$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
foreach ($v in @('1.0.0','1.0.1')) {
  try {
    $r = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/tags/family-arcade-v$v" -TimeoutSec 30
    Invoke-RestMethod -Method Delete -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/$($r.id)" -TimeoutSec 30
    Invoke-RestMethod -Method Delete -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/git/refs/tags/family-arcade-v$v" -TimeoutSec 30
    Write-Host "deleted $v"
  } catch { Write-Host "$v absent" }
}
