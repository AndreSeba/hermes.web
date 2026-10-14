import createClient, { type Middleware } from 'openapi-fetch'
import type { components, paths } from './esquema'

// Cliente tipado contra la API: rutas, parámetros y respuestas salen de `esquema.d.ts`, que se
// genera desde el OpenAPI del backend (`pnpm api:tipos`). Nunca escribas los tipos de la API a mano.

export type Sesion = components['schemas']['SesionDto']
export type ImagenSubida = components['schemas']['ImagenDto']
export type Tienda = components['schemas']['TiendaDto']
export type Producto = components['schemas']['ProductoDto']
export type ProductoResumen = components['schemas']['ProductoResumenDto']
export type EstadoPrecio = components['schemas']['EstadoPrecio']
export type Categoria = components['schemas']['CategoriaDto']
export type ProductoStock = components['schemas']['ProductoStockDto']
export type VarianteStock = components['schemas']['VarianteStockDto']
export type ResumenStock = components['schemas']['ResumenStockDto']
export type Movimiento = components['schemas']['MovimientoDto']
export type EstadoStock = components['schemas']['EstadoStock']
export type ProductoVendible = components['schemas']['ProductoVendibleDto']
export type VarianteVendible = components['schemas']['VarianteVendibleDto']
export type Venta = components['schemas']['VentaDto']
export type VentaResumen = components['schemas']['VentaResumenDto']
export type ResumenVentas = components['schemas']['ResumenVentasDto']
export type MetodoPago = components['schemas']['MetodoPago']
export type Proveedor = components['schemas']['ProveedorDto']
export type ProveedorDetalle = components['schemas']['ProveedorDetalleDto']
export type Compra = components['schemas']['CompraDto']
export type CompraResumen = components['schemas']['CompraResumenDto']
export type ResumenCompras = components['schemas']['ResumenComprasDto']
export type AvisoMargen = components['schemas']['AvisoMargenDto']
export type PrecioProveedor = components['schemas']['PrecioProveedorDto']

const baseUrl = import.meta.env.VITE_API_URL ?? ''

// El token de acceso vive solo en memoria (no en localStorage): un script inyectado no puede
// leerlo después de recargar. La sesión larga la sostiene el refresh token, en una cookie
// HttpOnly que pone el backend y que JavaScript nunca ve.
let token: string | null = null

export function fijarToken(nuevo: string | null) {
  token = nuevo
}

type Avisos = { alRenovar: (s: Sesion) => void; alVencer: () => void }
let avisos: Avisos | null = null

// El proveedor de sesión se entera de cada renovación (y de cuándo ya no hay sesión).
export function escucharSesion(a: Avisos) {
  avisos = a
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

let renovacionEnCurso: Promise<Sesion | null> | null = null

// Renueva con la cookie. UNA sola a la vez por pestaña: si dos pedidos reciben 401 juntos (o
// StrictMode monta dos veces), el segundo presentaría un refresh token ya rotado y el backend lo
// tomaría por robo. Reintenta una vez porque otra pestaña puede haber rotado la cookie un instante antes.
export function renovarSesion(): Promise<Sesion | null> {
  renovacionEnCurso ??= (async () => {
    try {
      for (let intento = 0; intento < 2; intento++) {
        const r = await fetch(`${baseUrl}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
        if (r.ok) {
          const sesion = (await r.json()) as Sesion
          token = sesion.accessToken
          avisos?.alRenovar(sesion)
          return sesion
        }
        if (r.status !== 401) return null
        await esperar(400)
      }
      return null
    } catch {
      return null
    } finally {
      renovacionEnCurso = null
    }
  })()
  return renovacionEnCurso
}

// En estas rutas un 401 es "credenciales malas" o "no hay sesión", no "token vencido": no se
// reintentan. Ojo: /auth/yo SÍ usa el token y sí se renueva (no excluir todo /auth/).
const sinRenovacion = new Set(['/api/v1/auth/login', '/api/v1/auth/registro', '/api/v1/auth/refresh', '/api/v1/auth/logout'])

// Si un pedido vuelve 401 (token vencido), renueva y lo repite una vez.
async function fetchConSesion(request: Request): Promise<Response> {
  const copia = request.clone()
  const respuesta = await fetch(request)
  if (respuesta.status !== 401 || sinRenovacion.has(new URL(request.url).pathname)) return respuesta

  const sesion = await renovarSesion()
  if (!sesion) {
    token = null
    avisos?.alVencer()
    return respuesta
  }
  copia.headers.set('Authorization', `Bearer ${sesion.accessToken}`)
  return fetch(copia)
}

export const api = createClient<paths>({ baseUrl, fetch: fetchConSesion })

const conToken: Middleware = {
  onRequest({ request }) {
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
}
api.use(conToken)

// La API responde los errores como ProblemDetails; `detail` trae el mensaje para mostrar.
// El límite por IP (429) responde sin cuerpo, por eso también se mira el status.
export type ProblemDetails = { title?: string; detail?: string; status?: number }

export function mensajeDeError(error: unknown, respuesta?: Response): string {
  const detalle = (error as ProblemDetails | undefined)?.detail
  if (detalle) return detalle
  if (respuesta?.status === 429) return 'Demasiados intentos. Esperá un minuto y probá de nuevo.'
  if (!respuesta) return 'No pudimos conectarnos. Revisá tu conexión.'
  return 'Ocurrió un error inesperado. Probá de nuevo.'
}
