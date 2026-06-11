@echo off
setlocal enabledelayedexpansion
echo ===========================================
echo  ResuLab Android APK Build
echo ===========================================

:: Environment variables (edit defaults here to match your machine)
if "%ANDROID_HOME%"=="" set "ANDROID_HOME=C:\Users\19307\Android\Sdk"
if "%ANDROID_SDK_ROOT%"=="" set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
if "%JAVA_HOME%"=="" set "JAVA_HOME=C:\Program Files\Java\jdk-21"

:: Auto-detect latest NDK version
if "%NDK_HOME%"=="" for /f "tokens=*" %%i in ('dir /b /ad "%ANDROID_HOME%\ndk" 2^>nul ^| sort /r') do set "NDK_HOME=%ANDROID_HOME%\ndk\%%i" & goto :ndk_found
:ndk_found
if "%NDK_HOME%"=="" (
    echo ERROR: NDK not found. Set NDK_HOME or install NDK via Android Studio.
    exit /b 1
)
echo NDK: %NDK_HOME%

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

:: Set Rust Android linkers
set "CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER=%NDK_HOME%\toolchains\llvm\prebuilt\windows-x86_64\bin\aarch64-linux-android21-clang.cmd"
set "CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER=%NDK_HOME%\toolchains\llvm\prebuilt\windows-x86_64\bin\armv7a-linux-androideabi21-clang.cmd"
set "CARGO_TARGET_I686_LINUX_ANDROID_LINKER=%NDK_HOME%\toolchains\llvm\prebuilt\windows-x86_64\bin\i686-linux-android21-clang.cmd"
set "CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER=%NDK_HOME%\toolchains\llvm\prebuilt\windows-x86_64\bin\x86_64-linux-android21-clang.cmd"

:: Install Rust Android targets
echo Checking Rust Android targets...
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android 2>nul

echo ===========================================
echo Step 1: Building web frontend...
echo ===========================================
call npm run build:tauri
if %errorlevel% neq 0 (echo ERROR: npm build failed & exit /b 1)
echo OK

echo ===========================================
echo Step 2: Building Rust libs for Android targets...
echo ===========================================
cd src-tauri
cargo build --release --target aarch64-linux-android --lib
if %errorlevel% neq 0 (echo ERROR: aarch64 build failed & exit /b 1)
cargo build --release --target armv7-linux-androideabi --lib
if %errorlevel% neq 0 (echo ERROR: armv7 build failed & exit /b 1)
cargo build --release --target i686-linux-android --lib
if %errorlevel% neq 0 (echo ERROR: i686 build failed & exit /b 1)
cargo build --release --target x86_64-linux-android --lib
if %errorlevel% neq 0 (echo ERROR: x86_64 build failed & exit /b 1)
echo OK

echo ===========================================
echo Step 2.5: Patching tauri.settings.gradle for plugins...
echo ===========================================
:: tauri.settings.gradle 被 gitignore（含机器相关的 Cargo 路径）
:: 自动检测并补丁 tauri-plugin-dialog 模块
powershell -NoProfile -Command ^
  "$cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { \"$env:USERPROFILE\.cargo\" }; ^
   $dialogDir = Get-ChildItem -Path \"$cargoHome\registry\src\index.crates.io-*\tauri-plugin-dialog-*\" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1; ^
   if (-not $dialogDir) { Write-Host 'WARNING: tauri-plugin-dialog not found in Cargo registry. Run cargo build first.'; exit 0 }; ^
   $f = 'gen\android\tauri.settings.gradle'; ^
   if (-not (Test-Path $f)) { Write-Host 'ERROR: Android project not initialized. Run: npx tauri android init'; exit 1 }; ^
   $c = Get-Content $f -Raw; ^
   if ($c -match 'tauri-plugin-dialog') { Write-Host 'Already patched, skipping.' } ^
   else { ^
     $androidDir = $dialogDir.FullName + '\android'; ^
     $patch = \"`ninclude ':tauri-plugin-dialog'`nproject(':tauri-plugin-dialog').projectDir = new File('$androidDir')`n\"; ^
     [System.IO.File]::WriteAllText((Resolve-Path $f).Path, $c + $patch); ^
     Write-Host ('Patched: added tauri-plugin-dialog from ' + $androidDir) ^
   }"
if %errorlevel% neq 0 (echo ERROR: Failed to patch tauri.settings.gradle & exit /b 1)
echo OK

echo ===========================================
echo Step 3: Linking .so files to jniLibs...
echo ===========================================
if not exist "gen\android\app\src\main\jniLibs" (
    echo ERROR: Android project not initialized. Run: npx tauri android init
    exit /b 1
)
cd gen\android\app\src\main\jniLibs
mkdir arm64-v8a 2>nul
mkdir armeabi-v7a 2>nul
mkdir x86 2>nul
mkdir x86_64 2>nul
copy /Y "..\..\..\..\..\..\target\aarch64-linux-android\release\libapp_lib.so" "arm64-v8a\libapp_lib.so" >nul
copy /Y "..\..\..\..\..\..\target\armv7-linux-androideabi\release\libapp_lib.so" "armeabi-v7a\libapp_lib.so" >nul
copy /Y "..\..\..\..\..\..\target\i686-linux-android\release\libapp_lib.so" "x86\libapp_lib.so" >nul
copy /Y "..\..\..\..\..\..\target\x86_64-linux-android\release\libapp_lib.so" "x86_64\libapp_lib.so" >nul
cd ..\..\..\..\..\..

echo ===========================================
echo Step 4: Assembling APK with Gradle...
echo ===========================================
cd gen\android
call gradlew assembleUniversalRelease -x rustBuildUniversalRelease -x rustBuildArm64Release -x rustBuildArmRelease -x rustBuildX86Release -x rustBuildX86_64Release
if %errorlevel% neq 0 (echo ERROR: Gradle assemble failed & exit /b 1)
cd ..\..
cd ..
echo OK

echo ===========================================
echo Step 5: Signing APK...
echo ===========================================
set "KEYSTORE=src-tauri\gen\android\resulab.keystore"
if not exist "%KEYSTORE%" (
    echo Creating new keystore...
    "%JAVA_HOME%\bin\keytool.exe" -genkey -v -keystore "%KEYSTORE%" -alias resulab -keyalg RSA -keysize 2048 -validity 10000 -storepass resulab123 -keypass resulab123 -dname "CN=ResuLab, O=ResuLab, C=CN"
)

:: Auto-detect latest build-tools version
for /f "tokens=*" %%i in ('dir /b /ad "%ANDROID_HOME%\build-tools" 2^>nul ^| sort /r') do set "BUILD_TOOLS_VER=%%i" & goto :bt_found
:bt_found
if not exist release-artifacts mkdir release-artifacts
for /f "delims=" %%v in ('powershell -NoProfile -Command "(Get-Content src-tauri/tauri.conf.json | ConvertFrom-Json).version"') do set "APP_VERSION=%%v"
"%ANDROID_HOME%\build-tools\%BUILD_TOOLS_VER%\apksigner.bat" sign --ks "%KEYSTORE%" --ks-pass pass:resulab123 --out release-artifacts\ResuLab_%APP_VERSION%.apk src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk
if %errorlevel% neq 0 (echo ERROR: Signing failed & exit /b 1)
echo OK

echo.
echo ===========================================
echo  BUILD COMPLETE!
echo  Signed APK: release-artifacts\ResuLab_%APP_VERSION%.apk
echo ===========================================

endlocal
