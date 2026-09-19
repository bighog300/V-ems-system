[CmdletBinding()]
param(
    [switch]$EnableDevelopmentTestAuth,
    [switch]$InstallDependencies,
    [int]$Port = 8081
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$mobileRoot = Join-Path $repoRoot "apps\mobile-crew"
if (-not (Test-Path -LiteralPath $mobileRoot -PathType Container)) {
    throw "Mobile project was not found: $mobileRoot"
}
Set-Location -LiteralPath $mobileRoot
if ((Get-Location).Path -ne $mobileRoot) { throw "Could not change to the mobile project directory." }

$node = & node.exe --version
$npm = & npm.cmd --version
if ($LASTEXITCODE -ne 0) { throw "Windows Node.js/npm is required on PATH." }
Write-Host "VEMS Windows Metro"
Write-Host "Repository: $repoRoot"
Write-Host "Mobile project: $((Get-Location).Path)"
Write-Host "Node: $node; npm: $npm"

if ($InstallDependencies) {
    Write-Host "Installing locked dependencies with npm ci..."
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
}

$env:EXPO_PUBLIC_API_PROFILE = "android-emulator-development"
$env:EXPO_PUBLIC_API_URL = "http://10.0.2.2:3001"
$env:NODE_ENV = "development"
$env:APP_ENV = "development"
if ($EnableDevelopmentTestAuth) {
    $env:EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH = "true"
} else {
    Remove-Item Env:EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH -ErrorAction SilentlyContinue
}

Write-Host "API profile: Android emulator development -> http://10.0.2.2:3001"
Write-Host "Metro status will be available at http://127.0.0.1:$Port/status"
Write-Host "The emulator should use http://10.0.2.2:$Port/status; no ADB reverse or portproxy is required."
Write-Host "Development test authentication: $EnableDevelopmentTestAuth"
& npx.cmd expo start --dev-client --host lan --port $Port
exit $LASTEXITCODE
