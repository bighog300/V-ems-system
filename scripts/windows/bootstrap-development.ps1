[CmdletBinding()]
param([switch]$SkipBuild)
. (Join-Path $PSScriptRoot 'common.ps1')
& (Join-Path $PSScriptRoot 'initialize-development-env.ps1')
Set-Location -LiteralPath $script:RepoRoot
Invoke-Native 'npm.cmd' @('ci', '--no-audit', '--no-fund') 'Locked dependency installation failed' | Out-Null
& (Join-Path $PSScriptRoot 'start-development.ps1') -SkipBuild:$SkipBuild
