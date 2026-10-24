import { BlobServiceClient, ContainerClient } from '@azure/storage-blob'
import { DefaultAzureCredential } from '@azure/identity'

// Files arrive here already client-side-encrypted (same AES-256-GCM envelope as
// every synced record — see mobile/src/crypto/cryptoBox.ts / src/main/db.ts's
// encrypt()), so this container only ever holds ciphertext, same zero-knowledge
// property as the Cosmos `items` container. Auth is via the Function App's
// System-Assigned managed identity (infra/main.bicep grants it Storage Blob Data
// Owner on this account) — no connection string/key needed here, unlike Cosmos.
let client: BlobServiceClient | null = null

function getClient(): BlobServiceClient {
  if (!client) {
    const accountName = process.env.FILES_STORAGE_ACCOUNT_NAME
    if (!accountName) throw new Error('FILES_STORAGE_ACCOUNT_NAME is not configured')
    client = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, new DefaultAzureCredential())
  }
  return client
}

export function filesContainer(): ContainerClient {
  return getClient().getContainerClient('files')
}

// Every blob lives under the authenticated user's own id — the path is always
// built server-side from the JWT-verified userId (requireUserId), never trusted
// from client input, so one user can never read or overwrite another's files
// regardless of what `key` contains.
export function blobPathFor(userId: string, key: string): string {
  return `${userId}/${key}`
}
