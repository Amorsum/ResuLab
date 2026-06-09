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

echo Step 2: Building Rust libs for Android targets...
cd src-tauri
cargo build --release --target aarch64-linux-android --lib
if %errorlevel% neq 0 (echo ERROR: aarch64 build failed & exit /b 1)
cargo build --release --target armv7-linux-androideabi --lib
if %errorlevel% neq 0 (echo ERROR: armv7 build failed & exit /b 1)
cargo build --release --target i686-linux-android --lib
if %errorlevel% neq 0 (echo ERROR: i686 build failed & exit /b 1)
cargo build --release --target x86_64-linux-android --lib
if %errorlevel% neq 0 (echo ERROR: x86_64 build failed & exit /b 1)
cd ..
echo OK

echo Step 3: Linking .so files to jniLibs...
cd gen\android\app\src\main\jniLibs
mkdir arm64-v8a 2>nul
mkdir armeabi-v7a 2>nul
mkdir x86 2>nul
mkdir x86_64 2>nul
copy /Y "..\..\..\..\..\..\..\target\aarch64-linux-android\release\libapp_lib.so" "arm64-v8a\libapp_lib.so" >nul
copy /Y "..\..\..\..\..\..\..\target\armv7-linux-androideabi\release\libapp_lib.so" "armeabi-v7a\libapp_lib.so" >nul
copy /Y "..\..\..\..\..\..\..\target\i686-linux-android\release\libapp_lib.so" "x86\libapp_lib.so" >nul
copy /Y "..\..\..\..\..\..\..\target\x86_64-linux-android\release\libapp_lib.so" "x86_64\libapp_lib.so" >nul
cd ..\..\..\..\..
echo OK

echo Step 4: Assembling APK with Gradle...
cd gen\android
call gradlew assembleUniversalRelease -x rustBuildUniversalRelease -x rustBuildArm64Release -x rustBuildArmRelease -x rustBuildX86Release -x rustBuildX86_64Release
if %errorlevel% neq 0 (echo ERROR: Gradle assemble failed & exit /b 1)
cd ..\..\..
echo OK

echo Step 5: Signing APK...
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
