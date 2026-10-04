param(
  [Parameter(Mandatory=$true)][string]$TermiusExe,
  [string]$NodeExe = (Get-Command node -ErrorAction Stop).Source,
  [string]$StateDirectory = (Join-Path $env:LOCALAPPDATA 'TermiusSessionMCP'),
  [string]$LauncherDirectory = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'
if (-not [IO.Path]::IsPathRooted($StateDirectory)) { throw 'State directory must be absolute' }
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$resolvedTermius = (Resolve-Path -LiteralPath $TermiusExe).Path
$resolvedNode = (Resolve-Path -LiteralPath $NodeExe).Path
if ([IO.Path]::GetFileName($resolvedTermius) -ne 'Termius.exe') { throw 'Expected Termius.exe' }
if (Test-Path -LiteralPath $StateDirectory) {
  if ((Get-Item -LiteralPath $StateDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing a linked state directory' }
  if (Get-ChildItem -Force -LiteralPath $StateDirectory) { throw 'Use an empty private state directory; do not overwrite a live launcher' }
} else { New-Item -ItemType Directory -Path $StateDirectory | Out-Null }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner($sid)
foreach ($principal in @($sid, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($principal, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $StateDirectory -AclObject $acl
New-Item -ItemType Directory -Force -Path $LauncherDirectory | Out-Null
$launcherPath = Join-Path $LauncherDirectory 'Termius with Session MCP.lnk'
if (Test-Path -LiteralPath $launcherPath) { throw 'Launcher already exists; refusing to overwrite' }
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($launcherPath)
$shortcut.TargetPath = (Join-Path $env:SystemRoot 'System32/cmd.exe')
$shortcut.Arguments = '/d /c ""' + (Join-Path $repoRoot 'scripts/launch.cmd') + '" "' + $resolvedTermius + '" "' + $resolvedNode + '" "' + $StateDirectory + '""'
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 1
$shortcut.IconLocation = $resolvedTermius + ',0'
$shortcut.Description = 'Start Termius with an off-by-default, consent-first MCP panel'
$shortcut.Save()
$config = @{ mcpServers = @{ 'termius-session-mcp' = @{ command = $resolvedNode; args = @((Join-Path $repoRoot 'src/client.js'), $StateDirectory) } } } | ConvertTo-Json -Depth 5
$configPath = Join-Path $LauncherDirectory 'mcp-config.local.json'
$config | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Output ('Launcher: ' + $launcherPath)
Write-Output ('Client configuration: ' + $configPath)
Write-Output 'No Termius binaries, credentials or existing shortcuts were modified. Close Termius yourself before using the new launcher.'
