$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
try {
  $r = Invoke-WebRequest -Headers $headers -Uri 'https://api.github.com/user' -TimeoutSec 30
  "status $($r.StatusCode)"
  $r.Headers.GetEnumerator() | Where-Object { $_.Key -match 'scope|ratelimit' } | ForEach-Object { "$($_.Key): $($_.Value)" }
} catch {
  "error: $($_.Exception.Message)"
}
