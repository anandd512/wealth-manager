import React, { useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Swipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated'

interface Action {
  label: string
  color: string
  onPress: () => void
}

interface Props {
  rightAction: Action
  leftAction: Action
  children: React.ReactNode
}

const ACTION_WIDTH = 84

function ActionPanel({
  action,
  progress,
  side
}: {
  action: Action
  progress: SharedValue<number>
  side: 'left' | 'right'
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - Math.min(progress.value, 1)) * (side === 'left' ? -ACTION_WIDTH : ACTION_WIDTH) }]
  }))
  return (
    <Animated.View style={[styles.actionPanel, { backgroundColor: action.color }, style]}>
      <Pressable style={styles.actionPressable} onPress={action.onPress}>
        <Text style={styles.actionLabel}>{action.label}</Text>
      </Pressable>
    </Animated.View>
  )
}

/** A list row that reveals a right-swipe action (edit/check-in) and a left-swipe
 * action (delete, always red) via gesture-handler's Reanimated-based Swipeable —
 * tap still opens edit as it always did; swipe is a faster path, not a
 * replacement. */
export function SwipeableRow({ rightAction, leftAction, children }: Props) {
  const ref = useRef<SwipeableMethods>(null)

  const runAndClose = (action: Action) => {
    ref.current?.close()
    action.onPress()
  }

  return (
    <Swipeable
      ref={ref}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      renderLeftActions={(progress) => (
        <ActionPanel action={{ ...rightAction, onPress: () => runAndClose(rightAction) }} progress={progress} side="left" />
      )}
      renderRightActions={(progress) => (
        <ActionPanel action={{ ...leftAction, onPress: () => runAndClose(leftAction) }} progress={progress} side="right" />
      )}
    >
      <View style={styles.row}>{children}</View>
    </Swipeable>
  )
}

const styles = StyleSheet.create({
  row: { backgroundColor: '#fff' },
  actionPanel: { width: ACTION_WIDTH, justifyContent: 'center', alignItems: 'center' },
  actionPressable: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' },
  actionLabel: { color: '#fff', fontSize: 13, fontWeight: '700' }
})
