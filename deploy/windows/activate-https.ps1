param([string]$Root='C:\ResuLab')
$ErrorActionPreference='Stop'
$ip=@(Resolve-DnsName resulab.amorsum.top -Type A | Where-Object {$_.IPAddress} | ForEach-Object {$_.IPAddress})
if ('117.50.196.22' -notin $ip) { throw 'First switch the Cloudflare record to DNS-only A resulab -> 117.50.196.22 and wait for propagation.' }
$exe=Join-Path $Root 'runtime\caddy\caddy.exe'
$candidate=Join-Path $Root 'ops\Caddyfile.https'
& $exe validate --config $candidate --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Invalid HTTPS configuration' }
Copy-Item -LiteralPath (Join-Path $Root 'config\Caddyfile') -Destination (Join-Path $Root 'config\Caddyfile.before-https') -Force
Copy-Item -LiteralPath $candidate -Destination (Join-Path $Root 'config\Caddyfile') -Force
& $exe reload --config (Join-Path $Root 'config\Caddyfile') --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'HTTPS reload failed; restore Caddyfile.before-https and reload' }
Write-Output 'HTTPS config loaded. Caddy will request the domain certificate. Verify https://resulab.amorsum.top/api/health before enabling Cloudflare proxy.'
