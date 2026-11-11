$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$key = (Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" -Raw).Trim()
$payload = @{ title = 'Family Arcade build machine'; key = $key; read_only = $false } | ConvertTo-Json
try {
  $r = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/keys' -TimeoutSec 30
  "deploy key added $($r.id)"
} catch {
  "error: $($_.Exception.Message)"
}
