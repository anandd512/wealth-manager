import { contextBridge, ipcRenderer } from 'electron'
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
  UpcomingItemType,
  UpcomingAction,
  UpdateCheckResult,
  UpdateStatus
} from '../shared/types'

const api = {
  auth: {
    status: () => ipcRenderer.invoke(CHANNELS.authStatus),
    setup: (password: string) => ipcRenderer.invoke(CHANNELS.authSetup, password),
    unlock: (password: string) => ipcRenderer.invoke(CHANNELS.authUnlock, password),
    lock: () => ipcRenderer.invoke(CHANNELS.authLock),
    changePassword: (current: string, next: string) =>
      ipcRenderer.invoke(CHANNELS.authChangePassword, current, next),
    windowsHelloAvailable: () => ipcRenderer.invoke(CHANNELS.authWindowsHelloAvailable),
    windowsHelloEnabled: () => ipcRenderer.invoke(CHANNELS.authWindowsHelloEnabled),
    enableWindowsHello: () => ipcRenderer.invoke(CHANNELS.authEnableWindowsHello),
    disableWindowsHello: () => ipcRenderer.invoke(CHANNELS.authDisableWindowsHello),
    unlockWithWindowsHello: () => ipcRenderer.invoke(CHANNELS.authUnlockWithWindowsHello),
    resetData: () => ipcRenderer.invoke(CHANNELS.authResetData)
  },
  storageMode: {
    status: () => ipcRenderer.invoke(CHANNELS.storageModeStatus),
    set: (mode: 'local' | 'cloud') => ipcRenderer.invoke(CHANNELS.storageModeSet, mode)
  },
  sync: {
    status: () => ipcRenderer.invoke(CHANNELS.syncStatus),
    requestEmailVerification: (email: string) =>
      ipcRenderer.invoke(CHANNELS.syncRequestEmailVerification, email),
    confirmEmailVerification: (email: string, code: string) =>
      ipcRenderer.invoke(CHANNELS.syncConfirmEmailVerification, email, code),
    register: (email: string, password: string, verificationToken: string) =>
      ipcRenderer.invoke(CHANNELS.syncRegister, email, password, verificationToken),
    login: (email: string, password: string) => ipcRenderer.invoke(CHANNELS.syncLogin, email, password),
    logout: () => ipcRenderer.invoke(CHANNELS.syncLogout),
    now: () => ipcRenderer.invoke(CHANNELS.syncNow)
  },
  accounts: {
    list: () => ipcRenderer.invoke(CHANNELS.accountsList),
    create: (input: AccountInput) => ipcRenderer.invoke(CHANNELS.accountsCreate, input),
    update: (id: number, input: Partial<AccountInput>) =>
      ipcRenderer.invoke(CHANNELS.accountsUpdate, id, input),
    remove: (id: number) => ipcRenderer.invoke(CHANNELS.accountsDelete, id),
    history: (id: number) => ipcRenderer.invoke(CHANNELS.accountsHistory, id),
    checkIn: (
      id: number,
      date: string,
      value: number,
      investedValue?: number | null,
      quantity?: number | null
    ) => ipcRenderer.invoke(CHANNELS.accountsCheckIn, id, date, value, investedValue, quantity),
    updateValueHistory: (
      historyId: number,
      date: string,
      value: number,
      investedValue?: number | null,
      quantity?: number | null
    ) =>
      ipcRenderer.invoke(
        CHANNELS.accountsUpdateValueHistory,
        historyId,
        date,
        value,
        investedValue,
        quantity
      ),
    deleteValueHistory: (historyId: number) =>
      ipcRenderer.invoke(CHANNELS.accountsDeleteValueHistory, historyId),
    categoryHistory: (category: AccountCategory) =>
      ipcRenderer.invoke(CHANNELS.accountsCategoryHistory, category),
    pickDocument: () => ipcRenderer.invoke(CHANNELS.accountsPickDocument),
    extractLoanSchedule: (sourcePath: string) =>
      ipcRenderer.invoke(CHANNELS.accountsExtractLoanSchedule, sourcePath),
    reExtractLoanSchedule: (id: number) =>
      ipcRenderer.invoke(CHANNELS.accountsReExtractLoanSchedule, id),
    openDocument: (docPath: string) => ipcRenderer.invoke(CHANNELS.accountsOpenDocument, docPath),
    downloadDocument: (docPath: string, suggestedName: string | null) =>
      ipcRenderer.invoke(CHANNELS.accountsDownloadDocument, docPath, suggestedName)
  },
  netWorth: {
    summary: () => ipcRenderer.invoke(CHANNELS.netWorthSummary),
    history: () => ipcRenderer.invoke(CHANNELS.netWorthHistory),
    breakdown: () => ipcRenderer.invoke(CHANNELS.netWorthBreakdown)
  },
  dashboard: {
    upcoming: () => ipcRenderer.invoke(CHANNELS.dashboardUpcoming),
    dismiss: (itemType: UpcomingItemType, itemId: number, dueDate: string, status: UpcomingAction) =>
      ipcRenderer.invoke(CHANNELS.dashboardDismissUpcoming, itemType, itemId, dueDate, status)
  },
  insurance: {
    list: () => ipcRenderer.invoke(CHANNELS.insuranceList),
    create: (input: InsurancePolicyInput) => ipcRenderer.invoke(CHANNELS.insuranceCreate, input),
    update: (id: number, input: Partial<InsurancePolicyInput>) =>
      ipcRenderer.invoke(CHANNELS.insuranceUpdate, id, input),
    remove: (id: number) => ipcRenderer.invoke(CHANNELS.insuranceDelete, id),
    pickFile: () => ipcRenderer.invoke(CHANNELS.insurancePickFile),
    extract: (sourcePath: string) => ipcRenderer.invoke(CHANNELS.insuranceExtract, sourcePath),
    reExtract: (id: number) => ipcRenderer.invoke(CHANNELS.insuranceReExtract, id),
    openDocument: (docPath: string) => ipcRenderer.invoke(CHANNELS.insuranceOpenDocument, docPath),
    downloadDocument: (docPath: string, suggestedName: string | null) =>
      ipcRenderer.invoke(CHANNELS.insuranceDownloadDocument, docPath, suggestedName)
  },
  identityDocs: {
    list: () => ipcRenderer.invoke(CHANNELS.identityDocsList),
    create: (input: IdentityDocumentInput) => ipcRenderer.invoke(CHANNELS.identityDocsCreate, input),
    update: (id: number, input: Partial<IdentityDocumentInput>) =>
      ipcRenderer.invoke(CHANNELS.identityDocsUpdate, id, input),
    remove: (id: number) => ipcRenderer.invoke(CHANNELS.identityDocsDelete, id),
    pickFile: () => ipcRenderer.invoke(CHANNELS.identityDocsPickFile),
    extract: (sourcePath: string) => ipcRenderer.invoke(CHANNELS.identityDocsExtract, sourcePath),
    reExtract: (id: number) => ipcRenderer.invoke(CHANNELS.identityDocsReExtract, id),
    openDocument: (docPath: string) => ipcRenderer.invoke(CHANNELS.identityDocsOpenDocument, docPath),
    downloadDocument: (docPath: string, suggestedName: string | null) =>
      ipcRenderer.invoke(CHANNELS.identityDocsDownloadDocument, docPath, suggestedName)
  },
  creditCards: {
    list: () => ipcRenderer.invoke(CHANNELS.creditCardsList),
    create: (input: CreditCardInput) => ipcRenderer.invoke(CHANNELS.creditCardsCreate, input),
    update: (id: number, input: Partial<CreditCardInput>) =>
      ipcRenderer.invoke(CHANNELS.creditCardsUpdate, id, input),
    remove: (id: number) => ipcRenderer.invoke(CHANNELS.creditCardsDelete, id),
    dueDates: () => ipcRenderer.invoke(CHANNELS.creditCardsDueDates)
  },
  vault: {
    list: () => ipcRenderer.invoke(CHANNELS.vaultList),
    create: (input: VaultEntryInput) => ipcRenderer.invoke(CHANNELS.vaultCreate, input),
    update: (id: number, input: Partial<VaultEntryInput>) =>
      ipcRenderer.invoke(CHANNELS.vaultUpdate, id, input),
    remove: (id: number) => ipcRenderer.invoke(CHANNELS.vaultDelete, id)
  },
  settings: {
    get: () => ipcRenderer.invoke(CHANNELS.settingsGet),
    setReminders: (reminders: ReminderSettings) =>
      ipcRenderer.invoke(CHANNELS.settingsSetReminders, reminders),
    setCheckInSchedule: (schedule: CheckInScheduleSettings) =>
      ipcRenderer.invoke(CHANNELS.settingsSetCheckInSchedule, schedule),
    setExtractionProvider: (provider: 'anthropic' | 'openai') =>
      ipcRenderer.invoke(CHANNELS.settingsSetExtractionProvider, provider),
    setAnthropicKey: (key: string) => ipcRenderer.invoke(CHANNELS.settingsSetAnthropicKey, key),
    clearAnthropicKey: () => ipcRenderer.invoke(CHANNELS.settingsClearAnthropicKey),
    setOpenAiKey: (key: string) => ipcRenderer.invoke(CHANNELS.settingsSetOpenAiKey, key),
    clearOpenAiKey: () => ipcRenderer.invoke(CHANNELS.settingsClearOpenAiKey),
    setOpenAiBaseUrl: (baseUrl: string) => ipcRenderer.invoke(CHANNELS.settingsSetOpenAiBaseUrl, baseUrl),
    setOpenAiModel: (model: string) => ipcRenderer.invoke(CHANNELS.settingsSetOpenAiModel, model),
    testEmail: () => ipcRenderer.invoke(CHANNELS.settingsTestEmail),
    testAnthropicKey: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(CHANNELS.settingsTestAnthropicKey),
    testOpenAiKey: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke(CHANNELS.settingsTestOpenAiKey)
  },
  notify: {
    status: () => ipcRenderer.invoke(CHANNELS.notifyStatus),
    requestVerification: (email: string) => ipcRenderer.invoke(CHANNELS.notifyRequestVerification, email),
    confirmVerification: (email: string, code: string) =>
      ipcRenderer.invoke(CHANNELS.notifyConfirmVerification, email, code),
    disconnect: () => ipcRenderer.invoke(CHANNELS.notifyDisconnect)
  },
  reminders: {
    checkNow: () => ipcRenderer.invoke(CHANNELS.remindersCheckNow)
  },
  backup: {
    export: () => ipcRenderer.invoke(CHANNELS.backupExport),
    pickFile: () => ipcRenderer.invoke(CHANNELS.backupPickFile),
    summary: (path: string) => ipcRenderer.invoke(CHANNELS.backupSummary, path),
    import: (path: string) => ipcRenderer.invoke(CHANNELS.backupImport, path)
  },
  updates: {
    status: (): Promise<UpdateStatus> => ipcRenderer.invoke(CHANNELS.updatesStatus),
    setAutoCheck: (enabled: boolean): Promise<UpdateStatus> =>
      ipcRenderer.invoke(CHANNELS.updatesSetAutoCheck, enabled),
    checkNow: (): Promise<UpdateCheckResult> => ipcRenderer.invoke(CHANNELS.updatesCheckNow)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
