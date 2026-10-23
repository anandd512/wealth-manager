import { getDb } from '../db'
import { getSecret, setSecret, hasSecret, clearSecret } from '../secrets'
import type { AppSettings, CheckInScheduleSettings, ExtractionProvider, ReminderSettings } from '../../shared/types'

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

function getKv(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM kv_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function setKv(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO kv_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, new Date().toISOString())
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
    openAiModel: getOpenAiModel()
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
