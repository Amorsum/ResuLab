@echo off
set ANDROID_HOME=C:\Users\19307\Android\Sdk
set ANDROID_SDK_ROOT=C:\Users\19307\Android\Sdk
set NDK_HOME=C:\Users\19307\Android\Sdk\ndk\29.0.13846066
set JAVA_HOME=C:\Program Files\Java\jdk-21
set PATH=C:\Users\19307\.cargo\bin;C:\Users\19307\Android\Sdk\platform-tools;%PATH%

echo ===========================================
echo  ResuLab Android APK Build
echo ===========================================
echo.
echo Step 1: Building web frontend...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: npm build failed
    exit /b 1
)
echo OK

echo.
echo Step 2: Building Android APK (5-10 min)...
call cargo-tauri android build
if %errorlevel% neq 0 (
    echo ERROR: Android build failed
    exit /b 1
)

echo.
echo ===========================================
echo  BUILD COMPLETE!
echo  APK: src-tauri\gen\android\app\build\outputs\apk\universal\release\
echo ===========================================
