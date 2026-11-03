// Access GraphQL: my capabilities and F2A enrollment; for an admin, the grants of every user and the F2A resets.
import { isCapability } from '../../auth/capabilities'
import { builder, fail, requireAdmin } from '../../graphql/builder'
import {
  accessUsers,
  AccessError,
  confirmF2a,
  enrollF2a,
  grant,
  myAccess,
  resetF2a,
  revoke,
  type AccessUserRow,
  type GrantRow,
  type MyAccess,
} from './service'

const GrantRef = builder.objectRef<GrantRow>('AccessGrant').implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    capability: t.exposeString('capability'),
    grantedBy: t.exposeString('grantedBy'),
    grantedAt: t.exposeString('grantedAt'),
  }),
})

const AccessUserRef = builder.objectRef<AccessUserRow>('AccessUser').implement({
  fields: (t) => ({
    login: t.exposeString('login'),
    name: t.exposeString('name'),
    role: t.exposeString('role'),
    f2a: t.exposeBoolean('f2a', { description: 'F2A active.' }),
    grants: t.field({ type: [GrantRef], resolve: (u) => u.grants }),
  }),
})

const MyAccessRef = builder.objectRef<MyAccess>('MyAccess').implement({
  fields: (t) => ({
    capabilities: t.exposeStringList('capabilities'),
    f2aEnabled: t.exposeBoolean('f2aEnabled'),
    f2aPending: t.exposeBoolean('f2aPending'),
  }),
})

const EnrollmentRef = builder
  .objectRef<{ secret: string; uri: string }>('F2aEnrollment')
  .implement({
    fields: (t) => ({
      secret: t.exposeString('secret', {
        description:
          'Clave para cargar a mano en la app de autenticación. Se muestra una vez.',
      }),
      uri: t.exposeString('uri', {
        description: 'otpauth:// link (para convertir en QR).',
      }),
    }),
  })

/** Turns the service's expected failures into GraphQL errors with their stable code. */
function guard<T>(fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    if (err instanceof AccessError) fail(err.code, err.message)
    throw err
  }
}

builder.queryFields((t) => ({
  myAccess: t.field({
    type: MyAccessRef,
    resolve: (_root, _args, ctx) => myAccess(ctx),
  }),
  accessUsers: t.field({
    type: [AccessUserRef],
    description:
      'Admin only: every active user with their grants and F2A state.',
    resolve: (_root, _args, ctx) => {
      requireAdmin(ctx)
      return accessUsers(ctx)
    },
  }),
}))

builder.mutationFields((t) => ({
  grantAccess: t.boolean({
    args: {
      login: t.arg.string({ required: true }),
      capability: t.arg.string({ required: true }),
    },
    resolve: (_root, { login, capability }, ctx) => {
      requireAdmin(ctx)
      if (!isCapability(capability))
        fail('BAD_INPUT', `Permiso desconocido "${capability}".`)
      guard(() => grant(ctx, login, capability))
      return true
    },
  }),
  revokeAccess: t.boolean({
    args: { id: t.arg.int({ required: true }) },
    resolve: (_root, { id }, ctx) => {
      requireAdmin(ctx)
      guard(() => revoke(ctx, id))
      return true
    },
  }),
  f2aEnroll: t.field({
    type: EnrollmentRef,
    resolve: (_root, _args, ctx) => guard(() => enrollF2a(ctx)),
  }),
  f2aConfirm: t.boolean({
    args: { code: t.arg.string({ required: true }) },
    resolve: (_root, { code }, ctx) => {
      guard(() => confirmF2a(ctx, code))
      return true
    },
  }),
  f2aReset: t.boolean({
    description:
      'Admin only: removes a user’s F2A (lost device). They enroll again.',
    args: { login: t.arg.string({ required: true }) },
    resolve: (_root, { login }, ctx) => {
      requireAdmin(ctx)
      guard(() => resetF2a(ctx, login))
      return true
    },
  }),
}))
