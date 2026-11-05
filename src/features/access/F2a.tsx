// My second factor. Enroll once in an authenticator app; sensitive writes then ask for a fresh code.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Tile } from '@wefaber/ui'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { ApiError, gql } from '@/lib/api'
import { CONFIRM, ENROLL, type Enrollment, type MyAccess } from './api'

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Error desconocido.'

/** QR of the otpauth URI, rendered locally: the secret never leaves the browser. Falls back to nothing if it fails; the key stays visible. */
function EnrollQr({ uri }: { uri: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(uri, {
      width: 224,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (alive) setSrc(url)
      })
      .catch(() => {
        if (alive) setSrc(null)
      })
    return () => {
      alive = false
    }
  }, [uri])

  if (!src) return null
  return (
    <img
      src={src}
      alt="Código QR para activar F2A en tu app de autenticación"
      width={224}
      height={224}
      className="rounded-card"
    />
  )
}

export function F2aTile({ mine }: { mine: MyAccess }) {
  const qc = useQueryClient()
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')

  const enroll = useMutation({
    mutationFn: () => gql<{ f2aEnroll: Enrollment }>(ENROLL),
    onSuccess: (r) => {
      setEnrollment(r.f2aEnroll)
      setCode('')
    },
  })
  const confirm = useMutation({
    mutationFn: () => gql(CONFIRM, { code: code.trim() }),
    onSuccess: () => {
      setEnrollment(null)
      setCode('')
      void qc.invalidateQueries({ queryKey: ['access'] })
    },
  })

  if (mine.f2aEnabled)
    return (
      <Tile title="Doble factor (F2A)">
        <p className="text-body">
          F2A activo. Editar columnas protegidas pide un código de tu app de
          autenticación.
        </p>
      </Tile>
    )

  return (
    <Tile title="Doble factor (F2A)">
      {enrollment ? (
        <div className="flex flex-col gap-3">
          <p className="text-body">
            Escaneá este QR con tu app de autenticación (Google Authenticator,
            Authy, 1Password…) y escribí el código de 6 dígitos para activarla.
            La clave se muestra una sola vez.
          </p>
          <EnrollQr uri={enrollment.uri} />
          <code className="select-all break-all rounded-card bg-surface-2 p-3 font-mono">
            {enrollment.secret}
          </code>
          <a className="underline underline-offset-2" href={enrollment.uri}>
            Abrir en la app de autenticación
          </a>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              confirm.mutate()
            }}
          >
            <label htmlFor="f2a-code" className="text-meta text-muted">
              Código
            </label>
            <Field
              id="f2a-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={confirm.isPending || code.trim().length !== 6}
            >
              Activar F2A
            </Button>
          </form>
          {confirm.error ? (
            <p role="alert" className="text-meta text-danger">
              {errorText(confirm.error)}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-muted">
            {mine.f2aPending
              ? 'Tenés una activación a medias. Empezá de nuevo para ver la clave.'
              : 'Sin F2A no podés editar columnas protegidas.'}
          </p>
          <div>
            <Button
              variant="primary"
              disabled={enroll.isPending}
              onClick={() => enroll.mutate()}
            >
              {mine.f2aPending ? 'Empezar de nuevo' : 'Activar F2A'}
            </Button>
          </div>
          {enroll.error ? (
            <p role="alert" className="text-meta text-danger">
              {errorText(enroll.error)}
            </p>
          ) : null}
        </div>
      )}
    </Tile>
  )
}
