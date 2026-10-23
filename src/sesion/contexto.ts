import { createContext, useContext } from 'react'
import type { Sesion } from '../api/cliente'

export type EstadoSesion =
  | { tipo: 'cargando' } // todavía no sabemos si la cookie sirve
  | { tipo: 'anonimo' }
  | { tipo: 'activa'; sesion: Sesion }

export type TiendaSesion = Sesion['tienda']

export type ContextoSesion = {
  estado: EstadoSesion
  entrar: (sesion: Sesion) => void
  salir: () => Promise<void>
  // Cuando la dueña renombra la tienda o cambia su dirección: el menú lo muestra sin recargar.
  actualizarTienda: (tienda: TiendaSesion) => void
}

export const Contexto = createContext<ContextoSesion | null>(null)

export function useSesion(): ContextoSesion {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useSesion se usa dentro de <ProveedorSesion>.')
  return ctx
}

// Qué puede hacer esta persona. La API es la que manda (cada pedido exige su permiso); esto solo decide qué se muestra.
// `tiene('a|b')` = alguno de los dos. El dueño tiene todo lo que exista (su sesión trae la lista completa).
export function usePermisos() {
  const { acceso } = useSesionActiva()
  const propios = new Set(acceso.permisos)
  const tiene = (permiso: string) => permiso.split('|').some((p) => propios.has(p))
  return { tiene, esDueno: acceso.esDueno, rol: acceso.rol }
}

// Para pantallas que solo existen con sesión (dentro de <RequiereSesion>).
export function useSesionActiva(): Sesion {
  const { estado } = useSesion()
  if (estado.tipo !== 'activa') throw new Error('Esta pantalla necesita una sesión activa.')
  return estado.sesion
}
