// pdfstudio is ESM-only; the main process build is CJS (no "type": "module" in
// package.json, see electron.vite.config.ts's externalizeDepsPlugin), so this must
// stay a dynamic import rather than a static one, or it throws ERR_REQUIRE_ESM.
// Shared singleton — every pdfstudio consumer (password unlock, statement chunking)
// reuses the same compiled wasm instance instead of each loading its own.
import type { PdfToolkit } from 'pdfstudio'

let toolkit: PdfToolkit | null = null

export async function getPdfToolkit(): Promise<PdfToolkit> {
  if (!toolkit) {
    const { createPdfToolkit } = await import('pdfstudio')
    toolkit = await createPdfToolkit()
  }
  return toolkit
}
