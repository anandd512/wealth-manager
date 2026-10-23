import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from './src/auth/AuthContext'
import { AuthScreen } from './src/screens/AuthScreen'
import { UnlockScreen } from './src/screens/UnlockScreen'
import { HomeScreen } from './src/screens/HomeScreen'

function Root() {
  const { status } = useAuth()

  switch (status) {
    case 'loading':
      return (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      )
    case 'signedOut':
      return <AuthScreen />
    case 'locked':
      return <UnlockScreen />
    case 'unlocked':
      return <HomeScreen />
  }
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
      <StatusBar style="auto" />
    </AuthProvider>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }
})
