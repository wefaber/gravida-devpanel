import { afterAll, describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../../../app'
import { codeAt, stepAt } from '../../../auth/totp'
import { testDeps } from '../../../test-utils'

const ADMIN = { 'tailscale-user-login': 'faku@x' }
const MEMBER = { 'tailscale-user-login': 'pablo@x' }

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** A fresh app. `withKey` gives it the server key (TABULA_KEY_FILE); without it F2A must refuse to start. */
function setup(withKey = true) {
  const deps = testDeps()
  const dir = mkdtempSync(join(tmpdir(), 'tabula-access-'))
  dirs.push(dir)
  deps.config.dataDir = dir
  if (withKey) {
    const file = join(dir, 'key')
    writeFileSync(file, randomBytes(32).toString('base64'))
    deps.config.keyFile = file
  }
  return { app: createApp(deps, { distDir: '/nonexistent' }), dir }
}

async function gql(
  app: ReturnType<typeof createApp>,
  headers: Record<string, string>,
  query: string,
  variables?: Record<string, unknown>,
) {
  const res = await app.handle(
    new Request('http://localhost/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ query, variables }),
    }),
  )
  return (await res.json()) as {
    data?: Record<string, any>
    errors?: { message: string; extensions?: { code?: string } }[]
  }
}

const codeOf = (r: Awaited<ReturnType<typeof gql>>) =>
  r.errors?.[0]?.extensions?.code

const GRANT =
  'mutation($login: String!, $cap: String!) { grantAccess(login: $login, capability: $cap) }'
const ENROLL = 'mutation { f2aEnroll { secret uri } }'
const UPSERT_USUARIO =
  'mutation($pk: JSON!, $v: JSON!, $otp: String) { dbUpsertRow(table: "usuario", pk: $pk, values: $v, otp: $otp) }'
const SENSITIVE = { pk: { cedula: '1234567' }, v: { contrasena: 'nueva' } }

/** Enrolls the caller's F2A and confirms it. Returns the seed so the test can compute codes. */
async function enrollAndConfirm(
  app: ReturnType<typeof createApp>,
  headers: Record<string, string>,
): Promise<string> {
  const enrolled = await gql(app, headers, ENROLL)
  const secret = enrolled.data?.f2aEnroll.secret as string
  const confirm = await gql(
    app,
    headers,
    'mutation($c: String!) { f2aConfirm(code: $c) }',
    { c: codeAt(secret, stepAt(new Date())) },
  )
  expect(confirm.data?.f2aConfirm).toBe(true)
  return secret
}

describe('access: grants', () => {
  test('a member holds nothing until an admin grants it', async () => {
    const { app } = setup()
    const r = await gql(app, MEMBER, '{ myAccess { capabilities f2aEnabled } }')
    expect(r.data?.myAccess).toEqual({ capabilities: [], f2aEnabled: false })
  })

  test('only an admin grants; a member is refused', async () => {
    const { app } = setup()
    const r = await gql(app, MEMBER, GRANT, { login: 'pablo@x', cap: 'db.sql' })
    expect(codeOf(r)).toBe('FORBIDDEN')
  })

  test('the admin grants db.sql, the member sees it, and the grant is audited', async () => {
    const { app } = setup()
    const granted = await gql(app, ADMIN, GRANT, {
      login: 'Pablo@x',
      cap: 'db.sql',
    })
    expect(granted.data?.grantAccess).toBe(true)
    const mine = await gql(app, MEMBER, '{ myAccess { capabilities } }')
    expect(mine.data?.myAccess.capabilities).toEqual(['db.sql'])
    const log = await gql(
      app,
      ADMIN,
      '{ audit(limit: 1, action: "access.grant") { target userLogin ok } }',
    )
    expect(log.data?.audit[0]).toEqual({
      target: 'pablo@x:db.sql',
      userLogin: 'faku@x',
      ok: true,
    })
  })

  test('a duplicate, an unknown capability, an admin target and an unknown user are refused', async () => {
    const { app } = setup()
    await gql(app, ADMIN, GRANT, { login: 'pablo@x', cap: 'db.sql' })
    expect(
      codeOf(await gql(app, ADMIN, GRANT, { login: 'pablo@x', cap: 'db.sql' })),
    ).toBe('BAD_INPUT')
    expect(
      codeOf(await gql(app, ADMIN, GRANT, { login: 'pablo@x', cap: 'root' })),
    ).toBe('BAD_INPUT')
    expect(
      codeOf(await gql(app, ADMIN, GRANT, { login: 'faku@x', cap: 'db.sql' })),
    ).toBe('BAD_INPUT')
    expect(
      codeOf(await gql(app, ADMIN, GRANT, { login: 'nadie@x', cap: 'db.sql' })),
    ).toBe('NOT_FOUND')
  })

  test('revoking closes the capability at once', async () => {
    const { app } = setup()
    await gql(app, ADMIN, GRANT, { login: 'pablo@x', cap: 'db.sql' })
    const list = await gql(
      app,
      ADMIN,
      '{ accessUsers { login grants { id capability } } }',
    )
    const id = list.data?.accessUsers.find(
      (u: { login: string }) => u.login === 'pablo@x',
    ).grants[0].id
    const revoked = await gql(
      app,
      ADMIN,
      'mutation($id: Int!) { revokeAccess(id: $id) }',
      { id },
    )
    expect(revoked.data?.revokeAccess).toBe(true)
    const r = await gql(
      app,
      MEMBER,
      'mutation { dbExecute(sql: "DELETE FROM usuario WHERE cedula = \'1234567\'", confirm: true) { verb } }',
    )
    expect(codeOf(r)).toBe('FORBIDDEN')
  })

  test('the user list is admin only', async () => {
    const { app } = setup()
    expect(codeOf(await gql(app, MEMBER, '{ accessUsers { login } }'))).toBe(
      'FORBIDDEN',
    )
  })
})

describe('access: console writes with db.sql', () => {
  test('a granted member runs a write; the dump is taken first', async () => {
    const { app } = setup()
    await gql(app, ADMIN, GRANT, { login: 'pablo@x', cap: 'db.sql' })
    const r = await gql(
      app,
      MEMBER,
      'mutation { dbExecute(sql: "UPDATE ubicacion SET seccion_inventario = \'Lab\' WHERE id_ubicacion = 1", confirm: true) { verb dumpFile } }',
    )
    expect(r.data?.dbExecute.verb).toBe('UPDATE')
    expect(r.data?.dbExecute.dumpFile).toBeTruthy()
  })

  test('a granted member still cannot write a protected column without db.sensitive', async () => {
    const { app } = setup()
    await gql(app, ADMIN, GRANT, { login: 'pablo@x', cap: 'db.sql' })
    const r = await gql(
      app,
      MEMBER,
      "mutation { dbExecute(sql: \"UPDATE usuario SET contrasena = 'x' WHERE cedula = '1234567'\", confirm: true) { verb } }",
    )
    expect(codeOf(r)).toBe('FORBIDDEN')
    expect(r.errors?.[0]?.message).toContain('Editar columnas protegidas')
  })
})

describe('access: F2A', () => {
  test('enrollment refuses without the server key, and nothing is stored', async () => {
    const { app } = setup(false)
    expect(codeOf(await gql(app, ADMIN, ENROLL))).toBe('F2A_UNAVAILABLE')
    const r = await gql(app, ADMIN, '{ myAccess { f2aEnabled f2aPending } }')
    expect(r.data?.myAccess).toEqual({ f2aEnabled: false, f2aPending: false })
  })

  test('enroll returns a seed and an otpauth link; the first code activates it', async () => {
    const { app } = setup()
    const enrolled = await gql(app, ADMIN, ENROLL)
    const { f2aEnroll } = enrolled.data as {
      f2aEnroll: { secret: string; uri: string }
    }
    const { secret, uri } = f2aEnroll
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(uri).toContain(`secret=${secret}`)
    const pending = await gql(app, ADMIN, '{ myAccess { f2aPending } }')
    expect(pending.data?.myAccess.f2aPending).toBe(true)
    const wrong = await gql(
      app,
      ADMIN,
      'mutation { f2aConfirm(code: "000000") }',
    )
    expect(codeOf(wrong)).toBe('F2A_INVALID')
    await enrollAndConfirm(app, ADMIN)
    const on = await gql(app, ADMIN, '{ myAccess { f2aEnabled } }')
    expect(on.data?.myAccess.f2aEnabled).toBe(true)
    expect(codeOf(await gql(app, ADMIN, ENROLL))).toBe('BAD_INPUT')
  })

  test('a sensitive write without an active factor says to turn F2A on', async () => {
    const { app } = setup()
    await gql(app, ADMIN, GRANT, { login: 'pablo@x', cap: 'db.sensitive' })
    const r = await gql(app, MEMBER, UPSERT_USUARIO, SENSITIVE)
    expect(codeOf(r)).toBe('F2A_REQUIRED')
  })

  test('a sensitive write needs db.sensitive even with a factor', async () => {
    const { app } = setup()
    await enrollAndConfirm(app, MEMBER)
    const r = await gql(app, MEMBER, UPSERT_USUARIO, SENSITIVE)
    expect(codeOf(r)).toBe('FORBIDDEN')
  })

  test('the admin edits a protected column with a current code, and the code works once', async () => {
    const { app } = setup()
    const secret = await enrollAndConfirm(app, ADMIN)
    // The enrollment used the current step. The next write takes the step after it, so the code is fresh.
    const base = stepAt(new Date())
    const otp = codeAt(secret, base + 1)
    const ok = await gql(app, ADMIN, UPSERT_USUARIO, { ...SENSITIVE, otp })
    expect(ok.data?.dbUpsertRow).toBe('update')
    const replay = await gql(app, ADMIN, UPSERT_USUARIO, { ...SENSITIVE, otp })
    expect(codeOf(replay)).toBe('F2A_INVALID')
    const log = await gql(
      app,
      ADMIN,
      '{ audit(limit: 1, action: "db.row.update") { detail } }',
    )
    expect(log.data?.audit[0].detail).toContain('"sensitive":true')
    expect(log.data?.audit[0].detail).not.toContain('nueva')
  })

  test('a wrong code is refused; no code at all is refused', async () => {
    const { app } = setup()
    await enrollAndConfirm(app, ADMIN)
    expect(
      codeOf(
        await gql(app, ADMIN, UPSERT_USUARIO, { ...SENSITIVE, otp: '000000' }),
      ),
    ).toBe('F2A_INVALID')
    expect(codeOf(await gql(app, ADMIN, UPSERT_USUARIO, SENSITIVE))).toBe(
      'F2A_INVALID',
    )
  })

  test('the console needs the code for a statement that names a protected column', async () => {
    const { app } = setup()
    await gql(app, ADMIN, GRANT, { login: 'pablo@x', cap: 'db.sql' })
    await gql(app, ADMIN, GRANT, { login: 'pablo@x', cap: 'db.sensitive' })
    const sql = "UPDATE usuario SET contrasena = 'x' WHERE cedula = '1234567'"
    const r = await gql(
      app,
      MEMBER,
      'mutation($sql: String!) { dbExecute(sql: $sql, confirm: true) { verb } }',
      { sql },
    )
    expect(codeOf(r)).toBe('F2A_REQUIRED')
  })

  test('the admin resets a lost factor; sensitive writes stop until a new enrollment', async () => {
    const { app } = setup()
    const secret = await enrollAndConfirm(app, ADMIN)
    const reset = await gql(
      app,
      ADMIN,
      'mutation($l: String!) { f2aReset(login: $l) }',
      { l: 'faku@x' },
    )
    expect(reset.data?.f2aReset).toBe(true)
    const r = await gql(app, ADMIN, UPSERT_USUARIO, {
      ...SENSITIVE,
      otp: codeAt(secret, stepAt(new Date())),
    })
    expect(codeOf(r)).toBe('F2A_REQUIRED')
    const log = await gql(
      app,
      ADMIN,
      '{ audit(limit: 2, action: "f2a.") { action } }',
    )
    expect(log.data?.audit.map((a: { action: string }) => a.action)).toEqual([
      'f2a.reset',
      'f2a.enable',
    ])
  })
})
