import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { closeDatabase } from './db'
import { stopScheduler } from './scheduler'
import { cleanupTempViewFiles } from './fileStore'
import { startAutoUpdates } from './updater'

let mainWindow: BrowserWindow | null = null

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

// Windows' taskbar/Alt-Tab icon specifically wants a proper multi-resolution .ico —
// a plain .png can silently fail to apply there (falling back to Electron's own
// default icon) even though it works fine for the window's title-bar icon. This
// only matters in dev (`npm run dev`, running the stock electron.exe); a packaged
// build gets its icon baked into the .exe itself via electron-builder's own
// `build.win.icon` config in package.json.
const windowIcon = join(__dirname, '../../resources', process.platform === 'win32' ? 'icon.ico' : 'icon.png')

// Without this, Windows has no identity for the running app besides the literal path
// to electron.exe — the same shared binary every Electron project's dev mode runs
// from. That's enough for Windows to cache a taskbar icon against that exe path from
// an earlier run (e.g. before this file ever set a custom icon) and keep showing it
// even after the window's own icon is correct — the title bar updates live, but the
// taskbar button icon on Windows is tied to this ID, not just the window's HICON.
// See https://electronjs.org/docs/latest/tutorial/windows-taskbar.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.ananddeshpande.artha')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    icon: windowIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Links (e.g. a vault entry's website) open in the user's browser — but only web
  // URLs. Handing other schemes to the OS could launch arbitrary local handlers.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isWebUrl(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // The app is a single page; never let the window itself navigate somewhere else.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers(() => mainWindow)
  createWindow()
  startAutoUpdates(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopScheduler()
  closeDatabase()
  cleanupTempViewFiles()
  if (process.platform !== 'darwin') app.quit()
})
