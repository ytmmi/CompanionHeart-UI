# CompanionHeart Android build script
# Uses project-local SDK/NDK, system Gradle cache

param(
    [switch]$Build,
    [switch]$Install,
    [switch]$Sign
)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Toolchain paths
$env:JAVA_HOME       = "D:\BianCen\Java\JDK_21"
$env:ANDROID_HOME    = "$ProjectRoot\android-sdk"
$env:GRADLE_USER_HOME = "$env:USERPROFILE\.gradle"

# APK paths
# Note: Tauri CLI always outputs to the "universal" flavor directory even with
# --target aarch64; the APK then contains only the arm64-v8a lib.
$UnsignedApk = "$ProjectRoot\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk"
$SignedApk   = "$ProjectRoot\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk"
$AssetsDir   = "$ProjectRoot\src-tauri\gen\android\app\src\main\assets"

Write-Output "======================================"
Write-Output "  CompanionHeart Android Build"
Write-Output "  JAVA_HOME       = $env:JAVA_HOME"
Write-Output "  ANDROID_HOME    = $env:ANDROID_HOME"
Write-Output "======================================"
Write-Output ""

# Stale ABI check: --target aarch64 only recompiles arm64, it does NOT remove
# old universal-build intermediates. Gradle's universal flavor re-merges any
# leftover armeabi-v7a / x86 / x86_64 .so into the APK (~+40MB).
$MergedLibs = "$ProjectRoot\src-tauri\gen\android\app\build\intermediates\merged_native_libs"
$StaleAbis = Get-ChildItem -Path $MergedLibs -Recurse -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in @("armeabi-v7a", "x86", "x86_64") }
if ($StaleAbis) {
    Write-Output "WARNING: Stale non-arm64 ABI intermediates detected:"
    $StaleAbis | ForEach-Object { Write-Output "  $($_.FullName)" }
    Write-Output "These will be re-merged into the APK (~+40MB). Clean first:"
    Write-Output "  cd src-tauri\gen\android && .\gradlew clean"
    Write-Output ""
}

# Step 1: Build frontend
Write-Output "[1/5] Building frontend..."
Push-Location $ProjectRoot
pnpm vite build 2>&1
if ($LASTEXITCODE -ne 0) { Write-Output "FAILED: frontend build"; exit 1 }
Pop-Location

# Step 2: Copy dist to Android assets
Write-Output "[2/5] Copying frontend assets to Android assets..."
if (Test-Path $AssetsDir) {
    Remove-Item "$AssetsDir\*" -Recurse -Force -ErrorAction SilentlyContinue
}
Copy-Item "$ProjectRoot\dist\*" -Destination $AssetsDir -Recurse -Force
$fileCount = (Get-ChildItem $AssetsDir -Recurse).Count
Write-Output "  Copied $fileCount files"

# Step 3: Build Rust + Gradle APK (arm64-v8a only — smaller APK, faster build)
Write-Output "[3/5] Building Rust + Gradle APK (arm64-v8a)..."
pnpm tauri android build --target aarch64 --apk 2>&1
if ($LASTEXITCODE -ne 0) { Write-Output "FAILED: APK build"; exit 1 }

# Step 4: Sign APK
if ($Sign -or $Install) {
    Write-Output "[4/5] Signing APK..."
    $ks = "$env:USERPROFILE\.android\debug.keystore"
    if (-not (Test-Path $ks)) {
        & "D:\BianCen\Java\JDK_21\bin\keytool" -genkey -v -keystore $ks -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" 2>&1 | Out-Null
    }
    & "$env:ANDROID_HOME\build-tools\34.0.0\apksigner" sign --ks $ks --ks-pass pass:android --ks-key-alias androiddebugkey --out $SignedApk $UnsignedApk 2>&1
    Write-Output "  Signed"
}

# Step 5: Install to device
if ($Install) {
    Write-Output "[5/5] Installing to device..."
    $adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
    & $adb push $SignedApk /data/local/tmp/app-release.apk 2>&1 | Out-Null
    & $adb shell pm install -r /data/local/tmp/app-release.apk 2>&1
    Write-Output "  Installed"
}

Write-Output ""
Write-Output "======================================"
Write-Output "  Build complete"
Write-Output "  APK: $SignedApk"
Write-Output "======================================"
