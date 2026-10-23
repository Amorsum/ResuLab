param(
    [string]$Root = 'C:\ResuLab',
    [ValidatePattern('^\d{4}\.\d{1,2}\.\d+$')][string]$Version = '2026.10.3',
    [ValidatePattern('^[a-f0-9]{64}$')][string]$Sha256 = '76b2805253d0d6ffacb092a7acfbee99e7af6917835c0c5410e23f3ef5052da2'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$taskName = 'ResuLab-Agent-HTTPS'
$binary = Join-Path $Root ('runtime\cloudflared-' + $Version + '.exe')
$log = Join-Path $Root ('logs\https-tunnel-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and $existing.State -eq 'Running') { throw 'HTTPS tunnel is already running; keep its URL or explicitly stop it before replacement.' }
if (-not (Test-Path -LiteralPath $binary)) {
    Invoke-WebRequest -UseBasicParsing -Uri ('https://github.com/cloudflare/cloudflared/releases/download/' + $Version + '/cloudflared-windows-amd64.exe') -OutFile $binary -TimeoutSec 300
}
if ((Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash -ine $Sha256) { throw 'Official cloudflared release SHA256 mismatch.' }
& $binary --version
if ($LASTEXITCODE -ne 0) { throw 'Could not run verified cloudflared release.' }
$action = New-ScheduledTaskAction -Execute $binary -Argument ('tunnel --no-autoupdate --protocol http2 --edge-ip-version 4 --metrics 127.0.0.1:20242 --logfile "' + $log + '" --url http://127.0.0.1:8788') -WorkingDirectory $Root
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Description 'Temporary HTTPS Agent API tunnel. URL may change after restarting this tunnel.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
$url = $null
$registered = $false
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    if (Test-Path -LiteralPath $log) {
        $contents = Get-Content -LiteralPath $log -Raw
        $found = [regex]::Match($contents, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($found.Success) { $url = $found.Value }
    }
    try { $ready = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:20242/ready' -TimeoutSec 1; $registered = $ready.StatusCode -eq 200 } catch { $registered = $false }
    if ($url -and $registered) { break }
    Start-Sleep -Seconds 1
}
if (-not $url -or -not $registered) { throw ('HTTPS tunnel did not become ready. Inspect ' + $log) }
$result = [ordered]@{
    apiBase = $url
    healthUrl = $url + '/api/health'
    allowedFrontendOrigin = 'https://resulab.amorsum.top'
    upstream = 'http://127.0.0.1:8788'
    frontendHostedOnServer = $false
    temporary = $true
    urlChangesOnTunnelRestart = $true
    task = $taskName
    version = $Version
    binarySha256 = $Sha256
    tunnelLog = $log
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Root 'https-api.json') -Encoding UTF8
$result | ConvertTo-Json
