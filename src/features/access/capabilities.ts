// Capability names as the server sends them, with the words the panel shows. Keep in step with server/auth/capabilities.ts.
export const CAPABILITY_LABELS = {
  'db.sql': 'Escribir con la consola SQL',
  'db.sensitive': 'Editar columnas protegidas (pide F2A)',
} as const

export type Capability = keyof typeof CAPABILITY_LABELS
