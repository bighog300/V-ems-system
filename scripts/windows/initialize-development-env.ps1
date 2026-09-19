[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$source = Join-Path $repoRoot "infra\env\development.windows.example.env"
$localRoot = Join-Path $env:LOCALAPPDATA "VEMS"
$destination = Join-Path $localRoot "development.env"

if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Runtime environment template was not found: $source"
}
New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
if (Test-Path -LiteralPath $destination) {
    throw "Refusing to overwrite existing runtime environment file: $destination"
}
Copy-Item -LiteralPath $source -Destination $destination -ErrorAction Stop
Write-Host "Created runtime environment template at: $destination"
Write-Host "Replace its safe placeholders with local secrets. The file is outside the repository and its contents were not printed."
