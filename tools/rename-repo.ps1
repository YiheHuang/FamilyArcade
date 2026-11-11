$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$body = @{ name = 'FamilyArcade'; description = 'Family Arcade — 27 offline family games with AI, hot-seat, LAN and per-game installers' } | ConvertTo-Json
try {
  $r = Invoke-RestMethod -Method Patch -Headers $headers -ContentType 'application/json' -Body $body -Uri 'https://api.github.com/repos/YiheHuang/Table27' -TimeoutSec 30
  "renamed: $($r.full_name)"
  "ssh: $($r.ssh_url)"
} catch {
  "error: $($_.Exception.Message)"
}
