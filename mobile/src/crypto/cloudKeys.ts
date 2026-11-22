import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { x25519 } from '@noble/curves/ed25519.js'
import * as ExpoCrypto from 'expo-crypto'
import { Buffer } from 'buffer'
import { decryptRecord, encryptRecord } from './cryptoBox'

/**
 * Key material for passwordless cloud sync — a line-for-line mirror of the desktop
 * app's src/main/cloudKeys.ts (Node `crypto` there, pure-JS @noble here so it runs in
 * Expo Go). Same algorithms, same HKDF labels, same envelope: a key wrapped on either
 * device unwraps on the other.
 *
 *  Data Key      32 random bytes; encrypts every synced record and file.
 *  Recovery Key  20 random bytes, shown once as 32 Crockford-base32 characters.
 *  Key proof     HKDF(DataKey, 'artha-key-proof') — proves "I hold the Data Key".
 *  Device link   X25519 ECDH → HKDF(salt = ephPub ‖ devicePub) → seals the Data Key.
 */

const enc = new TextEncoder()
const EMPTY = new Uint8Array(0)

function derive(ikm: Uint8Array, info: string, salt: Uint8Array = EMPTY): Buffer {
  return Buffer.from(hkdf(sha256, ikm, salt, enc.encode(info), 32))
}

function random(n: number): Buffer {
  return Buffer.from(ExpoCrypto.getRandomBytes(n))
}

export function generateDataKey(): Buffer {
  return random(32)
}

export function keyProof(dataKey: Buffer): Buffer {
  return derive(dataKey, 'artha-key-proof')
}

export function keyProofHash(dataKey: Buffer): string {
  return Buffer.from(sha256(keyProof(dataKey))).toString('hex')
}

// ── Recovery Key ──────────────────────────────────────────────────────────────

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function generateRecoveryKey(): Buffer {
  return random(20)
}

export function formatRecoveryKey(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out.match(/.{1,4}/g)!.join('-')
}

export function parseRecoveryKey(text: string): Buffer {
  const clean = text
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (clean.length !== 32 || [...clean].some((c) => !ALPHABET.includes(c))) {
    throw new Error("That doesn't look like a recovery key — it should be 32 letters and numbers")
  }
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const c of clean) {
    value = (value << 5) | ALPHABET.indexOf(c)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function wrapWithRecoveryKey(dataKey: Buffer, recoveryKey: Buffer): string {
  return encryptRecord(dataKey, derive(recoveryKey, 'artha-recovery-wrap'))
}

export function unwrapWithRecoveryKey(wrapped: string, recoveryKey: Buffer): Buffer {
  try {
    return decryptRecord(wrapped, derive(recoveryKey, 'artha-recovery-wrap'))
  } catch {
    throw new Error("That recovery key doesn't match this account")
  }
}

// ── Device link (X25519) ──────────────────────────────────────────────────────

export interface LinkKeyPair {
  privateKey: Uint8Array
  publicKey: Buffer
}

export function generateLinkKeyPair(): LinkKeyPair {
  const privateKey = new Uint8Array(random(32))
  return { privateKey, publicKey: Buffer.from(x25519.getPublicKey(privateKey)) }
}

function linkWrapKey(shared: Uint8Array, ephemeralPublic: Buffer, devicePublic: Buffer): Buffer {
  return derive(shared, 'artha-device-link', Buffer.concat([ephemeralPublic, devicePublic]))
}

export function sealForDevice(dataKey: Buffer, devicePublicB64: string): { ephemeralPublicKey: string; wrappedKey: string } {
  const devicePublic = Buffer.from(devicePublicB64, 'base64')
  const eph = generateLinkKeyPair()
  const shared = x25519.getSharedSecret(eph.privateKey, devicePublic)
  return {
    ephemeralPublicKey: eph.publicKey.toString('base64'),
    wrappedKey: encryptRecord(dataKey, linkWrapKey(shared, eph.publicKey, devicePublic))
  }
}

export function openFromDevice(pair: LinkKeyPair, ephemeralPublicB64: string, wrappedB64: string): Buffer {
  const ephemeralPublic = Buffer.from(ephemeralPublicB64, 'base64')
  const shared = x25519.getSharedSecret(pair.privateKey, ephemeralPublic)
  return decryptRecord(wrappedB64, linkWrapKey(shared, ephemeralPublic, pair.publicKey))
}

export function linkCode(publicKeyB64: string): string {
  const digest = sha256(Buffer.from(publicKeyB64, 'base64'))
  const n = (((digest[0] << 24) >>> 0) + (digest[1] << 16) + (digest[2] << 8) + digest[3]) % 1_000_000
  const s = n.toString().padStart(6, '0')
  return `${s.slice(0, 3)} ${s.slice(3)}`
}

// Code verifier/challenge for the backend-brokered Google/Microsoft sign-in (RFC 7636).
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = random(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const challenge = Buffer.from(sha256(enc.encode(verifier)))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return { verifier, challenge }
}
