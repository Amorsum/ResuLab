$taskName = 'ResuLab-Agent-API'
$checks = @()
function Check($condition, [string]$name) {
    if (-not $condition) { throw ('CHECK_FAILED:' + $name) }
    $script:checks += [pscustomobject]@{ name = $name; passed = $true }
}
$task = Get-ScheduledTask -TaskName $taskName
Check ($task.State -eq 'Running') 'scheduled_task_running'
Check ($task.Principal.UserId -eq 'SYSTEM' -or $task.Principal.UserId -eq 'S-1-5-18') 'system_principal'
Check ($task.Triggers.CimClass.CimClassName -contains 'MSFT_TaskBootTrigger') 'startup_trigger_configured'
Check ($task.Settings.RestartCount -eq 999 -and $task.Settings.RestartInterval -eq 'PT1M') 'failure_restart_configured'
Check ($task.Settings.ExecutionTimeLimit -eq 'PT0S') 'no_execution_time_limit'
$before = Get-NetTCPConnection -LocalPort 8788 -State Listen
Check ($before.LocalAddress -eq '127.0.0.1') 'loopback_only'
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:8788/api/health' -TimeoutSec 5
Check ($health.dependencies.databaseConfigured -and -not $health.dependencies.modelConfigured -and $health.status -eq 'degraded') 'database_configured_model_explicitly_missing'
$preflight = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8788/api/agent/runs' -Method Options -Headers @{ Origin='https://resulab.amorsum.top'; 'Access-Control-Request-Method'='POST'; 'Access-Control-Request-Headers'='authorization,content-type,idempotency-key' } -TimeoutSec 5
Check ($preflight.StatusCode -eq 204 -and $preflight.Headers['Access-Control-Allow-Origin'] -eq 'https://resulab.amorsum.top') 'domain_cors_preflight'
$deniedOrigin = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8788/api/health' -Headers @{ Origin='https://untrusted.example.invalid' } -TimeoutSec 5
Check (-not $deniedOrigin.Headers['Access-Control-Allow-Origin']) 'unlisted_origin_not_allowed'
foreach ($mode in @('no_token','invalid_token')) {
    $headers = @{}
    if ($mode -eq 'invalid_token') { $headers.Authorization = 'Bearer acceptance-invalid-token' }
    $status = 0
    try { $response=Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:8788/api/agent/runs/' + [guid]::NewGuid()) -Headers $headers -TimeoutSec 15; $status=[int]$response.StatusCode } catch { if ($_.Exception.Response) { $status=[int]$_.Exception.Response.StatusCode } else { throw 'Authentication probe could not reach API.' } }
    Check ($status -eq 401) ($mode + '_http_401')
}
$configurationAcl = (Get-Acl -LiteralPath 'C:\ResuLab\config\server.env').Access
$allowedSids = @('S-1-5-18','S-1-5-32-544')
$actualSids = @($configurationAcl | ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value })
Check ($actualSids.Count -eq 2 -and @($actualSids | Where-Object { $_ -notin $allowedSids }).Count -eq 0) 'server_configuration_admin_system_only'
Stop-ScheduledTask -TaskName $taskName
for ($attempt=0; $attempt -lt 20 -and (Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue); $attempt++) { Start-Sleep -Seconds 1 }
Check (-not (Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue)) 'stopping_task_releases_api_port'
Start-ScheduledTask -TaskName $taskName
$recovered = $null
for ($attempt=0; $attempt -lt 25; $attempt++) {
    try { $recovered=Invoke-RestMethod -Uri 'http://127.0.0.1:8788/api/health' -TimeoutSec 2; break } catch { Start-Sleep -Seconds 1 }
}
Check ([bool]$recovered.dependencies.databaseConfigured) 'task_restart_recovers_health'
$after=Get-NetTCPConnection -LocalPort 8788 -State Listen
Check ($before.OwningProcess -ne $after.OwningProcess) 'restart_uses_new_process'
$report=[ordered]@{
    timestamp=(Get-Date).ToUniversalTime().ToString('o')
    deployment=(Get-Content -LiteralPath 'C:\ResuLab\deployment.json' -Raw | ConvertFrom-Json)
    checks=$checks
    health=$recovered
    osRebootTested=$false
    crashRecoveryFaultInjected=$false
    realModelRequestsSent=0
    publicIngressConfigured=$false
    success=$true
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath 'C:\ResuLab\service-acceptance.json' -Encoding UTF8
$report | ConvertTo-Json -Depth 8
