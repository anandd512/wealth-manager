import { StyleSheet } from 'react-native'

/** Shared look for the sign-in / key-setup / unlock screens. */
export const authStyles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  monoInput: { fontFamily: 'Courier', fontSize: 15, letterSpacing: 1 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  dangerButton: { backgroundColor: '#c0392b', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 13,
    alignItems: 'center',
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10
  },
  outlineButtonText: { color: '#111', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  link: { color: '#555', textAlign: 'center', marginTop: 16, fontSize: 14 },
  error: { color: '#c0392b', marginBottom: 12, textAlign: 'center' },
  help: { fontSize: 12.5, color: '#666', textAlign: 'center', marginTop: 12, lineHeight: 18 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e5e5' },
  dividerText: { color: '#999', fontSize: 12 },
  segment: { flexDirection: 'row', backgroundColor: '#f1f1f1', borderRadius: 8, padding: 3, marginBottom: 18 },
  segmentItem: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 6 },
  segmentItemActive: { backgroundColor: '#fff' },
  segmentText: { fontSize: 13, color: '#666', fontWeight: '600' },
  segmentTextActive: { color: '#111' },
  bigCode: { fontSize: 34, fontWeight: '700', letterSpacing: 4, textAlign: 'center', marginVertical: 14 },
  step: { fontSize: 13.5, color: '#444', lineHeight: 20, marginBottom: 6 },
  callout: { backgroundColor: '#f4f7fe', borderRadius: 10, padding: 14, marginBottom: 18 },
  calloutDanger: { backgroundColor: '#fdf0ef' },
  calloutTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  calloutText: { fontSize: 13, color: '#555', lineHeight: 19 }
})
