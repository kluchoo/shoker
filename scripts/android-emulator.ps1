# Start the default AVD (Pixel_9_Pro_XL_API_35) if no emulator is running.
$ErrorActionPreference = "Stop"

$Sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$Adb = Join-Path $Sdk "platform-tools\adb.exe"
$Emulator = Join-Path $Sdk "emulator\emulator.exe"
$Avd = if ($env:SHOKER_AVD) { $env:SHOKER_AVD } else { "Pixel_9_Pro_XL_API_35" }

if (-not (Test-Path $Emulator)) { throw "emulator.exe not found at $Emulator" }

$running = & $Adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "^emulator-.*\tdevice$" }
if ($running) {
    Write-Host "Emulator already running:`n$($running -join "`n")"
    exit 0
}

$avds = & $Emulator -list-avds
if ($avds -notcontains $Avd) {
    Write-Host "Available AVDs:"
    $avds | ForEach-Object { Write-Host " - $_" }
    throw "AVD '$Avd' not found. Set SHOKER_AVD to one of the above."
}

Write-Host ">> Starting AVD $Avd …"
Start-Process -FilePath $Emulator -ArgumentList @("-avd", $Avd, "-netdelay", "none", "-netspeed", "full") -WindowStyle Normal

Write-Host ">> Waiting for boot…"
& $Adb wait-for-device
$deadline = (Get-Date).AddMinutes(3)
do {
    Start-Sleep -Seconds 2
    $boot = (& $Adb shell getprop sys.boot_completed 2>$null | Out-String).Trim()
    if ($boot -eq "1") { break }
} while ((Get-Date) -lt $deadline)

if ($boot -ne "1") { throw "Emulator boot timeout" }
Write-Host ">> Emulator ready"
