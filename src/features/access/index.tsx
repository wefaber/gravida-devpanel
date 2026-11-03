// Acceso: my F2A, the grants an admin gives (admin only), own tokens, and the audit log of everything that changed something.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, Field, Tile } from '@wefaber/ui'
import { useState } from 'react'
import { gql } from '@/lib/api'
import { MINE, type MyAccess } from './api'
import { F2aTile } from './F2a'
import { GrantsTile } from './Grants'

interface TokenRow {
  id: number
  label: string
  userLogin: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}
interface AuditRow {
  id: number
  at: string
  userLogin: string
  action: string
  target: string
  ok: boolean
}

const ACCESS = /* GraphQL */ `
  query Access {
    tokens {
      id
      label
      userLogin
      createdAt
      lastUsedAt
      revokedAt
    }
    audit(limit: 50) {
      id
      at
      userLogin
      action
      target
      ok
    }
  }
`
const CREATE = /* GraphQL */ `
  mutation ($label: String!) {
    createToken(label: $label) {
      id
      token
    }
  }
`
const REVOKE = /* GraphQL */ `
  mutation ($id: Int!) {
    revokeToken(id: $id)
  }
`

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-UY') : '—'

export default function Access() {
  const qc = useQueryClient()
  const mine = useQuery({
    queryKey: ['access', 'mine'],
    queryFn: () => gql<{ me: { role: string }; myAccess: MyAccess }>(MINE),
  })
  const data = useQuery({
    queryKey: ['access'],
    queryFn: () => gql<{ tokens: TokenRow[]; audit: AuditRow[] }>(ACCESS),
  })
  const [label, setLabel] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      gql<{ createToken: { token: string } }>(CREATE, { label }),
    onSuccess: (r) => {
      setFresh(r.createToken.token)
      setLabel('')
      void qc.invalidateQueries({ queryKey: ['access'] })
    },
  })
  const revoke = useMutation({
    mutationFn: (id: number) => gql(REVOKE, { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['access'] }),
  })

  return (
    <div className="flex flex-col gap-4">
      {mine.data ? <F2aTile mine={mine.data.myAccess} /> : null}
      {mine.data?.me.role === 'admin' ? <GrantsTile /> : null}

      <Tile title="Tokens de acceso">
        <form
          className="mb-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <label htmlFor="token-label" className="text-meta text-muted">
            Nombre
          </label>
          <Field
            id="token-label"
            value={label}
            maxLength={60}
            placeholder="Notebook de Pablo"
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button type="submit" variant="primary">
            Crear token
          </Button>
        </form>
        {fresh ? (
          <p role="status" className="mb-3 rounded-card bg-surface-2 p-3">
            Copialo ahora, no se vuelve a mostrar:{' '}
            <code className="select-all font-mono">{fresh}</code>
          </p>
        ) : null}
        {data.data?.tokens.length ? (
          <ul className="divide-y divide-border">
            {data.data.tokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-medium">{t.label}</span>
                <span className="text-muted">{t.userLogin}</span>
                <span className="tabular text-meta text-muted">
                  creado {when(t.createdAt)} · último uso {when(t.lastUsedAt)}
                </span>
                <span className="ml-auto">
                  {t.revokedAt ? (
                    <span className="text-muted">revocado</span>
                  ) : (
                    <Button
                      variant="danger"
                      onClick={() => revoke.mutate(t.id)}
                    >
                      Revocar
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>
            Todavía no hay tokens. Creá uno para entrar desde un dispositivo
            fuera del tailnet.
          </EmptyState>
        )}
      </Tile>

      <Tile title="Registro de acciones">
        {data.data?.audit.length ? (
          <ul className="divide-y divide-border">
            {data.data.audit.map((a) => (
              <li key={a.id} className="tabular flex flex-wrap gap-3 py-1.5">
                <span className="text-muted">{when(a.at)}</span>
                <span>{a.userLogin}</span>
                <span className={a.ok ? '' : 'text-danger'}>{a.action}</span>
                <span className="text-muted">{a.target}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>Todavía no hay acciones registradas.</EmptyState>
        )}
      </Tile>
    </div>
  )
}
