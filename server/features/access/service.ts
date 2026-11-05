// Access use cases: grants per user and the F2A factor of each one. Every change is audited with the login and the
// capability (or action), never a code or a seed.
import { audit } from '../../audit'
import type { Ctx } from '../../deps'
import { capabilitiesOf, type Capability } from '../../auth/capabilities'
import {
  beginEnroll,
  confirmEnroll,
  f2aStatus,
  resetFactor,
} from '../../auth/f2a'
import { loadKey } from '../../auth/secretbox'

/** Expected failures, with the stable code the GraphQL layer returns. */
export class AccessError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const ISSUER = 'Tabula'
const UNAVAILABLE =
  'El server no tiene la clave de cifrado (TABULA_KEY_FILE): F2A no está disponible.'

export interface MyAccess {
  capabilities: Capability[]
  f2aEnabled: boolean
  f2aPending: boolean
}

export interface GrantRow {
  id: number
  userId: number
  capability: string
  grantedBy: string
  grantedAt: string
}

export interface AccessUserRow {
  login: string
  name: string
  role: string
  f2a: boolean
  grants: GrantRow[]
}

interface Target {
  id: number
  login: string
  role: string
}

function userNamed(ctx: Ctx, login: string): Target {
  const target = ctx.db
    .query<Target, [string]>(
      'SELECT id, login, role FROM users WHERE login = ? AND active = 1',
    )
    .get(login.trim().toLowerCase())
  if (!target)
    throw new AccessError('NOT_FOUND', `No hay un usuario activo "${login}".`)
  return target
}

export function myAccess(ctx: Ctx): MyAccess {
  const status = f2aStatus(ctx.db, ctx.user.id)
  return {
    capabilities: capabilitiesOf(ctx.db, ctx.user),
    f2aEnabled: status.enabled,
    f2aPending: status.pending,
  }
}

export function accessUsers(ctx: Ctx): AccessUserRow[] {
  const users = ctx.db
    .query<{ id: number; login: string; name: string; role: string }, []>(
      'SELECT id, login, name, role FROM users WHERE active = 1 ORDER BY login',
    )
    .all()
  const grants = ctx.db
    .query<GrantRow, []>(
      `SELECT id, user_id AS userId, capability, granted_by AS grantedBy, granted_at AS grantedAt
       FROM access_grants WHERE revoked_at IS NULL ORDER BY id`,
    )
    .all()
  return users.map((u) => ({
    login: u.login,
    name: u.name,
    role: u.role,
    f2a: f2aStatus(ctx.db, u.id).enabled,
    grants: grants.filter((g) => g.userId === u.id),
  }))
}

export function grant(ctx: Ctx, login: string, capability: Capability): void {
  const target = userNamed(ctx, login)
  if (target.role === 'admin')
    throw new AccessError('BAD_INPUT', 'Un admin ya tiene todos los permisos.')
  const live = ctx.db
    .query(
      'SELECT 1 FROM access_grants WHERE user_id = ? AND capability = ? AND revoked_at IS NULL',
    )
    .get(target.id, capability)
  if (live) throw new AccessError('BAD_INPUT', 'Ya tiene ese permiso.')
  ctx.db
    .query(
      'INSERT INTO access_grants (user_id, capability, granted_by, granted_at) VALUES (?, ?, ?, ?)',
    )
    .run(target.id, capability, ctx.user.login, new Date().toISOString())
  audit(ctx.db, ctx.user, 'access.grant', `${target.login}:${capability}`)
}

export function revoke(ctx: Ctx, grantId: number): void {
  const row = ctx.db
    .query<{ login: string; capability: string }, [number]>(
      `SELECT u.login, g.capability FROM access_grants g JOIN users u ON u.id = g.user_id
       WHERE g.id = ? AND g.revoked_at IS NULL`,
    )
    .get(grantId)
  if (!row)
    throw new AccessError(
      'NOT_FOUND',
      'No encontré ese permiso, o ya estaba revocado.',
    )
  ctx.db
    .query('UPDATE access_grants SET revoked_at = ? WHERE id = ?')
    .run(new Date().toISOString(), grantId)
  audit(ctx.db, ctx.user, 'access.revoke', `${row.login}:${row.capability}`)
}

export function enrollF2a(ctx: Ctx): { secret: string; uri: string } {
  if (f2aStatus(ctx.db, ctx.user.id).enabled)
    throw new AccessError('BAD_INPUT', 'Ya tenés F2A activo.')
  const key = loadKey(ctx.config.keyFile)
  if (!key) throw new AccessError('F2A_UNAVAILABLE', UNAVAILABLE)
  const out = beginEnroll(ctx.db, key, ctx.user, ISSUER)
  audit(ctx.db, ctx.user, 'f2a.enroll')
  return out
}

export function confirmF2a(ctx: Ctx, code: string): void {
  if (f2aStatus(ctx.db, ctx.user.id).enabled)
    throw new AccessError('BAD_INPUT', 'Ya tenés F2A activo.')
  const key = loadKey(ctx.config.keyFile)
  if (!key) throw new AccessError('F2A_UNAVAILABLE', UNAVAILABLE)
  const result = confirmEnroll(ctx.db, key, ctx.user.id, code.trim())
  if (result === 'none')
    throw new AccessError('BAD_INPUT', 'Primero iniciá la activación de F2A.')
  if (result === 'invalid')
    throw new AccessError(
      'F2A_INVALID',
      'El código no coincide. Revisá que la hora del celular esté en automático.',
    )
  audit(ctx.db, ctx.user, 'f2a.enable')
}

export function resetF2a(ctx: Ctx, login: string): void {
  const target = userNamed(ctx, login)
  if (!resetFactor(ctx.db, target.id))
    throw new AccessError(
      'NOT_FOUND',
      `${target.login} no tiene F2A activo ni pendiente.`,
    )
  audit(ctx.db, ctx.user, 'f2a.reset', target.login)
}
