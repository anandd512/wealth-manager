import React from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { Search, X } from 'lucide-react-native'

interface Props {
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
}

/** Mirrors desktop's search bar (Insurance.tsx/IdentityDocuments.tsx) — mobile's
 * equivalent list screens had no way to filter a long list at all before this. */
export function SearchBar({ value, onChangeText, placeholder = 'Search…' }: Props) {
  return (
    <View style={styles.container}>
      <Search size={15} color="#999" style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#999"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        accessibilityLabel={placeholder}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityLabel="Clear search">
          <X size={16} color="#999" />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    height: 40,
    gap: 8
  },
  icon: {},
  input: { flex: 1, fontSize: 15, color: '#111', padding: 0 }
})

/** Shared, case-insensitive "does any of these fields contain the query" filter —
 * every list screen just supplies which (possibly null) fields of each item count. */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some((f) => (f ?? '').toLowerCase().includes(q))
}
