import * as Haptics from 'expo-haptics'

/** Thin wrappers so call sites read by intent rather than repeating Haptics'
 * verbose enum names — a baseline iOS interaction-polish expectation this app had
 * none of before (no expo-haptics usage anywhere). */
export const haptics = {
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
}
