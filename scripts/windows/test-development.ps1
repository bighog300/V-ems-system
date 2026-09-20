[CmdletBinding()]
param([switch]$ServicesOnly, [switch]$StaticOnly, [switch]$Android, [string]$Device)
. (Join-Path $PSScriptRoot 'common.ps1')
$failures = @()
foreach ($file in @(Get-ChildItem -LiteralPath $script:RepoRoot -Filter *.ps1 -Recurse | Where-Object FullName -notmatch '\\node_modules\\|\\\.git\\')) {
    $tokens = $null; $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count) { $failures += $file.FullName }
}
if ($failures.Count) { throw "PowerShell parser errors in: $($failures -join ', ')" }
Write-Host 'PowerShell parser validation passed.'
if ($StaticOnly) {
    Push-Location -LiteralPath $script:RepoRoot
    try { Invoke-Native 'node.exe' @('--test', 'scripts/windows/development-bootstrap.test.mjs') 'Environment tests failed' | Out-Null }
    finally { Pop-Location }
    Write-Host 'Environment unit tests passed.'
    exit 0
}
Assert-Environment
Invoke-Compose @('config', '--quiet') | Out-Null
Invoke-Compose @('exec', '-T', 'api', 'node', 'scripts/windows/validate-services.mjs') | Out-Null
Write-Host 'API, OpenEMR OAuth/patient search and Vtiger adapter validation passed.'
if (-not $ServicesOnly) {
    $status = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8081/status' -TimeoutSec 10
    if ($status.Content -notmatch 'packager-status:running') { throw 'Metro not ready.' }
}
if ($Android) { & (Join-Path $PSScriptRoot 'test-mobile-smoke.ps1') -Device $Device }
