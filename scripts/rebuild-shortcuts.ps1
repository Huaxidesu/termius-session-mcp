# Rebuild Termius Session MCP launcher shortcuts after moving the repo.
# Usage: powershell -ExecutionPolicy Bypass -File rebuild-shortcuts.ps1
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less files as ANSI.
param(
  [string]$RepoRoot   = (Split-Path -Parent $PSScriptRoot),
  [string]$TermiusExe = 'C:\Program Files\WindowsApps\Crystalnix.Termius_10.2.1.0_x64__0m0t0j9spf6x8\app\Termius.exe',
  [string]$NodeExe    = 'C:\Users\huaxi\.workbuddy\binaries\node\versions\22.22.2-6\node.exe',
  [string]$StateDir   = 'C:\Users\huaxi\AppData\Local\TermiusSessionMCP'
)
$ErrorActionPreference = 'Stop'

$launchCmd = Join-Path $RepoRoot 'scripts\launch.cmd'
$clientJs  = Join-Path $RepoRoot 'src\client.js'
foreach ($p in @($TermiusExe, $NodeExe, $launchCmd, $clientJs)) {
  if (-not (Test-Path -LiteralPath $p)) { throw "Missing file: $p" }
}

$wsh = New-Object -ComObject WScript.Shell
function New-Launcher([string]$path) {
  # CreateShortcut on an existing .lnk loads it; Save() overwrites in place.
  # Never delete first: Desktop paths are covered by the safe-delete guard.
  $sc = $wsh.CreateShortcut($path)
  $sc.TargetPath       = (Join-Path $env:SystemRoot 'System32/cmd.exe')
  $sc.Arguments        = '/d /c ""' + $launchCmd + '" "' + $TermiusExe + '" "' + $NodeExe + '" "' + $StateDir + '""'
  $sc.WorkingDirectory = $RepoRoot
  $sc.WindowStyle      = 1
  $sc.IconLocation     = $TermiusExe + ',0'
  $sc.Description      = 'Start Termius with an off-by-default MCP panel'
  $sc.Save()
  Write-Output ('shortcut: ' + $path)
}

New-Launcher (Join-Path $RepoRoot 'scripts\Termius with Session MCP.lnk')
New-Launcher (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Termius (MCP).lnk')

$config = @{ mcpServers = @{ 'termius-session-mcp' = @{ command = $NodeExe; args = @($clientJs, $StateDir) } } } | ConvertTo-Json -Depth 5
$configPath = Join-Path $RepoRoot 'scripts\mcp-config.local.json'
$config | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Output ('client config: ' + $configPath)
Write-Output 'done.'
