[CmdletBinding()]
param([switch]$EnableDevelopmentTestAuth, [switch]$InstallDependencies)
. (Join-Path $PSScriptRoot 'common.ps1')
Set-MobileEnvironment
Assert-FreePorts @(8081)
Set-Location -LiteralPath $script:RepoRoot
if ($InstallDependencies) { Invoke-Native 'npm.cmd' @('ci', '--no-audit', '--no-fund') 'Dependency installation failed' | Out-Null }
Set-Location -LiteralPath (Join-Path $script:RepoRoot 'apps\mobile-crew')
$env:REACT_NATIVE_PACKAGER_HOSTNAME = '10.0.2.2'
Write-Host 'Windows Metro: http://127.0.0.1:8081; emulator: http://10.0.2.2:8081. Ctrl+C stops Metro.'
& npx.cmd expo start --dev-client --host lan --port 8081
exit $LASTEXITCODE
