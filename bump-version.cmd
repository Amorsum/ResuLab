@echo off
if "%~1"=="" (
  echo Usage: bump-version.cmd ^<new-version^>
  echo Example: bump-version.cmd 1.0.4
  exit /b 1
)

set "NEW_VERSION=%~1"

echo Bumping version to %NEW_VERSION%...

:: 更新 tauri.conf.json
powershell -NoProfile -Command ^
  "$f = 'src-tauri/tauri.conf.json'; ^
   $json = Get-Content $f -Raw | ConvertFrom-Json; ^
   $json.productName = 'ResuLab'; ^
   $json.version = '%NEW_VERSION%'; ^
   $json | ConvertTo-Json -Depth 10 | Set-Content $f; ^
   Write-Host 'Updated:' $f"

:: 更新 Cargo.toml
powershell -NoProfile -Command ^
  "$f = 'src-tauri/Cargo.toml'; ^
   $c = Get-Content $f -Raw; ^
   $c = $c -replace '^version\s*=\s*\"[^\"]*\"', 'version = \"%NEW_VERSION%\"'; ^
   [System.IO.File]::WriteAllText((Resolve-Path $f).Path, $c); ^
   Write-Host 'Updated:' $f"

echo.
echo Done. Both files now at version %NEW_VERSION%
echo Next: build-desktop.cmd or build-apk.cmd
