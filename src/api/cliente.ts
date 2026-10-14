import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './esquema'

// Cliente tipado contra la API: rutas, parámetros y respuestas salen de `esquema.d.ts`, que se
// genera desde el OpenAPI del backend (`pnpm api:tipos`). Nunca escribas los tipos de la API a mano.
export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL ?? '' })

let token: string | null = null

// El token vive solo en memoria (no en localStorage): un script inyectado no puede leerlo
// después de recargar. La sesión larga la sostendrá el refresh token en cookie HttpOnly.
export function fijarToken(nuevo: string | null) {
  token = nuevo
}

const conToken: Middleware = {
  onRequest({ request }) {
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
}
api.use(conToken)

// La API responde los errores como ProblemDetails; `detail` trae el mensaje para mostrar.
export type ProblemDetails = { title?: string; detail?: string; status?: number }

export function mensajeDeError(error: unknown): string {
  const pd = error as ProblemDetails | undefined
  return pd?.detail ?? 'Ocurrió un error inesperado.'
}
