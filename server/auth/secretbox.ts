// AES-256-GCM for secrets at rest (the F2A seeds). The key is 32 random bytes, base64, in the file TABULA_KEY_FILE names.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** The key from its file, or null when none is configured or it is not 32 bytes. Callers fail closed on null. */
export function loadKey(file: string): Buffer | null {
  if (!file) return null
  try {
    const key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64')
    return key.length === 32 ? key : null
  } catch {
    return null
  }
}

/** iv (12 bytes) · auth tag (16) · ciphertext, base64. */
export function seal(key: Buffer, plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
}

/** Throws when the key is wrong or the sealed text was changed. */
export function open(key: Buffer, sealed: string): string {
  const buf = Buffer.from(sealed, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([
    decipher.update(buf.subarray(28)),
    decipher.final(),
  ]).toString('utf8')
}
