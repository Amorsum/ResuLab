param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$Revision,
    [string]$Root = 'C:\ResuLab',
    [ValidatePattern('^v22\.\d+\.\d+$')][string]$NodeVersion = 'v22.23.4'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\')
if ($Root -eq [IO.Path]::GetPathRoot($Root).TrimEnd('\')) { throw 'Root must be a dedicated application directory.' }
$release = Join-Path $Root ('releases\' + $Revision)
$runtime = Join-Path $Root ('runtime\node-' + $NodeVersion + '-win-x64')
$configuration = Join-Path $Root 'config\server.env'
$runner = Join-Path $Root 'ops\run-api.cjs'
$logs = Join-Path $Root 'logs'
$node = Join-Path $runtime 'node.exe'
foreach ($directory in @('downloads', 'runtime', 'logs', 'config', 'ops')) {
    New-Item -ItemType Directory -Path (Join-Path $Root $directory) -Force | Out-Null
}
foreach ($file in @($configuration, $runner, (Join-Path $release 'server\package-lock.json'), (Join-Path $release 'server\dist\server\src\index.js'))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw ('Missing deployment file: ' + $file) }
}
if (-not (Test-Path -LiteralPath $node)) {
    $name = 'node-' + $NodeVersion + '-win-x64.zip'
    $zip = Join-Path $Root ('downloads\' + $name)
    $sums = (Invoke-WebRequest -UseBasicParsing -Uri ('https://nodejs.org/dist/' + $NodeVersion + '/SHASUMS256.txt') -TimeoutSec 60).Content
    $checksumLine = @($sums -split "`n" | Where-Object { $_.TrimEnd().EndsWith('  ' + $name) })
    if ($checksumLine.Count -ne 1) { throw 'Official Node checksum was not found.' }
    $expectedHash = ($checksumLine[0] -split '\s+')[0]
    if (-not (Test-Path -LiteralPath $zip)) {
        Invoke-WebRequest -UseBasicParsing -Uri ('https://nodejs.org/dist/' + $NodeVersion + '/' + $name) -OutFile $zip -TimeoutSec 300
    }
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ine $expectedHash) { throw 'Node archive SHA256 mismatch.' }
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $Root 'runtime') -Force
    Write-Output ('NODE_ARCHIVE_SHA256=' + $expectedHash)
}
$env:Path = $runtime + ';' + $env:Path
Push-Location (Join-Path $release 'server')
try {
    & $node (Join-Path $runtime 'node_modules\npm\bin\npm-cli.js') ci --omit=dev --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Production dependency installation failed.' }
} finally { Pop-Location }
# Restrict code and server-only configuration to Administrators and SYSTEM.
& icacls.exe $Root /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect application directory.' }
& icacls.exe (Join-Path $Root 'config') /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect configuration directory.' }
& icacls.exe $configuration /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect server configuration.' }
$taskName = 'ResuLab-Agent-API'
$oldTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($oldTask) {
    Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath (Join-Path $Root 'ops\previous-task.xml') -Encoding Unicode
    Stop-ScheduledTask -TaskName $taskName
    for ($attempt = 0; $attempt -lt 20 -and (Get-ScheduledTask -TaskName $taskName).State -eq 'Running'; $attempt++) { Start-Sleep -Seconds 1 }
    if ((Get-ScheduledTask -TaskName $taskName).State -eq 'Running') { throw 'Existing API task did not stop.' }
}
if (Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 8788 is already in use.' }
$arguments = '"' + $runner + '" "' + $release + '" "' + $configuration + '" "' + $logs + '"'
$action = New-ScheduledTaskAction -Execute $node -Argument $arguments -WorkingDirectory (Join-Path $release 'server')
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description ('ResuLab Agent API; source ' + $Revision + '; loopback 8788') -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
$health = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8788/api/health' -TimeoutSec 2; break } catch { Start-Sleep -Seconds 1 }
}
if (-not $health -or -not $health.dependencies.databaseConfigured) { throw 'API failed to start with database configuration. Check logs and roll back if updating.' }
$metadata = [ordered]@{ revision = $Revision; node = (& $node --version); deployedAt = (Get-Date).ToUniversalTime().ToString('o'); release = $release; task = $taskName; listen = '127.0.0.1:8788'; modelConfigured = $health.dependencies.modelConfigured }
$metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Root 'deployment.json') -Encoding UTF8
$metadata | ConvertTo-Json
$health | ConvertTo-Json -Depth 5
