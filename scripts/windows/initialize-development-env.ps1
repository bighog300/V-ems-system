[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'common.ps1')
Protect-RuntimeDirectory
try { Assert-Environment; $valid = $true } catch { $valid = $false }
if (-not $valid) {
    $data = Join-Path $script:RuntimeRoot 'data'
    New-Item -ItemType Directory -Path $data -Force | Out-Null
    Invoke-Native 'node.exe' @((Join-Path $PSScriptRoot 'development-bootstrap.mjs'), 'generate', '--template', (Join-Path $script:RepoRoot 'infra\env\development.windows.example.env'), '--destination', $script:RuntimeFile, '--db-host-path', $data.Replace('\', '/')) 'Environment generation failed' | Out-Null
}
Assert-Environment
Invoke-Native 'node.exe' @((Join-Path $PSScriptRoot 'development-bootstrap.mjs'), 'sync-scope', '--template', (Join-Path $script:RepoRoot 'infra\env\development.windows.example.env'), '--environment', $script:RuntimeFile) 'Environment scope synchronization failed' | Out-Null
Write-Host 'Development environment validated; existing credentials were preserved.'
