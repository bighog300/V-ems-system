[CmdletBinding()]
param([string]$Device, [switch]$CleanInstall)
. (Join-Path $PSScriptRoot 'common.ps1')
$Device = Get-AndroidDevice $Device
$apk = Join-Path $script:RepoRoot 'apps\mobile-crew\android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path -LiteralPath $apk)) { throw 'Run build-mobile-debug.ps1 first.' }
if ($CleanInstall) {
    if ((Read-Host 'Type DELETE VEMS APP DATA') -cne 'DELETE VEMS APP DATA') { throw 'Clean install cancelled.' }
    Invoke-Native $script:Adb @('-s', $Device, 'uninstall', 'org.vems.mobilecrew') 'Uninstall failed' | Out-Null
}
Invoke-Native $script:Adb @('-s', $Device, 'install', '-r', $apk) 'APK install failed' | Out-Null
Invoke-Native $script:Adb @('-s', $Device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'vems-mobilecrew://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081', 'org.vems.mobilecrew') 'App launch failed' | Out-Null
Write-Host "Installed and launched org.vems.mobilecrew on $Device; application data preserved unless -CleanInstall was requested."
