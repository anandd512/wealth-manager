import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'

interface Props {
  onSwipeBack: () => void
  children: React.ReactNode
}

const SWIPE_THRESHOLD = 80

/** Full-screen (not edge-only) rightward-drag-to-go-back, layered on top of any
 * screen via GestureDetector. Mostly-horizontal drags past the threshold trigger the
 * same callback a header back button or Cancel link would. */
export function SwipeBack({ onSwipeBack, children }: Props) {
  const gesture = Gesture.Pan()
    .activeOffsetX(20)
    .failOffsetY([-20, 20])
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD && Math.abs(event.translationX) > Math.abs(event.translationY)) {
        runOnJS(onSwipeBack)()
      }
    })

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.container}>{children}</View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }
})
