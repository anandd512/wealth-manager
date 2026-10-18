import { getDb } from '../db'
import { getSecret, setSecret, hasSecret, clearSecret } from '../secrets'
import type {
  AppSettings,
  CheckInScheduleSettings,
  ExtractionProvider,
  ReminderSettings,
  SmtpConfig
} from '../../shared/types'

const DEFAULT_REMINDERS: ReminderSettings = {
  daysBefore: 30,
  desktopNotifications: true,
  emailNotifications: false
}

// First Saturday of every month, by default.
const DEFAULT_CHECKIN_SCHEDULE: CheckInScheduleSettings = {
  enabled: true,
  occurrence: 1,
  weekday: 6
}

const DEFAULT_SMTP: Omit<SmtpConfig, 'user'> & { user: string } = {
  host: '',
  port: 587,
  secure: false,
  user: '',
  fromAddress: '',
  toAddress: ''
}

function getKv(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM kv_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function setKv(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO kv_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value)
}

export function getReminderSettings(): ReminderSettings {
  const raw = getKv('reminderSettings')
  return raw ? { ...DEFAULT_REMINDERS, ...JSON.parse(raw) } : DEFAULT_REMINDERS
}

export function setReminderSettings(settings: ReminderSettings): void {
  setKv('reminderSettings', JSON.stringify(settings))
}

export function getCheckInScheduleSettings(): CheckInScheduleSettings {
  const raw = getKv('checkInSchedule')
  return raw ? { ...DEFAULT_CHECKIN_SCHEDULE, ...JSON.parse(raw) } : DEFAULT_CHECKIN_SCHEDULE
}

export function setCheckInScheduleSettings(settings: CheckInScheduleSettings): void {
  setKv('checkInSchedule', JSON.stringify(settings))
}

// Tracks the due date of the last monthly check-in reminder that was shown as a desktop
// notification, so the same occurrence doesn't re-notify every scheduler tick.
export function getLastCheckInNotification(): string | null {
  return getKv('lastCheckInNotification')
}

export function setLastCheckInNotification(dueDate: string): void {
  setKv('lastCheckInNotification', dueDate)
}

export function getSmtpConfig(): Omit<SmtpConfig, 'user'> & { user: string } {
  const raw = getKv('smtpConfig')
  return raw ? { ...DEFAULT_SMTP, ...JSON.parse(raw) } : DEFAULT_SMTP
}

export function setSmtpConfig(config: Omit<SmtpConfig, 'user'> & { user: string }): void {
  setKv('smtpConfig', JSON.stringify(config))
}

export function getExtractionProvider(): ExtractionProvider {
  return (getKv('extractionProvider') as ExtractionProvider) ?? 'anthropic'
}

export function setExtractionProvider(provider: ExtractionProvider): void {
  setKv('extractionProvider', provider)
}

// The OpenAI SDK appends the operation path (e.g. /responses) itself, so strip it
// if the user pasted the full endpoint Foundry displayed rather than just the root.
function normalizeOpenAiBaseUrl(raw: string): string {
  return raw.trim().replace(/\/(responses|chat\/completions)\/?$/, '')
}

export function getOpenAiBaseUrl(): string {
  return getKv('openAiBaseUrl') ?? ''
}

export function setOpenAiBaseUrl(baseUrl: string): void {
  setKv('openAiBaseUrl', normalizeOpenAiBaseUrl(baseUrl))
}

export function getOpenAiModel(): string {
  return getKv('openAiModel') ?? ''
}

export function setOpenAiModel(model: string): void {
  setKv('openAiModel', model.trim())
}

export function getAppSettings(): AppSettings {
  return {
    reminders: getReminderSettings(),
    checkInSchedule: getCheckInScheduleSettings(),
    extractionProvider: getExtractionProvider(),
    hasAnthropicKey: hasSecret('anthropicApiKey'),
    hasOpenAiKey: hasSecret('openaiApiKey'),
    openAiBaseUrl: getOpenAiBaseUrl(),
    openAiModel: getOpenAiModel(),
    hasSmtpPassword: hasSecret('smtpPassword'),
    smtp: getSmtpConfig()
  }
}

export function setAnthropicApiKey(key: string): void {
  setSecret('anthropicApiKey', key)
}

export function clearAnthropicApiKey(): void {
  clearSecret('anthropicApiKey')
}

export function setOpenAiApiKey(key: string): void {
  setSecret('openaiApiKey', key)
}

export function clearOpenAiApiKey(): void {
  clearSecret('openaiApiKey')
}

export function setSmtpPassword(password: string): void {
  setSecret('smtpPassword', password)
}

export function getSmtpPassword(): string | null {
  return getSecret('smtpPassword')
}
