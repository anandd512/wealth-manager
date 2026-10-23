import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'

/** Placeholder post-unlock screen. Real account/net-worth views, and the sync
 * engine that populates them from backend/src/functions/syncPull.ts, come next —
 * this just proves the auth + crypto + Keychain pipeline works end-to-end. */
export function HomeScreen() {
  const { email, signOut } = useAuth()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>You're in.</Text>
      <Text style={styles.subtitle}>{email}</Text>
      <Text style={styles.note}>Net worth, accounts, and sync land here next.</Text>
      <Pressable style={styles.button} onPress={() => void signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 24 },
  note: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 32 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' }
})
