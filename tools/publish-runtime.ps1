$ErrorActionPreference = 'Stop'
$cred = cmd /c "git credential fill < $env:TEMP\cred.txt" 2>&1
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$root = 'C:\Users\Yihe Huang\yihe\FamilyArcade'
$src = (Get-ChildItem "$env:LOCALAPPDATA\tauri\x64" -Recurse -Filter 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe' | Select-Object -First 1).FullName
if (-not $src) { throw 'WebView2 offline installer not found' }
$dir = Join-Path $root 'releases\webview2-runtime'
New-Item -ItemType Directory $dir -Force | Out-Null
$dest = Join-Path $dir 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
Copy-Item $src $dest -Force
$payload = @{ tag_name = 'webview2-runtime-v1.0.0'; name = 'WebView2 Runtime (offline, x64)'; body = 'Microsoft Edge WebView2 Evergreen Runtime offline installer, x64. Use this once if a per-game installer reports that WebView2 is missing. The Family Arcade all-in-one installer already includes this runtime.'; draft = $false; prerelease = $false } | ConvertTo-Json
try {
  $release = Invoke-RestMethod -Headers $headers -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/releases/tags/webview2-runtime-v1.0.0' -TimeoutSec 30
  Write-Host 'release exists'
} catch {
  $release = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -Uri 'https://api.github.com/repos/YiheHuang/FamilyArcade/releases' -TimeoutSec 60
  Write-Host 'release created'
}
foreach ($asset in $release.assets) {
  Invoke-RestMethod -Method Delete -Headers $headers -Uri "https://api.github.com/repos/YiheHuang/FamilyArcade/releases/assets/$($asset.id)" -TimeoutSec 30
}
$uploadHeaders = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/octet-stream' }
Invoke-RestMethod -Method Post -Headers $uploadHeaders -InFile $dest -Uri "https://uploads.github.com/repos/YiheHuang/FamilyArcade/releases/$($release.id)/assets?name=MicrosoftEdgeWebView2RuntimeInstallerX64.exe" -TimeoutSec 900 | Out-Null
Write-Host 'runtime uploaded'
