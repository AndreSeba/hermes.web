import { Navigate, Outlet, useLocation } from 'react-router'
import { PantallaCarga } from '../componentes/PantallaCarga'
import { rutaDeEntrada } from '../diseno/secciones'
import { CambiarPassword } from '../paginas/acceso/CambiarPassword'
import { useSesion, usePermisos } from './contexto'

// Rutas del panel: sin sesión van a la bienvenida, recordando a dónde querían ir.
export function RequiereSesion() {
  const { estado } = useSesion()
  const ubicacion = useLocation()

  if (estado.tipo === 'cargando') return <PantallaCarga />
  if (estado.tipo === 'anonimo') return <Navigate to="/bienvenida" replace state={{ desde: ubicacion.pathname }} />
  // Contraseña provisional (la puso el dueño): antes que nada, elegir una propia.
  if (estado.sesion.usuario.debeCambiarPassword) return <CambiarPassword />
  return <Outlet />
}

// Pantallas que piden un permiso (varios con «|»: alcanza uno). Sin él, a la primera sección que la persona sí puede ver.
// Es solo comodidad: la API vuelve a exigir el permiso en cada pedido.
export function RequierePermiso({ permiso }: { permiso: string }) {
  const { tiene } = usePermisos()
  const ubicacion = useLocation()
  if (tiene(permiso)) return <Outlet />
  const destino = rutaDeEntrada(tiene)
  return <Navigate to={destino === ubicacion.pathname ? '/sin-acceso' : destino} replace />
}

// Bienvenida, ingresar y registro: con sesión no tienen sentido, se vuelve al panel.
export function SoloAnonimo() {
  const { estado } = useSesion()
  const ubicacion = useLocation()
  const desde = (ubicacion.state as { desde?: string } | null)?.desde

  if (estado.tipo === 'cargando') return <PantallaCarga />
  if (estado.tipo === 'activa') return <Navigate to={desde ?? '/'} replace />
  return <Outlet />
}
