// Admin only: which capabilities each member holds, and who has F2A. Admins hold all of them without a grant.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Chip, Tile } from '@wefaber/ui'
import { ApiError, gql } from '@/lib/api'
import { GRANT, REVOKE, RESET_F2A, USERS, type AccessUser } from './api'
import { CAPABILITY_LABELS, type Capability } from './capabilities'

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Error desconocido.'

export function GrantsTile() {
  const qc = useQueryClient()
  const users = useQuery({
    queryKey: ['access', 'users'],
    queryFn: () => gql<{ accessUsers: AccessUser[] }>(USERS),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['access'] })

  const grant = useMutation({
    mutationFn: (v: { login: string; capability: Capability }) => gql(GRANT, v),
    onSuccess: refresh,
  })
  const revoke = useMutation({
    mutationFn: (id: number) => gql(REVOKE, { id }),
    onSuccess: refresh,
  })
  const reset = useMutation({
    mutationFn: (login: string) => gql(RESET_F2A, { login }),
    onSuccess: refresh,
  })
  const error = grant.error ?? revoke.error ?? reset.error

  return (
    <Tile title="Permisos por usuario">
      {error ? (
        <p role="alert" className="mb-3 text-meta text-danger">
          {errorText(error)}
        </p>
      ) : null}
      {users.error ? (
        <p role="alert" className="text-danger">
          No se pudieron leer los usuarios ({errorText(users.error)}).
        </p>
      ) : null}
      {users.data ? (
        <ul className="divide-y divide-border">
          {users.data.accessUsers.map((u) => (
            <li key={u.login} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-medium">{u.name}</span>
                <span className="text-muted">{u.login}</span>
                <span className="text-meta text-muted">
                  {u.role === 'admin'
                    ? 'admin · todos los permisos'
                    : 'miembro'}
                </span>
                <span className="text-meta text-muted">
                  F2A {u.f2a ? 'activo' : 'no activo'}
                </span>
                {u.f2a ? (
                  <Button
                    variant="ghost"
                    disabled={reset.isPending}
                    onClick={() => reset.mutate(u.login)}
                  >
                    Restablecer F2A
                  </Button>
                ) : null}
              </div>
              {u.role !== 'admin' ? (
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(CAPABILITY_LABELS) as Capability[]).map(
                    (cap) => {
                      const live = u.grants.find((g) => g.capability === cap)
                      return (
                        <Chip
                          key={cap}
                          selected={!!live}
                          disabled={grant.isPending || revoke.isPending}
                          onClick={() =>
                            live
                              ? revoke.mutate(live.id)
                              : grant.mutate({
                                  login: u.login,
                                  capability: cap,
                                })
                          }
                        >
                          {CAPABILITY_LABELS[cap]}
                        </Chip>
                      )
                    },
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Tile>
  )
}
