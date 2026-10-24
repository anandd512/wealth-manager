import React, { useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet } from 'react-native'
import { Buffer } from 'buffer'
import { isDocumentCachedLocally, openDocumentForViewing } from '../files/fileStore'

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp)$/i

interface Props {
  documentPath: string
  documentOriginalName: string | null
  dataKey: Buffer
  token: string
  onPress: () => void
}

/** Inline row thumbnail for image-type documents, mirroring desktop's IdentityDocuments.tsx
 * (Item 32's thumbnail + lightbox) — only rendered when the document is both image-shaped
 * (by filename) and already cached locally, so showing a list of documents never itself
 * triggers a download/decrypt storm for every row. A document that isn't cached yet, or
 * isn't an image, just renders nothing — the row falls back to its existing text-only form. */
export function DocumentThumbnail({ documentPath, documentOriginalName, dataKey, token, onPress }: Props) {
  const [uri, setUri] = useState<string | null>(null)
  const isImage = IMAGE_EXT_RE.test(documentOriginalName ?? documentPath)

  useEffect(() => {
    setUri(null)
    if (!isImage || !isDocumentCachedLocally(documentPath)) return
    let cancelled = false
    openDocumentForViewing(documentPath, dataKey, token)
      .then((localUri) => {
        if (!cancelled) setUri(localUri)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentPath])

  if (!uri) return null

  return (
    <Pressable onPress={onPress}>
      <Image source={{ uri }} style={styles.thumbnail} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  thumbnail: { width: 36, height: 36, borderRadius: 6, backgroundColor: '#eee', marginRight: 10 }
})
