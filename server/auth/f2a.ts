// Second factor (F2A, TOTP) for sensitive writes. The seed is sealed at rest; a code works once, in its window.
import type { Database } from 'bun:sqlite'
import { open, seal } from './secretbox'
import { matchStep, newSecret, otpauthUri } from './totp'

export type OtpCheck = 'ok' | 'not_enabled' | 'invalid' | 'unavailable'

interface Factor {
  secret_enc: string
  enabled: number
  last_step: number
}

const factorOf = (db: Database, userId: number) =>
  db
    .query<Factor, [number]>(
      'SELECT secret_enc, enabled, last_step FROM f2a_factors WHERE user_id = ?',
    )
    .get(userId)

export function f2aStatus(
  db: Database,
  userId: number,
): { enabled: boolean; pending: boolean } {
  const f = factorOf(db, userId)
  return { enabled: f?.enabled === 1, pending: !!f && f.enabled === 0 }
}

/** A new seed, sealed, for a user without an active factor. Replaces a pending one. The plain seed is returned once. */
export function beginEnroll(
  db: Database,
  key: Buffer,
  user: { id: number; login: string },
  issuer: string,
  now = new Date(),
): { secret: string; uri: string } {
  const secret = newSecret()
  db.query(
    `INSERT INTO f2a_factors (user_id, secret_enc, enabled, last_step, created_at) VALUES (?, ?, 0, 0, ?)
     ON CONFLICT (user_id) DO UPDATE SET secret_enc = excluded.secret_enc, enabled = 0, last_step = 0, created_at = excluded.created_at`,
  ).run(user.id, seal(key, secret), now.toISOString())
  return { secret, uri: otpauthUri(secret, user.login, issuer) }
}

/** Activates a pending factor when the first code checks out. */
export function confirmEnroll(
  db: Database,
  key: Buffer,
  userId: number,
  code: string,
  now = new Date(),
): 'ok' | 'invalid' | 'none' {
  const f = factorOf(db, userId)
  if (!f || f.enabled === 1) return 'none'
  const step = matchStep(open(key, f.secret_enc), code, now, f.last_step)
  if (step === null) return 'invalid'
  db.query(
    'UPDATE f2a_factors SET enabled = 1, last_step = ? WHERE user_id = ?',
  ).run(step, userId)
  return 'ok'
}

/**
 * Checks a code for a sensitive write and uses up its step, so the same code cannot be replayed.
 * `key` is null when the server has no key: an active factor then cannot be checked, and the write is refused.
 */
export function checkOtp(
  db: Database,
  key: Buffer | null,
  userId: number,
  code: string,
  now = new Date(),
): OtpCheck {
  const f = factorOf(db, userId)
  if (!f || f.enabled !== 1) return 'not_enabled'
  if (!key) return 'unavailable'
  let step: number | null
  try {
    step = matchStep(open(key, f.secret_enc), code, now, f.last_step)
  } catch {
    return 'unavailable'
  }
  if (step === null) return 'invalid'
  // The conditional update is what makes a race lose: only one request can move last_step to this step.
  const used = db
    .query(
      'UPDATE f2a_factors SET last_step = ? WHERE user_id = ? AND last_step < ?',
    )
    .run(step, userId, step)
  return used.changes === 1 ? 'ok' : 'invalid'
}

/** Removes a user's factor (lost device). The next enrollment starts from scratch. */
export function resetFactor(db: Database, userId: number): boolean {
  return (
    db.query('DELETE FROM f2a_factors WHERE user_id = ?').run(userId)
      .changes === 1
  )
}
