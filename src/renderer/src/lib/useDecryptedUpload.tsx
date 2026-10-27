import { api } from './api'
import { useState } from 'react'
import PdfPasswordModal from '../components/PdfPasswordModal'

// Thrown when the user dismisses the password prompt instead of unlocking the file.
// Callers check for this with `isPasswordCancelled()` so they can skip showing an
// error banner for something the user did on purpose.
export class PasswordCancelledError extends Error {
  constructor() {
    super('Password entry cancelled')
    this.name = 'PasswordCancelledError'
  }
}

export function isPasswordCancelled(e: unknown): boolean {
  return e instanceof PasswordCancelledError
}

interface Pending {
  path: string
  fileName: string
  resolve: (decryptedPath: string) => void
  reject: (err: Error) => void
}

// Shared across every AI-upload flow: call ensureDecrypted(path) right after picking a
// file and before extracting it. If the file isn't a password-protected PDF, it
// resolves immediately with the same path. If it is, it renders `modal` (a password
// prompt) and the returned promise stays pending until the user submits the correct
// password (resolves with a decrypted temp path) or cancels (rejects — callers catch
// this the same way they catch any other extraction error).
export function useDecryptedUpload(): { ensureDecrypted: (path: string) => Promise<string>; modal: JSX.Element | null } {
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ensureDecrypted = async (path: string): Promise<string> => {
    const { requiresPassword } = await api().documents.checkEncrypted(path)
    if (!requiresPassword) return path
    return new Promise<string>((resolve, reject) => {
      setError(null)
      setPending({ path, fileName: path.split(/[\\/]/).pop() ?? path, resolve, reject })
    })
  }

  const submitPassword = async (password: string): Promise<void> => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      const { decryptedPath } = await api().documents.decryptPdf(pending.path, password)
      pending.resolve(decryptedPath)
      setPending(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const cancel = (): void => {
    pending?.reject(new PasswordCancelledError())
    setPending(null)
    setError(null)
  }

  const modal = pending ? (
    <PdfPasswordModal fileName={pending.fileName} error={error} busy={busy} onSubmit={submitPassword} onCancel={cancel} />
  ) : null

  return { ensureDecrypted, modal }
}
