Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:RuntimeRoot = Join-Path $env:LOCALAPPDATA 'VEMS'
$script:RuntimeFile = Join-Path $script:RuntimeRoot 'development.env'
$script:ComposeFile = Join-Path $script:RepoRoot 'infra\docker-compose.dev.yml'

function Invoke-Native([string]$File, [string[]]$Arguments, [string]$Failure = 'Command failed') {
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $captured = & $File @Arguments 2>&1
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw "$Failure (exit $code); output suppressed to protect credentials." }
    return $captured
}

function Invoke-Compose([string[]]$Arguments) {
    Invoke-Native 'docker.exe' (@('compose', '--project-name', 'vems-dev', '--env-file', $script:RuntimeFile, '-f', $script:ComposeFile) + $Arguments) 'VEMS Compose operation failed'
}

function Assert-Environment {
    if (-not (Test-Path -LiteralPath $script:RuntimeFile)) { throw 'Run bootstrap-development.ps1 first.' }
    Invoke-Native 'node.exe' @((Join-Path $PSScriptRoot 'development-bootstrap.mjs'), 'validate', '--environment', $script:RuntimeFile) 'Development environment validation failed' | Out-Null
}

function Protect-RuntimeDirectory {
    New-Item -ItemType Directory -Path $script:RuntimeRoot -Force | Out-Null
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $directory = New-Object System.IO.DirectoryInfo($script:RuntimeRoot)
    $acl = $directory.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($entry in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($entry) }
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    $directory.SetAccessControl($acl)
}

function Assert-FreePorts([int[]]$Ports) {
    $containers = @(Invoke-Native 'docker.exe' @('ps', '-q') 'Docker Desktop must be running')
    $ownedPorts = @()
    foreach ($id in $containers) {
        if (-not "$id".Trim()) { continue }
        $metadata = Invoke-Native 'docker.exe' @('inspect', '--format', '{{json .NetworkSettings.Ports}}', "$id")
        $labels = (Invoke-Native 'docker.exe' @('inspect', '--format', '{{json .Config.Labels}}', "$id") | Out-String) | ConvertFrom-Json
        $name = (Invoke-Native 'docker.exe' @('inspect', '--format', '{{.Name}}', "$id") | Out-String).Trim()
        $project = $labels.PSObject.Properties['com.docker.compose.project']
        foreach ($port in $Ports) {
            if (($metadata | Out-String) -match ('"HostPort":"' + $port + '"')) {
                if ($project -and $project.Value -eq 'vems-dev') { $ownedPorts += $port }
                else { throw "Port $port is published by retained/unrelated container $name. Resolve the conflict explicitly; no container was changed." }
            }
        }
    }
    foreach ($port in $Ports) {
        foreach ($listener in @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) {
            if ($port -in $ownedPorts) { continue }
            $owner = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
            throw "Port $port is occupied by PID $($listener.OwningProcess) ($($owner.ProcessName)). Resolve the conflict before startup."
        }
    }
}

function Set-MobileEnvironment {
    if (-not $env:ANDROID_HOME) {
        $env:ANDROID_HOME = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    }
    $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
    if (-not (Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'))) { throw 'Windows Android SDK adb.exe is missing.' }
    $env:NODE_ENV = 'development'
    $env:APP_ENV = 'development'
    $env:EXPO_PUBLIC_API_PROFILE = 'android-emulator-development'
    $env:EXPO_PUBLIC_API_URL = 'http://10.0.2.2:3001'
    $env:EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH = 'true'
}

function Get-AndroidDevice([string]$Device) {
    Set-MobileEnvironment
    $script:Adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
    $devices = @(Invoke-Native $script:Adb @('devices') | Where-Object { "$_" -match '^emulator-\d+\s+device$' } | ForEach-Object { ("$_" -split '\s+')[0] })
    if ($Device) { if ($Device -notin $devices) { throw 'Selected emulator is not online.' } }
    elseif ($devices.Count -eq 1) { $Device = $devices[0] }
    else { throw 'Start Pixel Tablet in Android Studio; select exactly one online emulator or pass -Device emulator-NNNN.' }
    $deadline = (Get-Date).AddMinutes(3)
    do {
        $boot = (Invoke-Native $script:Adb @('-s', $Device, 'shell', 'getprop', 'sys.boot_completed') | Out-String).Trim()
        if ($boot -eq '1') { break }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    if ($boot -ne '1') { throw 'Emulator boot timed out.' }
    $reverse = (Invoke-Native $script:Adb @('-s', $Device, 'reverse', '--list') | Out-String).Trim()
    if ($reverse) { throw 'ADB reverse rules are present. Remove them explicitly before validation.' }
    return $Device
}

# Reinstall locked dependencies only when the lockfile changed, and never while Metro's port is in use: npm ci rewrites
# node_modules, which floods Metro's file watcher (see docs/WINDOWS_NATIVE_DEVELOPMENT_BOOTSTRAP.md).
function Invoke-LockedInstall {
    $lock = Join-Path $script:RepoRoot 'package-lock.json'
    $stamp = Join-Path $script:RepoRoot 'node_modules\.vems-install-stamp'
    $helper = Join-Path $PSScriptRoot 'development-bootstrap.mjs'
    $installed = Test-Path -LiteralPath (Join-Path $script:RepoRoot 'node_modules\.package-lock.json')
    $metro = @(Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue).Count -gt 0
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & node.exe $helper 'install-decision' '--lock' $lock '--stamp' $stamp '--installed' "$installed".ToLower() '--metro' "$metro".ToLower() 2>&1
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw ((@($output | ForEach-Object { "$_" }) -join ' ').Trim()) }
    if ((@($output | ForEach-Object { "$_" }) -join ' ').Trim() -eq 'skip') { Write-Host 'Locked dependencies are unchanged; npm ci skipped.'; return }
    Push-Location -LiteralPath $script:RepoRoot
    try {
        Invoke-Native 'npm.cmd' @('ci', '--no-audit', '--no-fund') 'Locked dependency installation failed' | Out-Null
        Invoke-Native 'node.exe' @($helper, 'write-install-stamp', '--lock', $lock, '--stamp', $stamp) 'Writing the install stamp failed' | Out-Null
    } finally { Pop-Location }
}