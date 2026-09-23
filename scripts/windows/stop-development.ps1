[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Environment
Invoke-Compose @('stop') | Out-Null
Write-Host 'vems-dev services stopped. All development volumes retained.'
