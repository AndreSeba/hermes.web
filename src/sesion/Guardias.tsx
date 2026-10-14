import { Navigate, Outlet, useLocation } from 'react-router'
import { PantallaCarga } from '../componentes/PantallaCarga'
import { useSesion } from './contexto'

// Rutas del panel: sin sesión van a la bienvenida, recordando a dónde querían ir.
export function RequiereSesion() {
  const { estado } = useSesion()
  const ubicacion = useLocation()

  if (estado.tipo === 'cargando') return <PantallaCarga />
  if (estado.tipo === 'anonimo') return <Navigate to="/bienvenida" replace state={{ desde: ubicacion.pathname }} />
  return <Outlet />
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
