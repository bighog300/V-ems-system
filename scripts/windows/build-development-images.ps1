[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Environment
Invoke-Compose @('config', '--quiet') | Out-Null
Write-Host 'Compose configuration valid.'
Invoke-Compose @('build', 'openemr', 'vtiger', 'api') | Out-Null
Write-Host 'Development images built.'
