import React, { useEffect, useState } from 'react'
import { Alert, Platform, Pressable, Switch, StyleSheet, Text, TextInput, View } from 'react-native'
import * as Sharing from 'expo-sharing'
import { KeyboardAvoidingScrollView } from '../components/KeyboardAvoidingScrollView'
import { BackHeader } from '../components/BackHeader'
import { SwipeBack } from '../components/SwipeBack'
import { useAuth } from '../auth/AuthContext'
import { getSetting, setSetting } from '../db/kvSettingsRepo'
import { saveApiKey, loadApiKey, saveBiometricEnabled, loadBiometricEnabled } from '../auth/secureStore'
import { testAnthropicConnection, testOpenAiConnection } from '../lib/extraction'
import { exportBackup, pickBackupFile, readBackupSummary, importBackup } from '../lib/backup'
import { friendlyErrorMessage } from '../lib/friendlyError'
import { toLocalDateString } from '../lib/creditCardCycle'

type Provider = 'anthropic' | 'openai'

/** Mirrors desktop's Settings.tsx "AI" tab at a basic level. `extractionProvider`/
 * `openAiBaseUrl`/`openAiModel` sync via kv_settings (same as desktop), so the
 * provider choice follows the user to mobile automatically — but the API key itself
 * is deliberately per-device (secureStore.ts), same as desktop's own secrets.ts. */
export function SettingsScreen({ onBack, onShowTour }: { onBack?: () => void; onShowTour?: () => void }) {
  const { email, dataKey, signOut } = useAuth()
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState('')
  const [openAiModel, setOpenAiModel] = useState('')
  const [openAiKey, setOpenAiKey] = useState('')
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false)
  const [hasOpenAiKey, setHasOpenAiKey] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [testingAnthropic, setTestingAnthropic] = useState(false)
  const [anthropicTestMsg, setAnthropicTestMsg] = useState<string | null>(null)
  const [testingOpenAi, setTestingOpenAi] = useState(false)
  const [openAiTestMsg, setOpenAiTestMsg] = useState<string | null>(null)
  const [biometricEnabled, setBiometricEnabled] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)

  useEffect(() => {
    setProvider((getSetting('extractionProvider') as Provider) ?? 'anthropic')
    setOpenAiBaseUrl(getSetting('openAiBaseUrl') ?? '')
    setOpenAiModel(getSetting('openAiModel') ?? '')
    loadApiKey('anthropicApiKey').then((k) => setHasAnthropicKey(Boolean(k)))
    loadApiKey('openaiApiKey').then((k) => setHasOpenAiKey(Boolean(k)))
    loadBiometricEnabled().then(setBiometricEnabled)
  }, [])

  const toggleBiometric = async (enabled: boolean) => {
    setBiometricEnabled(enabled)
    await saveBiometricEnabled(enabled)
  }

  const doExportBackup = async () => {
    if (!dataKey) return
    setBackupMsg(null)
    setExporting(true)
    try {
      const { uri, documentCount } = await exportBackup(dataKey)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri)
      }
      setBackupMsg(`Backup ready — ${documentCount} document${documentCount === 1 ? '' : 's'} included.`)
    } catch (e) {
      setBackupMsg(friendlyErrorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  const doImportBackup = async () => {
    if (!dataKey) return
    setBackupMsg(null)
    const picked = await pickBackupFile()
    if (!picked) return
    setImporting(true)
    try {
      const summary = await readBackupSummary(picked.uri, dataKey)
      setImporting(false)
      Alert.alert(
        'Restore this backup?',
        `From ${toLocalDateString(new Date(summary.exportedAt))} — ${summary.recordCount} records, ${summary.documentCount} documents. This overwrites any local item with the same ID. This can't be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              setImporting(true)
              try {
                await importBackup(picked.uri, dataKey)
                setBackupMsg('Backup restored. Pull to refresh any screen to see the restored data.')
              } catch (e) {
                setBackupMsg(friendlyErrorMessage(e))
              } finally {
                setImporting(false)
              }
            }
          }
        ]
      )
    } catch (e) {
      setImporting(false)
      setBackupMsg(friendlyErrorMessage(e))
    }
  }

  const changeProvider = (next: Provider) => {
    setProvider(next)
    setSetting('extractionProvider', next)
  }

  const saveAnthropicKey = async () => {
    if (!anthropicKey) return
    await saveApiKey('anthropicApiKey', anthropicKey)
    setHasAnthropicKey(true)
    setAnthropicKey('')
    setSavedMsg('Anthropic key saved.')
  }

  const saveOpenAiConfig = async () => {
    setSetting('openAiBaseUrl', openAiBaseUrl.trim())
    setSetting('openAiModel', openAiModel.trim())
    if (openAiKey) {
      await saveApiKey('openaiApiKey', openAiKey)
      setHasOpenAiKey(true)
      setOpenAiKey('')
    }
    setSavedMsg('OpenAI-compatible config saved.')
  }

  const testAnthropic = async () => {
    setAnthropicTestMsg(null)
    if (anthropicKey) await saveAnthropicKey()
    setTestingAnthropic(true)
    try {
      await testAnthropicConnection()
      setAnthropicTestMsg('Connected — key is valid.')
    } catch (e) {
      setAnthropicTestMsg((e as Error).message)
    } finally {
      setTestingAnthropic(false)
    }
  }

  const testOpenAi = async () => {
    setOpenAiTestMsg(null)
    if (openAiBaseUrl || openAiModel || openAiKey) await saveOpenAiConfig()
    setTestingOpenAi(true)
    try {
      await testOpenAiConnection()
      setOpenAiTestMsg('Connected — key is valid.')
    } catch (e) {
      setOpenAiTestMsg((e as Error).message)
    } finally {
      setTestingOpenAi(false)
    }
  }

  const content = (
    <KeyboardAvoidingScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!onBack && <Text style={styles.title}>Settings</Text>}

      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.email}>{email}</Text>
        <Pressable onPress={() => void signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {onShowTour && (
        <>
          <Text style={styles.sectionLabel}>Help</Text>
          <View style={styles.card}>
            <Pressable onPress={onShowTour}>
              <Text style={styles.tourLink}>Show tour again</Text>
            </Pressable>
          </View>
        </>
      )}

      <Text style={styles.sectionLabel}>Security</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchLabelGroup}>
            <Text style={styles.switchLabel}>Require Face ID to unlock</Text>
            <Text style={styles.help}>
              When off, Artha unlocks with your master password instead.
            </Text>
          </View>
          <Switch value={biometricEnabled} onValueChange={toggleBiometric} />
        </View>
      </View>

      <Text style={styles.sectionLabel}>Backup</Text>
      <View style={styles.card}>
        <Text style={styles.help}>
          A belt-and-suspenders copy alongside cloud sync — encrypted the same way as everything
          else, restorable only by signing into this same account.
        </Text>
        <View style={styles.buttonRow}>
          <Pressable style={[styles.button, styles.buttonFlex]} onPress={() => void doExportBackup()} disabled={exporting}>
            <Text style={styles.buttonText}>{exporting ? 'Exporting…' : 'Export backup'}</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.buttonFlex, styles.buttonSecondary]}
            onPress={() => void doImportBackup()}
            disabled={importing}
          >
            <Text style={styles.buttonSecondaryText}>{importing ? 'Working…' : 'Restore backup'}</Text>
          </Pressable>
        </View>
        {backupMsg && <Text style={styles.saved}>{backupMsg}</Text>}
      </View>

      <Text style={styles.sectionLabel}>Auto-fill from documents</Text>
      <View style={styles.card}>
        <Text style={styles.help}>
          Artha can read uploaded policy PDFs and identity documents and fill in the fields
          automatically. Your chosen AI provider reads each document; the key you enter below
          stays on this device only.
        </Text>

        <View style={styles.chipRow}>
          <Pressable style={[styles.chip, provider === 'anthropic' && styles.chipActive]} onPress={() => changeProvider('anthropic')}>
            <Text style={[styles.chipText, provider === 'anthropic' && styles.chipTextActive]}>Anthropic (Claude)</Text>
          </Pressable>
          <Pressable style={[styles.chip, provider === 'openai' && styles.chipActive]} onPress={() => changeProvider('openai')}>
            <Text style={[styles.chipText, provider === 'openai' && styles.chipTextActive]}>Custom endpoint (OpenAI-compatible)</Text>
          </Pressable>
        </View>

        {provider === 'anthropic' ? (
          <>
            <Text style={styles.label}>Anthropic API key{hasAnthropicKey ? ' (configured)' : ''}</Text>
            <TextInput
              style={styles.input}
              value={anthropicKey}
              onChangeText={setAnthropicKey}
              placeholder={hasAnthropicKey ? '••••••••••••••••' : 'sk-ant-...'}
              secureTextEntry
              autoCapitalize="none"
            />
            <View style={styles.buttonRow}>
              <Pressable style={[styles.button, styles.buttonFlex, !anthropicKey && styles.buttonDisabled]} onPress={saveAnthropicKey} disabled={!anthropicKey}>
                <Text style={styles.buttonText}>Save key</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.buttonFlex, styles.buttonSecondary, (!hasAnthropicKey && !anthropicKey) && styles.buttonDisabled]}
                onPress={() => void testAnthropic()}
                disabled={(!hasAnthropicKey && !anthropicKey) || testingAnthropic}
              >
                <Text style={styles.buttonSecondaryText}>{testingAnthropic ? 'Testing…' : 'Test connection'}</Text>
              </Pressable>
            </View>
            {anthropicTestMsg && <Text style={styles.saved}>{anthropicTestMsg}</Text>}
          </>
        ) : (
          <>
            <Text style={styles.label}>Endpoint base URL</Text>
            <TextInput
              style={styles.input}
              value={openAiBaseUrl}
              onChangeText={setOpenAiBaseUrl}
              placeholder="https://your-resource.services.ai.azure.com/openai/v1"
              autoCapitalize="none"
            />
            <Text style={styles.label}>Model / deployment name</Text>
            <TextInput style={styles.input} value={openAiModel} onChangeText={setOpenAiModel} placeholder="e.g. gpt-6-astra" autoCapitalize="none" />
            <Text style={styles.label}>API key{hasOpenAiKey ? ' (configured)' : ''}</Text>
            <TextInput
              style={styles.input}
              value={openAiKey}
              onChangeText={setOpenAiKey}
              placeholder={hasOpenAiKey ? '••••••••••••••••' : 'API key'}
              secureTextEntry
              autoCapitalize="none"
            />
            <View style={styles.buttonRow}>
              <Pressable style={[styles.button, styles.buttonFlex]} onPress={saveOpenAiConfig}>
                <Text style={styles.buttonText}>Save</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.buttonFlex, styles.buttonSecondary, (!openAiBaseUrl || !openAiModel || (!hasOpenAiKey && !openAiKey)) && styles.buttonDisabled]}
                onPress={() => void testOpenAi()}
                disabled={!openAiBaseUrl || !openAiModel || (!hasOpenAiKey && !openAiKey) || testingOpenAi}
              >
                <Text style={styles.buttonSecondaryText}>{testingOpenAi ? 'Testing…' : 'Test connection'}</Text>
              </Pressable>
            </View>
            {openAiTestMsg && <Text style={styles.saved}>{openAiTestMsg}</Text>}
          </>
        )}
        {savedMsg && <Text style={styles.saved}>{savedMsg}</Text>}
      </View>
    </KeyboardAvoidingScrollView>
  )

  if (!onBack) return content

  return (
    <SwipeBack onSwipeBack={onBack}>
      <View style={styles.screen}>
        <BackHeader title="Settings" onBack={onBack} />
        {content}
      </View>
    </SwipeBack>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#777', marginTop: 20, marginBottom: 8 },
  card: { backgroundColor: '#f7f7f7', borderRadius: 10, padding: 16 },
  email: { fontSize: 14, color: '#111', marginBottom: 10 },
  signOut: { fontSize: 14, color: '#c0392b', fontWeight: '600' },
  tourLink: { fontSize: 14, color: '#111', fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchLabelGroup: { flex: 1 },
  switchLabel: { fontSize: 14, color: '#111', fontWeight: '600', marginBottom: 4 },
  help: { fontSize: 12.5, color: '#666', marginBottom: 14, lineHeight: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 12.5, color: '#333' },
  chipTextActive: { color: '#fff' },
  label: { fontSize: 12.5, color: '#555', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#fff' },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 14 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  buttonFlex: { flex: 1, marginTop: 14 },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#111' },
  buttonSecondaryText: { color: '#111', fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  saved: { marginTop: 10, fontSize: 12.5, color: '#2e7d32' }
})
