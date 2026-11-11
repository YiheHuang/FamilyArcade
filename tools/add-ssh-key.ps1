$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$key = Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" -Raw
$payload = @{ title = 'Family Arcade build machine'; key = $key.Trim() } | ConvertTo-Json
try {
  $r = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -Uri 'https://api.github.com/user/keys' -TimeoutSec 30
  "added key $($r.id)"
} catch {
  "error: $($_.Exception.Message)"
}
