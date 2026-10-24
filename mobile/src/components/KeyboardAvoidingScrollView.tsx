import React from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleProp, ViewStyle } from 'react-native'

interface Props {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
}

/** Drop-in replacement for a plain ScrollView on any screen with text inputs — a
 * bare ScrollView doesn't know to shrink/shift when the on-screen keyboard opens,
 * so fields near the bottom (e.g. Settings' endpoint URL/deployment name/API key)
 * get covered with no way to see what's being typed. `keyboardShouldPersistTaps`
 * so tapping a Save button while the keyboard is still open works in one tap
 * instead of needing a dismiss-tap first. */
export function KeyboardAvoidingScrollView({ children, style, contentContainerStyle }: Props) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={style} contentContainerStyle={contentContainerStyle} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
