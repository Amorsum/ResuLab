@echo off
echo ===========================================
echo  ResuLab Windows Desktop Build
echo ===========================================

echo Step 1: Building web frontend...
call npm run build
if %errorlevel% neq 0 (echo ERROR: npm build failed & exit /b 1)
echo OK

echo Step 2: Building Rust binary...
cd src-tauri
cargo build --release
if %errorlevel% neq 0 (echo ERROR: cargo build failed & exit /b 1)
cd ..
echo OK

echo Step 3: Bundling NSIS installer...
npx tauri bundle --bundles nsis
if %errorlevel% neq 0 (echo ERROR: bundling failed & exit /b 1)
echo OK

echo.
echo ===========================================
echo  BUILD COMPLETE!
echo  Installer: src-tauri\target\release\bundle\nsis\ResuLab_1.0.2_x64-setup.exe
echo ===========================================
