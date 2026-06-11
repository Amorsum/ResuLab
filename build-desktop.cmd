@echo off
echo ===========================================
echo  ResuLab Windows Desktop Build
echo ===========================================

echo Step 1: Building web frontend...
call npm run build:tauri
if %errorlevel% neq 0 (echo ERROR: npm build failed & exit /b 1)
echo OK

echo Step 2: Building Rust binary...
cd src-tauri
:: Temporarily switch to rlib-only crate-type for desktop build
:: (avoids corrupt rlib when custom-protocol + staticlib/cdylib are combined on Windows MSVC)
powershell -NoProfile -Command "$c = Get-Content Cargo.toml -Raw; $c = $c -replace 'crate-type\s*=\s*\[[^\]]*\]', 'crate-type = [\"rlib\"]'; [System.IO.File]::WriteAllText((Resolve-Path Cargo.toml), $c)"
if %errorlevel% neq 0 (echo ERROR: Failed to update crate-type & exit /b 1)
cargo build --release
set BUILD_RESULT=%errorlevel%
:: Restore crate-type for Android builds
powershell -NoProfile -Command "$c = Get-Content Cargo.toml -Raw; $c = $c -replace 'crate-type\s*=\s*\[[^\]]*\]', 'crate-type = [\"staticlib\", \"cdylib\", \"rlib\"]'; [System.IO.File]::WriteAllText((Resolve-Path Cargo.toml), $c)"
if %BUILD_RESULT% neq 0 (echo ERROR: cargo build failed & exit /b 1)
cd ..
echo OK

echo Step 3: Bundling NSIS installer...
:: Note: tauri bundle runs beforeBuildCommand (npm run build:tauri) again, but Vite is deterministic
:: so the output hashes match what was embedded in Step 2. No PowerShell tauri.conf.json manipulation
:: needed, which avoids UTF-8 encoding corruption issues.
npx tauri bundle --bundles nsis
if %errorlevel% neq 0 (echo ERROR: bundling failed & exit /b 1)
echo OK

echo.
echo ===========================================
echo  BUILD COMPLETE!
echo  Installer: src-tauri\target\release\bundle\nsis\ResuLab_1.0.3_x64-setup.exe
echo ===========================================
