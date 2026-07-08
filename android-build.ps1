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

$UnsignedApk = "$ProjectRoot\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk"
$SignedApk   = "$ProjectRoot\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk"
$AssetsDir   = "$ProjectRoot\src-tauri\gen\android\app\src\main\assets"

Write-Output "======================================"
Write-Output "  CompanionHeart Android Build"
Write-Output "  JAVA_HOME       = $env:JAVA_HOME"
Write-Output "  ANDROID_HOME    = $env:ANDROID_HOME"
Write-Output "======================================"
Write-Output ""

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

# Step 3: Build Rust + Gradle APK
Write-Output "[3/5] Building Rust + Gradle APK..."
pnpm tauri android build 2>&1
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
