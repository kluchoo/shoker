# Filtered logcat for Shoker host + Node bridge.
$ErrorActionPreference = "Stop"
$Sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$Adb = Join-Path $Sdk "platform-tools\adb.exe"

& $Adb logcat -c
Write-Host ">> logcat (Ctrl+C to stop)"
& $Adb logcat -v time ShokerNode:I ShokerHostService:I AndroidRuntime:E libc:E DEBUG:E *:S
