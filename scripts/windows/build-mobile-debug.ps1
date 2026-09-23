[CmdletBinding()]
param([string]$JavaHome = $env:JAVA_HOME)
. (Join-Path $PSScriptRoot 'common.ps1')
Set-MobileEnvironment
if (-not $JavaHome) { throw 'Set JAVA_HOME or pass -JavaHome with a Windows JDK 17 installation.' }
$java = Join-Path $JavaHome 'bin\java.exe'
if (-not (Test-Path -LiteralPath $java)) { throw 'JDK 17 missing; pass -JavaHome with a Windows JDK 17 installation.' }
$version = Invoke-Native $java @('-version') 'JDK validation failed'
if (($version | Out-String) -notmatch 'version "17\.') { throw 'This build entry point requires JDK 17.' }
$env:JAVA_HOME = $JavaHome
$env:Path = (Join-Path $JavaHome 'bin') + ';' + $env:Path
$mobile = Join-Path $script:RepoRoot 'apps\mobile-crew'
Push-Location -LiteralPath $mobile
try {
    Invoke-Native 'npx.cmd' @('expo', 'prebuild', '--platform', 'android', '--no-install') 'Android prebuild failed' | Out-Null
    Push-Location -LiteralPath (Join-Path $mobile 'android')
    try { Invoke-Native '.\gradlew.bat' @('assembleDebug', '--no-daemon', '-PreactNativeDevServerPort=8081', '-PreactNativeArchitectures=x86_64') 'Android debug build failed' | Out-Null }
    finally { Pop-Location }
    $apk = Join-Path $mobile 'android\app\build\outputs\apk\debug\app-debug.apk'
    $aapt = Get-ChildItem (Join-Path $env:ANDROID_HOME 'build-tools') -Filter aapt.exe -Recurse | Sort-Object FullName -Descending | Select-Object -First 1
    $metadata = Invoke-Native $aapt.FullName @('dump', 'badging', $apk) 'APK metadata inspection failed'
    $package = $metadata | Where-Object { "$_" -match '^package:' }
    if (($package | Out-String) -notmatch "name='org.vems.mobilecrew'") { throw 'Unexpected APK application ID.' }
    Write-Host "APK: $apk"
    Write-Host "Bytes: $((Get-Item -LiteralPath $apk).Length)"
    Write-Host "SHA-256: $((Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash)"
    Write-Host $package
} finally { Pop-Location }
