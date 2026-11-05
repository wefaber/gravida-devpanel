import { describe, expect, test } from 'bun:test'
import {
  base32Decode,
  base32Encode,
  codeAt,
  matchStep,
  newSecret,
  otpauthUri,
  stepAt,
} from '../totp'

// RFC 6238 appendix B, SHA-1 seed "12345678901234567890". The RFC lists 8 digits; these are their last 6.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('totp: RFC 6238 vectors', () => {
  test('time 59 s and 1111111109 s', () => {
    expect(codeAt(RFC_SECRET, stepAt(new Date(59 * 1000)))).toBe('287082')
    expect(codeAt(RFC_SECRET, stepAt(new Date(1111111109 * 1000)))).toBe(
      '081804',
    )
  })
})

describe('totp: base32', () => {
  test('round trip and the RFC secret', () => {
    const bytes = Buffer.from('12345678901234567890')
    expect(base32Encode(bytes)).toBe(RFC_SECRET)
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890')
  })

  test('a new secret is 32 base32 characters', () => {
    expect(newSecret()).toMatch(/^[A-Z2-7]{32}$/)
  })

  test('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('GEZ1')).toThrow('base32')
  })
})

describe('totp: matchStep', () => {
  const now = new Date(1111111109 * 1000)
  const step = stepAt(now)

  test('accepts the current code and one step either side', () => {
    expect(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step), now, 0)).toBe(step)
    expect(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step - 1), now, 0)).toBe(
      step - 1,
    )
    expect(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step + 1), now, 0)).toBe(
      step + 1,
    )
  })

  test('refuses codes two steps away', () => {
    expect(
      matchStep(RFC_SECRET, codeAt(RFC_SECRET, step + 2), now, 0),
    ).toBeNull()
  })

  test('refuses a step that was already used', () => {
    expect(
      matchStep(RFC_SECRET, codeAt(RFC_SECRET, step), now, step),
    ).toBeNull()
    expect(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step + 1), now, step)).toBe(
      step + 1,
    )
  })

  test('refuses anything that is not six digits', () => {
    expect(matchStep(RFC_SECRET, '12345', now, 0)).toBeNull()
    expect(matchStep(RFC_SECRET, 'abcdef', now, 0)).toBeNull()
    expect(matchStep(RFC_SECRET, '', now, 0)).toBeNull()
  })
})

describe('totp: otpauth link', () => {
  test('carries the secret, issuer and account', () => {
    expect(otpauthUri('ABC234', 'faku@x', 'Tabula')).toBe(
      'otpauth://totp/Tabula%3Afaku%40x?secret=ABC234&issuer=Tabula',
    )
  })
})
