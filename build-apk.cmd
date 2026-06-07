@echo off
set ANDROID_HOME=C:\Users\19307\Android\Sdk
set ANDROID_SDK_ROOT=C:\Users\19307\Android\Sdk
set NDK_HOME=C:\Users\19307\Android\Sdk\ndk\29.0.13846066
set JAVA_HOME=C:\Program Files\Java\jdk-21
set PATH=C:\Users\19307\.cargo\bin;%PATH%

echo ===========================================
echo  ResuLab Android APK Build
echo ===========================================

echo Step 1: Building web frontend...
call npm run build
if %errorlevel% neq 0 (echo ERROR: npm build failed & exit /b 1)
echo OK

echo Step 2: Building APK with Tauri...
call cargo-tauri android build
if %errorlevel% neq 0 (echo ERROR: Android build failed & exit /b 1)
echo OK

echo Step 3: Signing APK...
set KEYSTORE=src-tauri\gen\android\resulab.keystore
if not exist %KEYSTORE% (
    "%JAVA_HOME%\bin\keytool.exe" -genkey -v -keystore %KEYSTORE% -alias resulab -keyalg RSA -keysize 2048 -validity 10000 -storepass resulab123 -keypass resulab123 -dname "CN=ResuLab, O=ResuLab, C=CN"
)

%ANDROID_HOME%\build-tools\34.0.0\apksigner.bat sign --ks %KEYSTORE% --ks-pass pass:resulab123 --out public\ResuLab.apk src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk
if %errorlevel% neq 0 (echo ERROR: Signing failed & exit /b 1)
echo OK

echo.
echo ===========================================
echo  BUILD COMPLETE!
echo  Signed APK: public\ResuLab.apk
echo ===========================================
