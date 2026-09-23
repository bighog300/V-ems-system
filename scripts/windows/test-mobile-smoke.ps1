[CmdletBinding()]
param([string]$Device)
. (Join-Path $PSScriptRoot 'common.ps1')
$Device = Get-AndroidDevice $Device
Invoke-Native 'node.exe' @((Join-Path $PSScriptRoot 'android-smoke.mjs'), '--adb', $script:Adb, '--device', $Device) 'Non-mutating Android smoke failed' | Out-Null
Write-Host 'Android smoke passed: host API/Metro connectivity, LoginScreen/jobs screen, no fatal app errors, no reverse rules.'
