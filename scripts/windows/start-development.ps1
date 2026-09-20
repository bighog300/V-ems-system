[CmdletBinding()]
param([switch]$SkipBuild)
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Environment
Assert-FreePorts @(3001,8080,8083,3307,6380)
Invoke-Compose @('config', '--quiet') | Out-Null
if (-not $SkipBuild) { Invoke-Compose @('build') | Out-Null }
Invoke-Compose @('up', '-d', '--wait', '--wait-timeout', '600', 'mysql', 'redis', 'openemr', 'vtiger') | Out-Null
Invoke-Compose @('exec', '-T', '--user', 'apache', 'openemr', 'php', '/opt/vems/provision-development.php') | Out-Null
Invoke-Compose @('exec', '-T', 'vtiger', 'php', '/opt/vems/provision-development.php') | Out-Null
Invoke-Compose @('up', '-d', '--wait', '--wait-timeout', '120', 'api') | Out-Null
Invoke-Compose @('exec', '-T', 'api', 'node', 'scripts/windows/seed-development.mjs') | Out-Null
& (Join-Path $PSScriptRoot 'test-development.ps1') -ServicesOnly
