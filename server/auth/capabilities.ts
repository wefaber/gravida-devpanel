// Capabilities an admin grants to members. Admins hold all of them without a grant row.
import type { Database } from 'bun:sqlite'
import type { User } from './index'

export const CAPABILITIES = {
  'db.sql': 'Escribir con la consola SQL',
  'db.sensitive':
    'Editar columnas protegidas (contraseñas, tokens, hashes). Pide F2A',
} as const

export type Capability = keyof typeof CAPABILITIES

export const isCapability = (value: string): value is Capability =>
  Object.hasOwn(CAPABILITIES, value)

export function hasCapability(
  db: Database,
  user: Pick<User, 'id' | 'role'>,
  capability: Capability,
): boolean {
  if (user.role === 'admin') return true
  return !!db
    .query(
      'SELECT 1 FROM access_grants WHERE user_id = ? AND capability = ? AND revoked_at IS NULL',
    )
    .get(user.id, capability)
}

/** Everything the user holds: all of them for an admin, the live grants otherwise. */
export function capabilitiesOf(
  db: Database,
  user: Pick<User, 'id' | 'role'>,
): Capability[] {
  if (user.role === 'admin') return Object.keys(CAPABILITIES) as Capability[]
  return (Object.keys(CAPABILITIES) as Capability[]).filter((c) =>
    hasCapability(db, user, c),
  )
}
