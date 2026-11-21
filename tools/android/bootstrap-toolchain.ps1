#requires -Version 5.1
<#
    Installs the Android build toolchain used by the Family Arcade Mobile build.

    Everything goes under the current user's profile:
      %LOCALAPPDATA%\Android\Sdk        Android SDK + emulator image
      tools\android\.toolchain\gradle   Gradle distribution

    Run:
      powershell -NoProfile -ExecutionPolicy Bypass -File tools\android\bootstrap-toolchain.ps1
    Skip the large emulator image:
      ... -SkipEmulator
#>
[CmdletBinding()]
param(
    [switch]$SkipEmulator
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$toolchain = Join-Path $PSScriptRoot '.toolchain'
$gradleVersion = '8.10.2'
$gradleHome = Join-Path $toolchain "gradle-$gradleVersion"
$cmdlineZip = Join-Path $env:TEMP 'commandlinetools-win-11076708_latest.zip'
$cmdlineUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
$gradleZip = Join-Path $toolchain "gradle-$gradleVersion-bin.zip"
$gradleUrl = "https://services.gradle.org/distributions/gradle-$gradleVersion-bin.zip"

function Write-Step {
    param([string]$Message)
    Write-Host ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message)
}

$javaHome = 'C:\Program Files\Java\jdk-21.0.10'
if (-not (Test-Path (Join-Path $javaHome 'bin\java.exe'))) {
    throw "JDK 21 not found at $javaHome"
}
$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"

New-Item -ItemType Directory -Force -Path $sdk, $toolchain | Out-Null

$cmdlineRoot = Join-Path $sdk 'cmdline-tools\latest'
$sdkManager = Join-Path $cmdlineRoot 'bin\sdkmanager.bat'
if (-not (Test-Path $sdkManager)) {
    Write-Step 'Downloading Android command-line tools'
    if (-not (Test-Path $cmdlineZip)) {
        Invoke-WebRequest -Uri $cmdlineUrl -OutFile $cmdlineZip -UseBasicParsing
    }
    $extract = Join-Path $env:TEMP ('cmdline-tools-' + [guid]::NewGuid().ToString('N'))
    Expand-Archive -Path $cmdlineZip -DestinationPath $extract -Force
    $source = Join-Path $extract 'cmdline-tools'
    if (-not (Test-Path (Join-Path $source 'bin\sdkmanager.bat'))) {
        throw "Unexpected command-line tools layout under $extract"
    }
    if (Test-Path $cmdlineRoot) {
        Remove-Item $cmdlineRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $cmdlineRoot | Out-Null
    Copy-Item -Path (Join-Path $source '*') -Destination $cmdlineRoot -Recurse -Force
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path $sdkManager)) {
        throw "sdkmanager still missing after copy: $sdkManager"
    }
    Write-Step "Installed sdkmanager at $sdkManager"
}
else {
    Write-Step "sdkmanager already present at $sdkManager"
}

Write-Step 'Accepting Android SDK licenses'
$yesFile = Join-Path $env:TEMP 'android-sdk-yes.txt'
(1..200 | ForEach-Object { 'y' }) | Set-Content -Path $yesFile -Encoding ASCII
$licenseCmd = '""{0}" --sdk_root="{1}" --licenses < "{2}""' -f $sdkManager, $sdk, $yesFile
$licenseProc = Start-Process cmd.exe -ArgumentList '/c', $licenseCmd -Wait -PassThru -NoNewWindow
Remove-Item $yesFile -Force -ErrorAction SilentlyContinue
if ($licenseProc.ExitCode -ne 0 -or -not (Test-Path (Join-Path $sdk 'licenses\android-sdk-license'))) {
    throw "Android SDK license acceptance failed (exit $($licenseProc.ExitCode))"
}

$packages = @(
    'platform-tools',
    'platforms;android-35',
    'build-tools;35.0.0',
    'emulator'
)
if (-not $SkipEmulator) {
    $packages += 'system-images;android-35;google_apis;x86_64'
}

Write-Step ('Installing SDK packages: ' + ($packages -join ', '))
& $sdkManager --sdk_root=$sdk @packages
if ($LASTEXITCODE -ne 0) {
    throw "sdkmanager failed with exit code $LASTEXITCODE"
}

$required = @(
    'platform-tools\adb.exe',
    'platforms\android-35\android.jar',
    'build-tools\35.0.0\aapt2.exe',
    'emulator\emulator.exe'
)
if (-not $SkipEmulator) {
    $required += 'system-images\android-35\google_apis\x86_64'
}
foreach ($relative in $required) {
    $full = Join-Path $sdk $relative
    if (-not (Test-Path $full)) {
        throw "SDK package missing after install: $relative"
    }
}
Write-Step 'All required SDK packages are present'

if (-not (Test-Path $gradleHome)) {
    Write-Step "Downloading Gradle $gradleVersion"
    if (-not (Test-Path $gradleZip)) {
        Invoke-WebRequest -Uri $gradleUrl -OutFile $gradleZip -UseBasicParsing
    }
    Expand-Archive -Path $gradleZip -DestinationPath $toolchain -Force
    Remove-Item $gradleZip -Force -ErrorAction SilentlyContinue
}
else {
    Write-Step "Gradle already present at $gradleHome"
}

$env:PATH = "$sdk\platform-tools;$sdk\emulator;$gradleHome\bin;$env:PATH"

Write-Step 'Toolchain versions'
& adb version | Select-Object -First 2
& (Join-Path $gradleHome 'bin\gradle.bat') --version | Select-Object -First 8
& $sdkManager --version

Write-Step 'Emulator acceleration check'
& (Join-Path $sdk 'emulator\emulator.exe') -accel-check 2>&1

Write-Step 'Toolchain bootstrap complete'
