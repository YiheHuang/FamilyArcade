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

$sdkManager = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
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
    New-Item -ItemType Directory -Force -Path (Split-Path $sdkManager -Parent) | Out-Null
    Copy-Item -Path (Join-Path $source '*') -Destination (Split-Path $sdkManager -Parent) -Recurse -Force
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
    Write-Step "Installed sdkmanager at $sdkManager"
}
else {
    Write-Step "sdkmanager already present at $sdkManager"
}

Write-Step 'Accepting Android SDK licenses'
$yes = 1..200 | ForEach-Object { 'y' }
$yes | & $sdkManager --sdk_root=$sdk --licenses 2>&1 | Out-Null

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
