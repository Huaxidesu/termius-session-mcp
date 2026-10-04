import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
export function createPrivateDirectory(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory); // Create only the requested leaf; never modify parent ACLs.
    const identity = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
    const sid = identity.match(/S-1-5-21-(?:\d+-){3}\d+/)?.[0];
    if (!sid) throw new Error('Unable to identify the current Windows account');
    execFileSync('icacls.exe', [directory, '/inheritance:r', '/grant:r', '*' + sid + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F'], { stdio: 'pipe', windowsHide: true });
  }
  requirePrivateDirectory(directory);
}
export function requirePrivateDirectory(directory) {
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Linked state directory refused');
  const script = `$ErrorActionPreference='Stop'; $a=Get-Acl -LiteralPath $env:TSM_STATE_DIRECTORY; $u=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $ok=$a.AreAccessRulesProtected -and $a.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $u; foreach($r in $a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -ne $u -and $r.IdentityReference.Value -ne 'S-1-5-18'){$ok=$false}}; if(-not $ok){exit 2}`;
  try {
    const env = { ...process.env, TSM_STATE_DIRECTORY: directory };
    // Do not make Windows PowerShell load incompatible PowerShell 7 modules.
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env, stdio: 'pipe', windowsHide: true, timeout: 10000 });
  } catch { throw new Error('Private-state ACL check failed. Run setup.ps1 from your own Windows account; administrator mode is not required.'); }
}
