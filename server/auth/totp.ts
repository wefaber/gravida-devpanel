// TOTP (RFC 6238) for the second factor: HMAC-SHA1, 6 digits, 30 s steps, one step of drift each way. Pure: the clock
// is passed in, and a code never matches a step that was already used.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const STEP_SECONDS = 30
const DIGITS = 6
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toUpperCase()
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const ch of clean) {
    const index = ALPHABET.indexOf(ch)
    if (index < 0) throw new Error('base32: carácter inválido')
    value = ((value << 5) | index) & 0xffff
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export const newSecret = (): string => base32Encode(randomBytes(20))

export const stepAt = (now: Date): number =>
  Math.floor(now.getTime() / 1000 / STEP_SECONDS)

/** The code for one time step. */
export function codeAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(step))
  const hash = createHmac('sha1', base32Decode(secret)).update(msg).digest()
  const offset = (hash[hash.length - 1] ?? 0) & 0x0f
  const binary =
    ((hash[offset] ?? 0) & 0x7f) * 2 ** 24 +
    ((hash[offset + 1] ?? 0) << 16) +
    ((hash[offset + 2] ?? 0) << 8) +
    (hash[offset + 3] ?? 0)
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

/** The step the code belongs to (this one or a neighbour), or null. Steps up to `lastStep` are already used. */
export function matchStep(
  secret: string,
  code: string,
  now: Date,
  lastStep: number,
): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const current = stepAt(now)
  const given = Buffer.from(code)
  for (const step of [current, current - 1, current + 1]) {
    if (step <= lastStep) continue
    if (timingSafeEqual(Buffer.from(codeAt(secret, step)), given)) return step
  }
  return null
}

/** The `otpauth://` link authenticator apps read (also the text behind a QR code). */
export function otpauthUri(
  secret: string,
  account: string,
  issuer: string,
): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`
}
