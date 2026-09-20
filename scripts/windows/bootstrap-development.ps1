[CmdletBinding()]
param([switch]$SkipBuild)
. (Join-Path $PSScriptRoot 'common.ps1')
& (Join-Path $PSScriptRoot 'initialize-development-env.ps1')
Set-Location -LiteralPath $script:RepoRoot
Invoke-LockedInstall
& (Join-Path $PSScriptRoot 'start-development.ps1') -SkipBuild:$SkipBuild
