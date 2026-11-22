import { createHash, timingSafeEqual } from 'crypto'
import { UserDoc } from './cosmos'
import { HttpError, isBase64OfLength } from './http'

/** Proof that the caller holds the Data Key: they send HKDF(DataKey,'artha-key-proof'),
 * which only a Data Key holder can compute; we compare its hash to the stored one. */
export function requireKeyProof(user: UserDoc, keyProof: unknown): void {
  if (!user.keyProofHash || !isBase64OfLength(keyProof, 32, 32)) {
    throw new HttpError(403, 'This device does not hold the account key')
  }
  const computed = createHash('sha256').update(Buffer.from(keyProof, 'base64')).digest()
  const expected = Buffer.from(user.keyProofHash, 'hex')
  if (computed.length !== expected.length || !timingSafeEqual(computed, expected)) {
    throw new HttpError(403, 'This device does not hold the account key')
  }
}
