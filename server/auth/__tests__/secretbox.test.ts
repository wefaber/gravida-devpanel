import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { loadKey, open, seal } from '../secretbox'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

function keyFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'tabula-key-'))
  dirs.push(dir)
  const file = join(dir, 'key')
  writeFileSync(file, content)
  return file
}

describe('secretbox', () => {
  const key = randomBytes(32)

  test('seals and opens; the sealed text hides the plain one', () => {
    const sealed = seal(key, 'JBSWY3DPEHPK3PXP')
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP')
    expect(open(key, sealed)).toBe('JBSWY3DPEHPK3PXP')
  })

  test('each seal uses a fresh nonce', () => {
    expect(seal(key, 'same')).not.toBe(seal(key, 'same'))
  })

  test('a wrong key or a changed byte fails to open', () => {
    const sealed = seal(key, 'secreto')
    expect(() => open(randomBytes(32), sealed)).toThrow()
    const bytes = Buffer.from(sealed, 'base64')
    bytes[bytes.length - 1] ^= 1
    expect(() => open(key, bytes.toString('base64'))).toThrow()
  })

  test('loadKey reads 32 base64 bytes and nothing else', () => {
    const good = randomBytes(32).toString('base64')
    expect(loadKey(keyFile(`${good}\n`))?.length).toBe(32)
    expect(loadKey(keyFile(randomBytes(16).toString('base64')))).toBeNull()
    expect(loadKey('')).toBeNull()
    expect(loadKey(join(tmpdir(), 'no-existe-tabula-key'))).toBeNull()
  })
})
