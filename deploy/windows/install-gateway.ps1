param([string]$Root = 'C:\ResuLab', [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$CaddySha256)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$exe=Join-Path $Root 'runtime\caddy\caddy.exe'
$config=Join-Path $Root 'config\Caddyfile'
if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ine $CaddySha256) { throw 'Caddy executable checksum mismatch' }
if (-not (Test-Path -LiteralPath $config)) { Copy-Item -LiteralPath (Join-Path $Root 'ops\Caddyfile.http') -Destination $config }
& $exe validate --config $config --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Invalid gateway configuration' }
$name='ResuLab-Web-Gateway'
$task=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($task) { Stop-ScheduledTask -TaskName $name; Start-Sleep -Seconds 2 }
$action=New-ScheduledTaskAction -Execute $exe -Argument ('run --config "'+$config+'" --adapter caddyfile') -WorkingDirectory $Root
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $name -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal -Settings $settings -Description 'ResuLab web and API gateway; HTTP/HTTPS' -Force | Out-Null
foreach ($port in @(80,443)) {
  $rule='ResuLab-Web-TCP-'+$port
  if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName $rule -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port | Out-Null }
}
Start-ScheduledTask -TaskName $name
for ($i=0;$i -lt 20;$i++) { try { $health=Invoke-RestMethod http://127.0.0.1/api/health -TimeoutSec 2; if ($health.status -eq 'ok') { Write-Output 'Gateway health OK'; exit 0 } } catch {}; Start-Sleep -Seconds 1 }
throw 'Gateway did not become healthy'
