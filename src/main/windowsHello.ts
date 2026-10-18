import { app, safeStorage } from 'electron'
import { execFile } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, unlinkSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'

// Windows Hello (face/fingerprint/PIN) is exposed to Win32 apps only through the WinRT
// UserConsentVerifier API, which Electron doesn't wrap. Rather than add a native node
// module (this project avoids native compilation — see db.ts), the verification prompt
// is triggered by shelling out to a small PowerShell script that reflects into the WinRT
// projection. If that ever fails for any reason (older Windows, locked-down PowerShell,
// no biometric hardware), every caller here treats it as "unavailable" and the normal
// master-password flow keeps working — this is purely a convenience layer on top of it.
//
// What's actually gated behind the biometric prompt is a copy of the already-derived
// database key, encrypted at rest with Electron's safeStorage (OS credential store, tied
// to this Windows user account). That's the same trust boundary safeStorage always has —
// Windows Hello here is a GUI convenience, not additional cryptographic hardening beyond
// what DPAPI already provides for this user account.

const PS_SCRIPT = `
param([string]$Mode, [string]$Message)
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
  })[0]
  function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
  }
  [Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI.UserConsentVerifier,ContentType=WindowsRuntime] | Out-Null
  $availability = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])
  if ($Mode -eq 'Check') {
    Write-Output "AVAILABILITY:$availability"
    exit 0
  }
  if ($availability -ne 'Available') {
    Write-Output "AVAILABILITY:$availability"
    exit 0
  }
  $result = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync($Message)) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])
  Write-Output "RESULT:$result"
} catch {
  Write-Output "ERROR:$($_.Exception.Message)"
}
`

function runScript(mode: 'Check' | 'Verify', message: string): Promise<string> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve('UNSUPPORTED')
      return
    }
    let dir: string
    try {
      dir = mkdtempSync(join(tmpdir(), 'wm-hello-'))
    } catch {
      resolve('ERROR')
      return
    }
    const scriptPath = join(dir, 'verify.ps1')
    try {
      writeFileSync(scriptPath, PS_SCRIPT, 'utf-8')
    } catch {
      resolve('ERROR')
      return
    }
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Mode', mode, '-Message', message],
      { timeout: 30000, windowsHide: true },
      (_err, stdout) => {
        try {
          rmSync(dir, { recursive: true, force: true })
        } catch {
          // best-effort cleanup
        }
        const out = (stdout || '').trim()
        if (!out) {
          resolve('ERROR')
          return
        }
        resolve(out)
      }
    )
  })
}

export async function checkWindowsHelloAvailability(): Promise<boolean> {
  const out = await runScript('Check', '')
  return out === 'AVAILABILITY:Available'
}

export async function requestWindowsHelloVerification(message: string): Promise<boolean> {
  const out = await runScript('Verify', message)
  return out === 'RESULT:Verified'
}

function helloKeyPath(): string {
  return join(app.getPath('userData'), 'windowsHello.key')
}

export function isWindowsHelloEnabled(): boolean {
  return existsSync(helloKeyPath())
}

export function enableWindowsHello(key: Buffer): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  const path = helloKeyPath()
  mkdirSync(dirname(path), { recursive: true })
  const encrypted = safeStorage.encryptString(key.toString('base64'))
  writeFileSync(path, encrypted, { mode: 0o600 })
  return true
}

export function disableWindowsHello(): void {
  const path = helloKeyPath()
  if (existsSync(path)) unlinkSync(path)
}

export function getStoredHelloKey(): Buffer | null {
  const path = helloKeyPath()
  if (!existsSync(path)) return null
  try {
    const encrypted = readFileSync(path)
    const base64 = safeStorage.decryptString(encrypted)
    return Buffer.from(base64, 'base64')
  } catch {
    return null
  }
}
