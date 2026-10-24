/** Maps a raw technical error (crypto internals, raw HTTP status text, network
 * exceptions) to a short, non-technical message safe to show a user — the gap that
 * let "aes:gcm invalid tag" and "Request failed (404)" leak straight into an Alert
 * during the document-sync incident this was written in response to. Falls back to
 * the original message (not a generic "something went wrong") for anything
 * unrecognized, so a genuinely new failure mode is still visible/reportable rather
 * than silently swallowed. */
export function friendlyErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)

  if (/aes[:/-]?gcm|invalid tag|bad decrypt/i.test(raw)) {
    return "Couldn't read this file — it may need to finish syncing from the device that added it. Try again after your next sync."
  }
  if (/request failed \(404\)|"?not found"?/i.test(raw)) {
    return "This item isn't available from the cloud yet — try syncing again in a moment."
  }
  if (/request failed \(401\)|request failed \(403\)/i.test(raw)) {
    return 'Your session has expired — sign out and sign back in.'
  }
  if (/request failed \(5\d\d\)/i.test(raw)) {
    return 'The server had a problem. Try again in a moment.'
  }
  if (/network request failed|fetch failed|timed out|timeout/i.test(raw)) {
    return 'No internet connection — check your network and try again.'
  }

  return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw
}
