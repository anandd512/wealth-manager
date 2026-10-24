import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'

interface Props {
  title: string
  onBack: () => void
}

/** A consistent, large-hit-target back header for every pushed sub-screen (forms,
 * check-in, settings). Sits below HomeScreen's own persistent top bar, so it carries
 * no extra safe-area padding of its own. */
export function BackHeader({ title, onBack }: Props) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backButton}>
        <ChevronLeft size={26} color="#111" />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.spacer} />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: '#fff'
  },
  backButton: {
    padding: 6,
    marginRight: 2,
    minWidth: 38,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111' },
  spacer: { width: 38 }
})
