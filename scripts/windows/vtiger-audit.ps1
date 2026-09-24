[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('Start','Validate','Stop','Inspect','Outage','Recover')][string]$Action)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'VEMS-Audit\issue-147'
# Protect only the new audit directory; never source common.ps1 or development.env.
if (-not (Test-Path -LiteralPath $root)) {
    if ($Action -ne 'Start') { throw 'Audit has not been initialized. Run Start first.' }
    New-Item -ItemType Directory -Path $root | Out-Null
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $directory = New-Object System.IO.DirectoryInfo($root)
    $acl = $directory.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($entry in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($entry) }
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    $directory.SetAccessControl($acl)
}
& node.exe (Join-Path $PSScriptRoot 'vtiger-audit.mjs') $Action.ToLower()
if ($LASTEXITCODE -ne 0) { throw "Audit $Action failed (exit $LASTEXITCODE); existing development stack was not targeted." }
