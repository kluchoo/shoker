# Build, install and launch Shoker debug APK on the first connected device/emulator.
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Android = Join-Path $Root "android"
$Sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$Adb = Join-Path $Sdk "platform-tools\adb.exe"
$Jbr = "C:\Program Files\Android\Android Studio\jbr"

if (-not (Test-Path $Adb)) { throw "adb not found at $Adb" }
if (Test-Path $Jbr) { $env:JAVA_HOME = $Jbr }
$env:ANDROID_HOME = $Sdk
$env:ANDROID_SDK_ROOT = $Sdk

$assetsMarker = Join-Path $Android "app\src\main\assets\nodejs-project\android-entry.js"
$libnode = Join-Path $Android "app\src\main\jniLibs\arm64-v8a\libnode.so"
if (-not (Test-Path $assetsMarker) -or -not (Test-Path $libnode)) {
    Write-Host ">> Preparing Android Node assets (first time)…"
    Push-Location $Root
    npm run android:prepare
    Pop-Location
} else {
    # Always refresh game sources — otherwise Install & Launch keeps a stale public/ from the last prepare.
    Write-Host ">> Syncing public + server into Android assets…"
    $assetsNode = Join-Path $Android "app\src\main\assets\nodejs-project"
    $publicDest = Join-Path $assetsNode "public"
    if (Test-Path $publicDest) { Remove-Item $publicDest -Recurse -Force }
    Copy-Item (Join-Path $Root "public") $publicDest -Recurse -Force
    foreach ($file in @("server.js", "android-entry.js", "package.json", "package-lock.json")) {
        $from = Join-Path $Root $file
        if (Test-Path $from) { Copy-Item $from (Join-Path $assetsNode $file) -Force }
    }
}

Write-Host ">> Checking device…"
& $Adb start-server | Out-Null
$devices = & $Adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "\tdevice$" }
if (-not $devices) {
    throw "Brak urządzenia. Podłącz telefon (USB debugging) albo uruchom emulator (task: android: start emulator)."
}

Write-Host ">> Devices:`n$($devices -join "`n")"
Write-Host ">> Building + installing debug…"
Push-Location $Android
& .\gradlew.bat :app:installDebug
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "installDebug failed ($LASTEXITCODE)" }
Pop-Location

$pkg = "pl.shoker.host.debug"
$activity = "pl.shoker.host.MainActivity"
Write-Host ">> Launching $pkg/$activity"
& $Adb shell am force-stop $pkg 2>$null
& $Adb shell am start -n "$pkg/$activity" -a android.intent.action.MAIN -c android.intent.category.LAUNCHER
if ($LASTEXITCODE -ne 0) { throw "Failed to start activity" }

Write-Host ">> OK. Logi: npm run android:logcat  albo  task 'android: logcat Shoker'"
