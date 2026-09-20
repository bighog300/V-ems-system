[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Environment
$containers = @(Invoke-Native 'docker.exe' @('ps', '-a', '--filter', 'label=com.docker.compose.project=vems-dev', '--format', '{{.Names}}'))
$volumes = @(Invoke-Native 'docker.exe' @('volume', 'ls', '--filter', 'label=com.docker.compose.project=vems-dev', '--format', '{{.Name}}'))
Write-Host 'Exact project resources (review before confirming):'
$containers | ForEach-Object { Write-Host "Container: $_" }
$volumes | ForEach-Object { Write-Host "Volume: $_" }
Write-Host "External runtime files retained: $script:RuntimeRoot"
if ((Read-Host 'Type RESET VEMS DEV VOLUMES') -cne 'RESET VEMS DEV VOLUMES') { throw 'Reset cancelled.' }
Invoke-Compose @('down', '--volumes') | Out-Null
Write-Host 'Compose volumes reset. External SQLite and credentials were retained; no automatic secret rotation occurs.'
