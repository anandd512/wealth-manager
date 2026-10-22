import { app, dialog, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import electronUpdater from 'electron-updater'
import type { UpdateCheckResult, UpdateStatus } from '../shared/types'

// Updates come from the project's GitHub Releases (see "publish" in package.json).
// electron-updater checks the release's latest.yml over HTTPS and verifies the
// installer's SHA-512 before running it. Only the installed app updates itself —
// dev runs have no release to compare against.
//
// Checking contacts GitHub, so it only happens with the user's say-so: they're asked
// once on first launch, can change it in Settings → Help, and "Check now" is always
// an explicit request. The choice lives outside the encrypted database because the
// first check can happen before the app is unlocked.

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const FIRST_LAUNCH_PROMPT_DELAY_MS = 4000

interface UpdatePrefs {
  autoCheck?: boolean
}

let timer: ReturnType<typeof setInterval> | null = null
let listenersAttached = false

function prefsPath(): string {
  return join(app.getPath('userData'), 'update-prefs.json')
}

function readPrefs(): UpdatePrefs {
  try {
    return JSON.parse(readFileSync(prefsPath(), 'utf-8')) as UpdatePrefs
  } catch {
    return {}
  }
}

function writePrefs(prefs: UpdatePrefs): void {
  writeFileSync(prefsPath(), JSON.stringify(prefs))
}

function updater(): typeof electronUpdater.autoUpdater {
  const { autoUpdater } = electronUpdater
  if (!listenersAttached) {
    listenersAttached = true
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('error', (err) => {
      // Offline, rate-limited or no release yet — try again on the next interval.
      console.error('Update check failed:', err?.message ?? err)
    })
  }
  return autoUpdater
}

function startTimer(): void {
  if (timer) return
  const check = (): void => {
    updater()
      .checkForUpdates()
      .catch(() => {
        // Already reported via the 'error' event.
      })
  }
  check()
  timer = setInterval(check, CHECK_INTERVAL_MS)
}

function stopTimer(): void {
  if (timer) clearInterval(timer)
  timer = null
}

async function askOnFirstLaunch(getWindow: () => BrowserWindow | null): Promise<void> {
  const options = {
    type: 'question' as const,
    buttons: ['Check automatically', 'Not now'],
    defaultId: 0,
    cancelId: 1,
    title: 'Automatic updates',
    message: 'Keep Artha up to date automatically?',
    detail:
      'Artha will check GitHub (github.com) a few times a day for a newer version and ' +
      'download it in the background. Nothing about you or your data is sent. ' +
      'You can change this anytime in Settings → Help.'
  }
  const win = getWindow()
  const { response } = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options)
  setAutoCheck(response === 0)
}

export function getUpdateStatus(): UpdateStatus {
  return {
    supported: app.isPackaged,
    autoCheck: readPrefs().autoCheck === true,
    version: app.getVersion()
  }
}

export function setAutoCheck(enabled: boolean): void {
  writePrefs({ ...readPrefs(), autoCheck: enabled })
  if (!app.isPackaged) return
  if (enabled) startTimer()
  else stopTimer()
}

export async function checkForUpdatesNow(): Promise<UpdateCheckResult> {
  if (!app.isPackaged) return { status: 'unsupported' }
  try {
    const result = await updater().checkForUpdates()
    if (result?.isUpdateAvailable) return { status: 'downloading', version: result.updateInfo.version }
    return { status: 'up-to-date' }
  } catch (err) {
    return { status: 'error', message: (err as Error)?.message ?? String(err) }
  }
}

export function startAutoUpdates(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return

  updater().on('update-downloaded', async (info) => {
    const win = getWindow()
    const options = {
      type: 'info' as const,
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Artha ${info.version} is ready to install.`,
      detail: 'Restart now to finish updating, or it will install the next time you quit Artha.'
    }
    const { response } = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    if (response === 0) updater().quitAndInstall()
  })

  const { autoCheck } = readPrefs()
  if (autoCheck === true) startTimer()
  else if (autoCheck === undefined) {
    setTimeout(() => void askOnFirstLaunch(getWindow), FIRST_LAUNCH_PROMPT_DELAY_MS)
  }
}
