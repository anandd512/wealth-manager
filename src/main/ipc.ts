import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { writeFileSync, readFileSync, unlinkSync, existsSync, rmSync } from 'fs'
import { basename, join } from 'path'
import { CHANNELS } from '../shared/ipc'
import type {
  AccountInput,
  AccountCategory,
  InsurancePolicyInput,
  IdentityDocumentInput,
  CreditCardInput,
  VaultEntryInput,
  ReminderSettings,
  CheckInScheduleSettings,
  AuthStatus,
  UpcomingItemType,
  UpcomingAction
} from '../shared/types'
import * as auth from './auth'
import { openDatabase, closeDatabase, rekeyDatabase, isUnlocked, decrypt, getCurrentKey } from './db'
import {
  syncStatus,
  requestEmailVerification,
  confirmEmailVerification,
  registerSync,
  loginSync,
  logoutSync,
  syncNow
} from './sync'
import { getStorageMode, setStorageMode, type StorageMode } from './storageMode'
import {
  notifyStatus,
  requestNotifyVerification,
  confirmNotifyVerification,
  clearNotifyVerification
} from './notify'
import * as accounts from './services/accounts'
import * as netWorth from './services/netWorth'
import * as insurance from './services/insurance'
import * as identityDocs from './services/identityDocuments'
import * as creditCards from './services/creditCards'
import * as vault from './services/vault'
import { extractPolicyDetails } from './services/insuranceParser'
import { extractIdentityDocDetails } from './services/identityDocParser'
import { testAnthropicConnection, testOpenAiConnection } from './services/extraction'
import { extractLoanSchedule } from './services/loanScheduleParser'
import {
  storeDocument,
  openDocumentForViewing,
  cleanupTempViewFiles,
  resolveDocumentPath,
  ensureDocumentAvailableLocally,
  documentsDir
} from './fileStore'
import { refreshAccountPrice } from './services/priceFetch'
import * as settings from './services/settings'
import { sendTestEmail } from './services/email'
import { getUpcomingItems, dismissUpcomingItem } from './services/upcoming'
import { exportBackup, importBackup, readBackupSummary } from './services/backup'
import { todayLocalDateString } from './dateUtils'
import {
  checkWindowsHelloAvailability,
  requestWindowsHelloVerification,
  isWindowsHelloEnabled,
  enableWindowsHello,
  disableWindowsHello,
  getStoredHelloKey
} from './windowsHello'
import { checkReminders, startScheduler, stopScheduler } from './scheduler'
import { checkForUpdatesNow, getUpdateStatus, setAutoCheck } from './updater'

function requireUnlocked(): void {
  if (!isUnlocked()) throw new Error('App is locked')
}

async function pickDocumentFile(
  win: BrowserWindow | null,
  title: string
): Promise<string | null> {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    title,
    properties: ['openFile'],
    filters: [{ name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

async function downloadDocument(
  win: BrowserWindow | null,
  storedPath: string,
  suggestedName: string | null
): Promise<{ ok: boolean }> {
  if (!win) return { ok: false }
  const result = await dialog.showSaveDialog(win, {
    title: 'Save document',
    defaultPath: suggestedName ?? basename(storedPath).replace(/\.enc$/, '')
  })
  if (result.canceled || !result.filePath) return { ok: false }
  await ensureDocumentAvailableLocally(storedPath)
  const encrypted = readFileSync(resolveDocumentPath(storedPath))
  const plaintext = decrypt(encrypted, getCurrentKey())
  writeFileSync(result.filePath, plaintext)
  return { ok: true }
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(CHANNELS.authStatus, (): AuthStatus => ({
    initialized: auth.isInitialized(),
    unlocked: isUnlocked()
  }))

  ipcMain.handle(CHANNELS.authSetup, async (_e, password: string) => {
    const key = auth.setupMasterPassword(password)
    await openDatabase(key)
    startScheduler()
    return { ok: true }
  })

  ipcMain.handle(CHANNELS.authUnlock, async (_e, password: string) => {
    const key = auth.verifyMasterPassword(password)
    if (!key) return { ok: false, error: 'Incorrect password' }
    try {
      await openDatabase(key)
    } catch (err) {
      return { ok: false, error: 'Could not open database: ' + (err as Error).message }
    }
    startScheduler()
    return { ok: true }
  })

  ipcMain.handle(CHANNELS.authLock, () => {
    stopScheduler()
    closeDatabase()
    cleanupTempViewFiles()
    return { ok: true }
  })

  ipcMain.handle(CHANNELS.authResetData, () => {
    try {
      stopScheduler()
      closeDatabase()
      cleanupTempViewFiles()
      const userData = app.getPath('userData')
      const authPath = join(userData, 'auth.json')
      const dbPath = join(userData, 'wealth.db.enc')
      if (existsSync(authPath)) unlinkSync(authPath)
      if (existsSync(dbPath)) unlinkSync(dbPath)
      const docsPath = join(userData, 'documents')
      if (existsSync(docsPath)) rmSync(docsPath, { recursive: true, force: true })
      app.relaunch()
      app.exit(0)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(CHANNELS.authChangePassword, (_e, currentPassword: string, newPassword: string) => {
    const key = auth.verifyMasterPassword(currentPassword)
    if (!key) return { ok: false, error: 'Current password is incorrect' }
    const newKey = auth.rotateMasterPassword(newPassword)
    rekeyDatabase(newKey)
    // Keep the Windows Hello-gated key in sync so it isn't left pointing at the old one.
    if (isWindowsHelloEnabled()) enableWindowsHello(newKey)
    return { ok: true }
  })

  ipcMain.handle(CHANNELS.storageModeStatus, () => {
    let mode = getStorageMode()
    // A pre-existing install from before this feature already has an auth.json —
    // it's implicitly been "local only" the whole time, so treat it as answered
    // rather than retroactively asking. Fresh installs get `mode: null` here, which
    // is what tells the renderer to show the choice screen.
    if (!mode && auth.isInitialized()) {
      setStorageMode('local')
      mode = 'local'
    }
    return { mode }
  })

  ipcMain.handle(CHANNELS.storageModeSet, (_e, mode: StorageMode) => {
    setStorageMode(mode)
    return { ok: true }
  })

  ipcMain.handle(CHANNELS.syncStatus, () => syncStatus())

  ipcMain.handle(CHANNELS.syncRequestEmailVerification, async (_e, email: string) => {
    try {
      await requestEmailVerification(email)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(CHANNELS.syncConfirmEmailVerification, async (_e, email: string, code: string) => {
    try {
      const verificationToken = await confirmEmailVerification(email, code)
      return { ok: true, verificationToken }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    CHANNELS.syncRegister,
    async (_e, email: string, password: string, verificationToken: string) => {
      try {
        await registerSync(email, password, verificationToken)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(CHANNELS.syncLogin, async (_e, email: string, password: string) => {
    try {
      await loginSync(email, password)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(CHANNELS.syncLogout, () => {
    logoutSync()
    return { ok: true }
  })

  ipcMain.handle(CHANNELS.syncNow, async () => {
    requireUnlocked() // reads/writes the local SQLite tables, which need the app unlocked
    try {
      await syncNow()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(CHANNELS.authWindowsHelloAvailable, async () => {
    return checkWindowsHelloAvailability()
  })
  ipcMain.handle(CHANNELS.authWindowsHelloEnabled, () => {
    return isWindowsHelloEnabled()
  })
  ipcMain.handle(CHANNELS.authEnableWindowsHello, () => {
    requireUnlocked()
    const ok = enableWindowsHello(getCurrentKey())
    return { ok }
  })
  ipcMain.handle(CHANNELS.authDisableWindowsHello, () => {
    disableWindowsHello()
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.authUnlockWithWindowsHello, async () => {
    const storedKey = getStoredHelloKey()
    if (!storedKey) return { ok: false, error: 'Windows Hello is not set up for this app.' }
    const verified = await requestWindowsHelloVerification('Unlock Artha')
    if (!verified) return { ok: false, error: 'Verification was not completed.' }
    try {
      await openDatabase(storedKey)
    } catch (err) {
      return { ok: false, error: 'Could not open database: ' + (err as Error).message }
    }
    startScheduler()
    return { ok: true }
  })

  ipcMain.handle(CHANNELS.accountsList, () => {
    requireUnlocked()
    return accounts.listAccounts()
  })
  ipcMain.handle(CHANNELS.accountsCreate, (_e, input: AccountInput) => {
    requireUnlocked()
    return accounts.createAccount(input)
  })
  ipcMain.handle(CHANNELS.accountsUpdate, (_e, id: number, input: Partial<AccountInput>) => {
    requireUnlocked()
    return accounts.updateAccount(id, input)
  })
  ipcMain.handle(CHANNELS.accountsDelete, (_e, id: number) => {
    requireUnlocked()
    accounts.deleteAccount(id)
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.accountsHistory, (_e, id: number) => {
    requireUnlocked()
    return accounts.getValueHistory(id)
  })
  ipcMain.handle(
    CHANNELS.accountsCheckIn,
    (
      _e,
      id: number,
      date: string,
      value: number,
      investedValue?: number | null,
      quantity?: number | null
    ) => {
      requireUnlocked()
      return accounts.checkInValue(id, date, value, investedValue, quantity)
    }
  )
  ipcMain.handle(
    CHANNELS.accountsUpdateValueHistory,
    (
      _e,
      historyId: number,
      date: string,
      value: number,
      investedValue?: number | null,
      quantity?: number | null
    ) => {
      requireUnlocked()
      return accounts.updateValueHistoryEntry(historyId, date, value, investedValue, quantity)
    }
  )
  ipcMain.handle(CHANNELS.accountsDeleteValueHistory, (_e, historyId: number) => {
    requireUnlocked()
    accounts.deleteValueHistoryEntry(historyId)
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.accountsCategoryHistory, (_e, category: AccountCategory) => {
    requireUnlocked()
    return accounts.getCategoryValueHistory(category)
  })
  ipcMain.handle(CHANNELS.accountsRefreshPrice, async (_e, id: number) => {
    requireUnlocked()
    return refreshAccountPrice(id)
  })
  ipcMain.handle(CHANNELS.accountsPickDocument, async () => {
    return pickDocumentFile(getWindow(), 'Select loan repayment schedule')
  })
  ipcMain.handle(CHANNELS.accountsExtractLoanSchedule, async (_e, sourcePath: string) => {
    requireUnlocked()
    const extraction = await extractLoanSchedule(sourcePath)
    const { storedPath, originalName } = await storeDocument(sourcePath)
    return { extraction, storedPath, originalName }
  })
  ipcMain.handle(CHANNELS.accountsReExtractLoanSchedule, async (_e, id: number) => {
    requireUnlocked()
    const account = accounts.getAccount(id)
    if (!account) throw new Error('Account not found')
    if (!account.document_path) throw new Error('This account has no document attached')
    const tempPath = await openDocumentForViewing(account.document_path)
    const extraction = await extractLoanSchedule(tempPath)
    return { extraction, storedPath: account.document_path, originalName: account.document_original_name }
  })
  ipcMain.handle(CHANNELS.accountsOpenDocument, async (_e, docPath: string) => {
    requireUnlocked()
    const tempPath = await openDocumentForViewing(docPath)
    await shell.openPath(tempPath)
    return { ok: true }
  })
  ipcMain.handle(
    CHANNELS.accountsDownloadDocument,
    async (_e, docPath: string, suggestedName: string | null) => {
      requireUnlocked()
      return downloadDocument(getWindow(), docPath, suggestedName)
    }
  )

  ipcMain.handle(CHANNELS.netWorthSummary, () => {
    requireUnlocked()
    return netWorth.computeTotals()
  })
  ipcMain.handle(CHANNELS.netWorthHistory, () => {
    requireUnlocked()
    return netWorth.getHistory()
  })
  ipcMain.handle(CHANNELS.netWorthBreakdown, () => {
    requireUnlocked()
    return netWorth.getBreakdownByCategory()
  })

  ipcMain.handle(CHANNELS.dashboardUpcoming, () => {
    requireUnlocked()
    return getUpcomingItems()
  })
  ipcMain.handle(
    CHANNELS.dashboardDismissUpcoming,
    (_e, itemType: UpcomingItemType, itemId: number, dueDate: string, status: UpcomingAction) => {
      requireUnlocked()
      dismissUpcomingItem(itemType, itemId, dueDate, status)
      return { ok: true }
    }
  )

  ipcMain.handle(CHANNELS.insuranceList, () => {
    requireUnlocked()
    return insurance.listPolicies()
  })
  ipcMain.handle(CHANNELS.insuranceCreate, (_e, input: InsurancePolicyInput) => {
    requireUnlocked()
    return insurance.createPolicy(input)
  })
  ipcMain.handle(CHANNELS.insuranceUpdate, (_e, id: number, input: Partial<InsurancePolicyInput>) => {
    requireUnlocked()
    return insurance.updatePolicy(id, input)
  })
  ipcMain.handle(CHANNELS.insuranceDelete, (_e, id: number) => {
    requireUnlocked()
    insurance.deletePolicy(id)
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.insurancePickFile, async () => {
    return pickDocumentFile(getWindow(), 'Select insurance policy document')
  })
  ipcMain.handle(CHANNELS.insuranceExtract, async (_e, sourcePath: string) => {
    requireUnlocked()
    const extraction = await extractPolicyDetails(sourcePath)
    const { storedPath, originalName } = await storeDocument(sourcePath)
    return { extraction, storedPath, originalName }
  })
  ipcMain.handle(CHANNELS.insuranceReExtract, async (_e, id: number) => {
    requireUnlocked()
    const policy = insurance.getPolicy(id)
    if (!policy) throw new Error('Policy not found')
    if (!policy.document_path) throw new Error('This policy has no document attached')
    const tempPath = await openDocumentForViewing(policy.document_path)
    const extraction = await extractPolicyDetails(tempPath)
    return { extraction, storedPath: policy.document_path, originalName: policy.document_original_name }
  })
  ipcMain.handle(CHANNELS.insuranceOpenDocument, async (_e, docPath: string) => {
    requireUnlocked()
    const tempPath = await openDocumentForViewing(docPath)
    await shell.openPath(tempPath)
    return { ok: true }
  })
  ipcMain.handle(
    CHANNELS.insuranceDownloadDocument,
    async (_e, docPath: string, suggestedName: string | null) => {
      requireUnlocked()
      return downloadDocument(getWindow(), docPath, suggestedName)
    }
  )

  ipcMain.handle(CHANNELS.identityDocsList, () => {
    requireUnlocked()
    return identityDocs.listIdentityDocuments()
  })
  ipcMain.handle(CHANNELS.identityDocsCreate, (_e, input: IdentityDocumentInput) => {
    requireUnlocked()
    return identityDocs.createIdentityDocument(input)
  })
  ipcMain.handle(
    CHANNELS.identityDocsUpdate,
    (_e, id: number, input: Partial<IdentityDocumentInput>) => {
      requireUnlocked()
      return identityDocs.updateIdentityDocument(id, input)
    }
  )
  ipcMain.handle(CHANNELS.identityDocsDelete, (_e, id: number) => {
    requireUnlocked()
    identityDocs.deleteIdentityDocument(id)
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.identityDocsPickFile, async () => {
    return pickDocumentFile(getWindow(), 'Select ID document')
  })
  ipcMain.handle(CHANNELS.identityDocsExtract, async (_e, sourcePath: string) => {
    requireUnlocked()
    const extraction = await extractIdentityDocDetails(sourcePath)
    const { storedPath, originalName } = await storeDocument(sourcePath)
    return { extraction, storedPath, originalName }
  })
  ipcMain.handle(CHANNELS.identityDocsReExtract, async (_e, id: number) => {
    requireUnlocked()
    const doc = identityDocs.getIdentityDocument(id)
    if (!doc) throw new Error('Document not found')
    if (!doc.document_path) throw new Error('This document has no file attached')
    const tempPath = await openDocumentForViewing(doc.document_path)
    const extraction = await extractIdentityDocDetails(tempPath)
    return { extraction, storedPath: doc.document_path, originalName: doc.document_original_name }
  })
  ipcMain.handle(CHANNELS.identityDocsOpenDocument, async (_e, docPath: string) => {
    requireUnlocked()
    const tempPath = await openDocumentForViewing(docPath)
    await shell.openPath(tempPath)
    return { ok: true }
  })
  ipcMain.handle(
    CHANNELS.identityDocsDownloadDocument,
    async (_e, docPath: string, suggestedName: string | null) => {
      requireUnlocked()
      return downloadDocument(getWindow(), docPath, suggestedName)
    }
  )

  ipcMain.handle(CHANNELS.creditCardsList, () => {
    requireUnlocked()
    return creditCards.listCreditCards()
  })
  ipcMain.handle(CHANNELS.creditCardsCreate, (_e, input: CreditCardInput) => {
    requireUnlocked()
    return creditCards.createCreditCard(input)
  })
  ipcMain.handle(CHANNELS.creditCardsUpdate, (_e, id: number, input: Partial<CreditCardInput>) => {
    requireUnlocked()
    return creditCards.updateCreditCard(id, input)
  })
  ipcMain.handle(CHANNELS.creditCardsDelete, (_e, id: number) => {
    requireUnlocked()
    creditCards.deleteCreditCard(id)
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.creditCardsDueDates, () => {
    requireUnlocked()
    return creditCards.getUpcomingDueDates()
  })

  ipcMain.handle(CHANNELS.vaultList, () => {
    requireUnlocked()
    return vault.listVaultEntries()
  })
  ipcMain.handle(CHANNELS.vaultCreate, (_e, input: VaultEntryInput) => {
    requireUnlocked()
    return vault.createVaultEntry(input)
  })
  ipcMain.handle(CHANNELS.vaultUpdate, (_e, id: number, input: Partial<VaultEntryInput>) => {
    requireUnlocked()
    return vault.updateVaultEntry(id, input)
  })
  ipcMain.handle(CHANNELS.vaultDelete, (_e, id: number) => {
    requireUnlocked()
    vault.deleteVaultEntry(id)
    return { ok: true }
  })

  ipcMain.handle(CHANNELS.settingsGet, () => {
    requireUnlocked()
    return settings.getAppSettings()
  })
  ipcMain.handle(CHANNELS.settingsSetReminders, (_e, reminders: ReminderSettings) => {
    requireUnlocked()
    settings.setReminderSettings(reminders)
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.settingsSetCheckInSchedule, (_e, schedule: CheckInScheduleSettings) => {
    requireUnlocked()
    settings.setCheckInScheduleSettings(schedule)
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.settingsSetExtractionProvider, (_e, provider: 'anthropic' | 'openai') => {
    requireUnlocked()
    settings.setExtractionProvider(provider)
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.settingsSetAnthropicKey, (_e, key: string) => {
    if (key) settings.setAnthropicApiKey(key)
    else settings.clearAnthropicApiKey()
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.settingsClearAnthropicKey, () => {
    settings.clearAnthropicApiKey()
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.settingsSetOpenAiKey, (_e, key: string) => {
    if (key) settings.setOpenAiApiKey(key)
    else settings.clearOpenAiApiKey()
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.settingsClearOpenAiKey, () => {
    settings.clearOpenAiApiKey()
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.settingsSetOpenAiBaseUrl, (_e, baseUrl: string) => {
    requireUnlocked()
    settings.setOpenAiBaseUrl(baseUrl)
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.settingsSetOpenAiModel, (_e, model: string) => {
    requireUnlocked()
    settings.setOpenAiModel(model)
    return { ok: true }
  })
  ipcMain.handle(CHANNELS.notifyStatus, () => notifyStatus())

  ipcMain.handle(CHANNELS.notifyRequestVerification, async (_e, email: string) => {
    try {
      await requestNotifyVerification(email)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(CHANNELS.notifyConfirmVerification, async (_e, email: string, code: string) => {
    try {
      await confirmNotifyVerification(email, code)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(CHANNELS.notifyDisconnect, () => {
    clearNotifyVerification()
    return { ok: true }
  })

  ipcMain.handle(CHANNELS.settingsTestEmail, async () => {
    try {
      await sendTestEmail()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(CHANNELS.settingsTestAnthropicKey, async () => {
    try {
      await testAnthropicConnection()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(CHANNELS.settingsTestOpenAiKey, async () => {
    try {
      await testOpenAiConnection()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(CHANNELS.remindersCheckNow, async () => {
    requireUnlocked()
    await checkReminders()
    return { ok: true }
  })

  ipcMain.handle(CHANNELS.backupExport, async () => {
    requireUnlocked()
    const win = getWindow()
    if (!win) return { ok: false }
    const result = await dialog.showSaveDialog(win, {
      title: 'Export backup',
      defaultPath: `artha-backup-${todayLocalDateString()}.wmbackup`,
      filters: [{ name: 'Artha Backup', extensions: ['wmbackup'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false }
    const info = exportBackup(result.filePath)
    return { ok: true, path: result.filePath, ...info }
  })

  ipcMain.handle(CHANNELS.backupPickFile, async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Select backup file',
      properties: ['openFile'],
      filters: [{ name: 'Artha Backup', extensions: ['wmbackup'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(CHANNELS.backupSummary, (_e, path: string) => {
    return readBackupSummary(path)
  })

  ipcMain.handle(CHANNELS.backupImport, (_e, path: string) => {
    if (isUnlocked()) {
      stopScheduler()
      closeDatabase()
      cleanupTempViewFiles()
    }
    importBackup(path)
    const win = getWindow()
    if (win) {
      win.reload()
    } else {
      app.relaunch()
      app.exit(0)
    }
    return { ok: true }
  })

  ipcMain.handle(CHANNELS.updatesStatus, () => getUpdateStatus())

  ipcMain.handle(CHANNELS.updatesSetAutoCheck, (_e, enabled: boolean) => {
    setAutoCheck(Boolean(enabled))
    return getUpdateStatus()
  })

  ipcMain.handle(CHANNELS.updatesCheckNow, () => checkForUpdatesNow())
}
