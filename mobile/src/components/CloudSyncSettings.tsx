import React, { useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth, PendingDevice } from '../auth/AuthContext'
import { RecoveryKeyView } from './RecoveryKeyView'

const POLL_MS = 4000

/** Settings → Cloud Sync on a phone that holds the key: approve new devices, and
 * replace the recovery key. */
export function CloudSyncSettings() {
  const { listPendingDevices, approveDevice, denyDevice, rotateRecoveryKey } = useAuth()
  const [devices, setDevices] = useState<PendingDevice[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      listPendingDevices()
        .then((d) => alive && setDevices(d))
        .catch(() => undefined)
    load()
    const t = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [listPendingDevices])

  const answer = async (d: PendingDevice, approve: boolean) => {
    setBusy(true)
    setMsg(null)
    try {
      if (approve) await approveDevice(d)
      else await denyDevice(d.id)
      setDevices((list) => list.filter((x) => x.id !== d.id))
      if (approve) setMsg(`Approved ${d.deviceName}.`)
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const rotate = () =>
    Alert.alert('Create a new recovery key?', 'Your current recovery key will stop working.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Create',
        onPress: async () => {
          try {
            setNewKey(await rotateRecoveryKey())
          } catch (err) {
            setMsg((err as Error).message)
          }
        }
      }
    ])

  if (newKey) {
    return (
      <View style={styles.card}>
        <RecoveryKeyView recoveryKey={newKey} doneLabel="Done" onDone={() => setNewKey(null)} />
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Approve a new device</Text>
      {devices.length === 0 ? (
        <Text style={styles.help}>
          To add another computer or phone, sign in to Artha on it and choose "Approve from another device". The request
          shows up here.
        </Text>
      ) : (
        <>
          <Text style={styles.warn}>
            Only approve a device you're setting up right now, and only if its code matches exactly.
          </Text>
          {devices.map((d) => (
            <View key={d.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{d.deviceName}</Text>
                <Text style={styles.code}>{d.code}</Text>
              </View>
              <Pressable style={styles.approve} onPress={() => answer(d, true)} disabled={busy}>
                <Text style={styles.approveText}>Approve</Text>
              </Pressable>
              <Pressable style={styles.deny} onPress={() => answer(d, false)} disabled={busy}>
                <Text style={styles.denyText}>Deny</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}
      {msg && <Text style={styles.msg}>{msg}</Text>}
      <Pressable onPress={rotate} style={{ marginTop: 14 }}>
        <Text style={styles.link}>Create a new recovery key</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#f7f7f7', borderRadius: 10, padding: 16 },
  heading: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 6 },
  help: { fontSize: 12.5, color: '#666', lineHeight: 18 },
  warn: { fontSize: 12.5, color: '#8a6200', backgroundColor: '#fdf5e3', borderRadius: 8, padding: 10, marginBottom: 8, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#e8e8e8' },
  name: { fontSize: 14, fontWeight: '600', color: '#111' },
  code: { fontSize: 20, fontWeight: '700', letterSpacing: 2, color: '#111', marginTop: 2 },
  approve: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  approveText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  deny: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  denyText: { color: '#111', fontWeight: '600', fontSize: 13 },
  msg: { marginTop: 10, fontSize: 12.5, color: '#2e7d32' },
  link: { fontSize: 14, color: '#111', fontWeight: '600' }
})
