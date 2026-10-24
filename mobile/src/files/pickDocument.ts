import * as DocumentPicker from 'expo-document-picker'

export interface PickedDocument {
  uri: string
  name: string
}

/** Matches desktop's file dialog filter (src/main/ipc.ts's pickDocumentFile: PDF/PNG/
 * JPG/JPEG/WEBP) — iOS's document picker already includes "Photo Library" as a
 * source, so this alone covers both "pick a PDF" and "pick a photo" without also
 * needing expo-image-picker's dedicated camera/library flow for v1. */
export async function pickDocument(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
    copyToCacheDirectory: true
  })
  if (result.canceled || result.assets.length === 0) return null
  const asset = result.assets[0]
  return { uri: asset.uri, name: asset.name }
}
