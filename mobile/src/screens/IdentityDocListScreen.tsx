import React, { useRef, useState } from 'react'
import { Alert, Pressable, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as Sharing from 'expo-sharing'
import { SwipeableRow } from '../components/SwipeableRow'
import { useAuth } from '../auth/AuthContext'
import { openDocumentForViewing } from '../files/fileStore'
import { friendlyErrorMessage } from '../lib/friendlyError'
import { SearchBar, matchesSearch } from '../components/SearchBar'
import { DocumentThumbnail } from '../components/DocumentThumbnail'
import { haptics } from '../lib/haptics'
import type { IdentityDocument } from '../db/identityDocsRepo'
import { DOC_TYPE_LABELS, DOC_TYPE_ICONS, DOC_TYPE_EXPIRY_LABELS } from '../lib/identityDocCategories'

const COPY_CLEAR_MS = 30_000

function maskAadhaar(idNumber: string): string {
  const digits = idNumber.replace(/\D/g, '')
  if (digits.length < 4) return idNumber
  return `XXXX XXXX ${digits.slice(-4)}`
}

function dateBadge(date: string | null): { label: string; tone: 'neutral' | 'danger' | 'warn' | 'ok' } {
  if (!date) return { label: 'Not set', tone: 'neutral' }
  const days = Math.floor((new Date(date).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { label: 'Expired', tone: 'danger' }
  if (days <= 15) return { label: `${days} days`, tone: 'danger' }
  if (days <= 45) return { label: `${days} days`, tone: 'warn' }
  return { label: `${days} days`, tone: 'ok' }
}

const TONE_COLORS: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: '#f0f0f0', fg: '#777' },
  danger: { bg: '#fdecea', fg: '#c0392b' },
  warn: { bg: '#fdf3e0', fg: '#b8860b' },
  ok: { bg: '#e8f5e9', fg: '#2e7d32' }
}

interface Props {
  documents: IdentityDocument[]
  refreshing: boolean
  onRefresh: () => void
  onAdd: () => void
  onSelect: (syncId: string) => void
  onDelete: (syncId: string) => void
}

export function IdentityDocListScreen({ documents, refreshing, onRefresh, onAdd, onSelect, onDelete }: Props) {
  const { dataKey, token } = useAuth()
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copySecondsLeft, setCopySecondsLeft] = useState(0)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const filteredDocuments = documents.filter((d) =>
    matchesSearch(query, d.label, DOC_TYPE_LABELS[d.doc_type], d.full_name, d.id_number)
  )

  const downloadDocument = async (doc: IdentityDocument) => {
    if (!doc.document_path || !dataKey || !token) return
    setDownloadingId(doc.sync_id)
    try {
      const localUri = await openDocumentForViewing(doc.document_path, dataKey, token)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri)
      } else {
        Alert.alert('Document ready', localUri)
      }
    } catch (err) {
      Alert.alert('Could not open document', friendlyErrorMessage(err))
    } finally {
      setDownloadingId(null)
    }
  }

  const copyIdNumber = async (doc: IdentityDocument) => {
    if (!doc.id_number) return
    await Clipboard.setStringAsync(doc.id_number)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    if (copyInterval.current) clearInterval(copyInterval.current)
    setCopiedId(doc.sync_id)
    setCopySecondsLeft(COPY_CLEAR_MS / 1000)
    copyInterval.current = setInterval(() => setCopySecondsLeft((s) => Math.max(0, s - 1)), 1000)
    copyTimer.current = setTimeout(async () => {
      await Clipboard.setStringAsync('')
      setCopiedId(null)
      if (copyInterval.current) clearInterval(copyInterval.current)
    }, COPY_CLEAR_MS)
  }

  const confirmDelete = (doc: IdentityDocument) => {
    Alert.alert('Delete document', `Remove this ${DOC_TYPE_LABELS[doc.doc_type]}? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { haptics.warning(); onDelete(doc.sync_id) } }
    ])
  }

  return (
    <View style={styles.container}>
      {documents.length > 0 && <SearchBar value={query} onChangeText={setQuery} placeholder="Search documents…" />}
      <FlatList
        data={filteredDocuments}
        keyExtractor={(item) => item.sync_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const expiryLabel = DOC_TYPE_EXPIRY_LABELS[item.doc_type]
          const badge = expiryLabel ? dateBadge(item.expiry_date) : null
          const tone = badge ? TONE_COLORS[badge.tone] : null
          const isAadhaar = item.doc_type === 'aadhaar'
          const revealed = revealedId === item.sync_id
          const copied = copiedId === item.sync_id
          const downloading = downloadingId === item.sync_id
          return (
            <SwipeableRow
              rightAction={{ label: 'Edit', color: '#2e7d32', onPress: () => onSelect(item.sync_id) }}
              leftAction={{ label: 'Delete', color: '#c0392b', onPress: () => confirmDelete(item) }}
            >
              <Pressable style={styles.row} onPress={() => onSelect(item.sync_id)}>
                <View style={styles.rowTop}>
                  {item.document_path && dataKey && token && (
                    <DocumentThumbnail
                      documentPath={item.document_path}
                      documentOriginalName={item.document_original_name}
                      dataKey={dataKey}
                      token={token}
                      onPress={() => void downloadDocument(item)}
                    />
                  )}
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>
                      {DOC_TYPE_ICONS[item.doc_type]} {item.label || DOC_TYPE_LABELS[item.doc_type]}
                    </Text>
                    <Text style={styles.rowSubtitle}>{item.full_name || ' '}</Text>
                  </View>
                  {badge && tone && (
                    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.badgeText, { color: tone.fg }]}>{badge.label}</Text>
                    </View>
                  )}
                </View>
                {item.id_number && (
                  <View style={styles.idRow}>
                    <Text style={styles.idText}>{isAadhaar && !revealed ? maskAadhaar(item.id_number) : item.id_number}</Text>
                    {isAadhaar && (
                      <Pressable
                        style={styles.actionButton}
                        onPress={(e) => {
                          e.stopPropagation()
                          setRevealedId(revealed ? null : item.sync_id)
                        }}
                        hitSlop={8}
                      >
                        <Text style={styles.actionButtonText}>{revealed ? 'Hide' : 'Show'}</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={styles.actionButton}
                      onPress={(e) => {
                        e.stopPropagation()
                        void copyIdNumber(item)
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.actionButtonText}>{copied ? `${copySecondsLeft}s` : 'Copy'}</Text>
                    </Pressable>
                  </View>
                )}
                {item.document_path && (
                  <Pressable
                    style={styles.downloadRow}
                    onPress={(e) => {
                      e.stopPropagation()
                      void downloadDocument(item)
                    }}
                    disabled={downloading}
                    hitSlop={8}
                  >
                    <Text style={styles.downloadText}>
                      {downloading ? 'Opening…' : `📎 ${item.document_original_name ?? 'Download document'}`}
                    </Text>
                  </Pressable>
                )}
              </Pressable>
            </SwipeableRow>
          )
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query ? `No documents match "${query}".` : 'No documents yet. Tap "Add document" to create your first one.'}
          </Text>
        }
        contentContainerStyle={filteredDocuments.length === 0 ? styles.emptyContainer : undefined}
      />

      <Pressable style={styles.fab} onPress={onAdd}>
        <Text style={styles.fabText}>+ Add document</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee'
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { flex: 1, marginRight: 8 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  badge: { borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  idText: { fontSize: 13, color: '#555', flex: 1 },
  downloadRow: { marginTop: 8 },
  downloadText: { fontSize: 12, color: '#111', fontWeight: '600' },
  actionButton: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 8 },
  actionButtonText: { fontSize: 11, color: '#333', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#999', marginTop: 48, paddingHorizontal: 32 },
  emptyContainer: { flexGrow: 1 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: '#111',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 20
  },
  fabText: { color: '#fff', fontWeight: '700' }
})
