import { getPdfToolkit } from './pdfToolkit'

export async function pdfRequiresPassword(bytes: Uint8Array): Promise<boolean> {
  const pdf = await getPdfToolkit()
  return pdf.requiresPassword(bytes)
}

// Lets PdfPasswordError propagate untouched — translated to a plain Error at the IPC
// boundary instead, since Electron's IPC only preserves `.message` across a rejected
// invoke, not the thrown error's class identity.
export async function unlockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const pdf = await getPdfToolkit()
  return pdf.unlock(bytes, { password })
}
