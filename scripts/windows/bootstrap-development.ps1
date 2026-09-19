[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$RotateDevelopmentSecrets,
    [switch]$ResetDisposableEnvironment,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$composeFile = Join-Path $repoRoot "infra\docker-compose.dev.yml"
$template = Join-Path $repoRoot "infra\env\development.windows.example.env"
$runtimeRoot = Join-Path $env:LOCALAPPDATA "VEMS"
$runtimeFile = Join-Path $runtimeRoot "development.env"
$dataRoot = Join-Path $runtimeRoot "data"
$helper = Join-Path $repoRoot "scripts\windows\development-bootstrap.mjs"

function Invoke-SafeNative([string]$File, [string[]]$Arguments, [string]$FailureMessage) {
    $output = & $File @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
    return $output
}

if (-not (Test-Path -LiteralPath $composeFile -PathType Leaf)) { throw "Compose file not found." }
if (-not (Test-Path -LiteralPath $template -PathType Leaf)) { throw "Runtime template not found." }
New-Item -ItemType Directory -Path $runtimeRoot, $dataRoot -Force | Out-Null

if ($ResetDisposableEnvironment) {
    $confirmation = Read-Host "Type RESET VEMS WINDOWS DEVELOPMENT to remove only the disposable Windows VEMS environment"
    if ($confirmation -cne "RESET VEMS WINDOWS DEVELOPMENT") { throw "Reset cancelled." }
    Invoke-SafeNative "docker.exe" @("compose", "-f", $composeFile, "--env-file", $runtimeFile, "down", "--volumes") "Disposable environment reset failed."
    if (Test-Path -LiteralPath $runtimeFile) { Remove-Item -LiteralPath $runtimeFile -Force }
    Write-Host "Disposable Windows VEMS environment reset. No retained WSL resources were addressed."
    exit 0
}

$runtimeIsPlaceholder = $false
if (Test-Path -LiteralPath $runtimeFile -PathType Leaf) {
    $runtimeIsPlaceholder = Select-String -LiteralPath $runtimeFile -Pattern 'replace-with|REPLACE_ME|CHANGE_ME|placeholder|secret-here' -Quiet
}
$freshRuntime = (-not (Test-Path -LiteralPath $runtimeFile -PathType Leaf)) -or $runtimeIsPlaceholder -or $RotateDevelopmentSecrets
if ($freshRuntime) {
    $dbHostPath = $dataRoot.Replace("\", "/")
    Invoke-SafeNative "node.exe" @($helper, "generate", "--template", $template, "--destination", $runtimeFile, "--db-host-path", $dbHostPath) "Could not construct the runtime environment file."
}
Invoke-SafeNative "node.exe" @($helper, "validate", "--environment", $runtimeFile) "Runtime environment validation failed." | Out-Null

$acl = Get-Acl -LiteralPath $runtimeFile
$acl.SetAccessRuleProtection($true, $false)
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($identity, "FullControl", "Allow")))
Set-Acl -LiteralPath $runtimeFile -AclObject $acl

if (-not $SkipBuild) { Invoke-SafeNative "docker.exe" @("compose", "-f", $composeFile, "--env-file", $runtimeFile, "build", "api", "openemr", "vtiger") "Docker image build failed." | Out-Null }
Invoke-SafeNative "docker.exe" @("compose", "-f", $composeFile, "--env-file", $runtimeFile, "up", "-d", "mysql", "redis", "openemr", "vtiger") "Dependency startup failed." | Out-Null

Write-Host "Waiting for disposable Windows dependencies..."
for ($attempt = 1; $attempt -le 40; $attempt++) {
    $healthy = $true
    foreach ($container in @("vems-mysql-dev", "vems-redis-dev", "vems-openemr-dev", "vems-vtiger-dev")) {
        $state = Invoke-SafeNative "docker.exe" @("inspect", "--format", "{{.State.Health.Status}}", $container) "Could not inspect dependency readiness."
        if (($state -join "").Trim() -ne "healthy") { $healthy = $false }
    }
    if ($healthy) { break }
    Start-Sleep -Seconds 5
    if ($attempt -eq 40) { throw "Dependency readiness timed out." }
}

# The OpenEMR image exposes this project-supported CLI. Its output is captured
# in memory and parsed without ever being written to the console.
if ($freshRuntime) {
    $oauthCapture = Join-Path $runtimeRoot ("oauth-{0}.tmp" -f ([guid]::NewGuid().ToString("N")))
    try {
        Invoke-SafeNative "docker.exe" @("compose", "-f", $composeFile, "--env-file", $runtimeFile, "exec", "-T", "openemr", "openemr-dev:register-api-test-client", "--site=default") | Set-Content -LiteralPath $oauthCapture -Encoding utf8
        Invoke-SafeNative "node.exe" @($helper, "merge-oauth", "--environment", $runtimeFile, "--capture", $oauthCapture) "OpenEMR OAuth output did not contain safe machine-readable credentials." | Out-Null
    } finally {
        if (Test-Path -LiteralPath $oauthCapture) { Remove-Item -LiteralPath $oauthCapture -Force -ErrorAction SilentlyContinue }
    }
}

Invoke-SafeNative "docker.exe" @("compose", "-f", $composeFile, "--env-file", $runtimeFile, "up", "-d", "api") "API startup failed." | Out-Null
Invoke-SafeNative "docker.exe" @("compose", "-f", $composeFile, "--env-file", $runtimeFile, "exec", "-T", "api", "node", "--input-type=module", "-e", "import { SqliteClient } from './services/orchestration/src/db.mjs'; new SqliteClient();") "Fresh database migration verification failed." | Out-Null
try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3001/health"
    if ($health.StatusCode -ne 200) { throw "API health endpoint returned an unexpected status." }
} catch { throw "API health verification failed." }

Write-Host "Windows VEMS development bootstrap complete. Runtime secrets remain in $runtimeFile and were not printed."
