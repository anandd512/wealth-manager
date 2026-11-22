import React, { useState } from 'react'
import { Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { authStyles } from './authStyles'

/** Shows a freshly created Recovery Key exactly once — it's never stored on this device
 * and the server can't read it, so the user must confirm they saved it. */
export function RecoveryKeyView({ recoveryKey, onDone, doneLabel = 'Continue' }: { recoveryKey: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await Clipboard.setStringAsync(recoveryKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const share = () =>
    Share.share({
      message: `Artha recovery key:\n${recoveryKey}\n\nKeep this private. It lets a new device unlock your encrypted Artha data.`
    })

  return (
    <View>
      <Text style={authStyles.title}>Save your recovery key</Text>
      <Text style={authStyles.subtitle}>
        Your data is encrypted with a key only your devices hold — not even Artha's servers can read it. You'll need
        this recovery key to set up a new device if no signed-in device is around to approve it. It's shown only once.
      </Text>
      <Text selectable style={styles.key}>
        {recoveryKey}
      </Text>
      <View style={styles.row}>
        <Pressable style={[authStyles.outlineButton, styles.flex]} onPress={copy}>
          <Text style={authStyles.outlineButtonText}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
        <Pressable style={[authStyles.outlineButton, styles.flex]} onPress={share}>
          <Text style={authStyles.outlineButtonText}>Save to…</Text>
        </Pressable>
      </View>
      <View style={styles.confirmRow}>
        <Switch value={saved} onValueChange={setSaved} />
        <Text style={styles.confirmText}>I've saved my recovery key somewhere safe</Text>
      </View>
      <Pressable style={[authStyles.button, !saved && authStyles.disabled]} onPress={onDone} disabled={!saved}>
        <Text style={authStyles.buttonText}>{doneLabel}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  key: {
    fontFamily: 'Courier',
    fontSize: 17,
    lineHeight: 28,
    textAlign: 'center',
    backgroundColor: '#f6f6f6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderStyle: 'dashed',
    padding: 14,
    marginBottom: 12
  },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  confirmText: { flex: 1, fontSize: 14, color: '#222' }
})
