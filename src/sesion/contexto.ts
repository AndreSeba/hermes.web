import { createContext, useContext } from 'react'
import type { Sesion } from '../api/cliente'

export type EstadoSesion =
  | { tipo: 'cargando' } // todavía no sabemos si la cookie sirve
  | { tipo: 'anonimo' }
  | { tipo: 'activa'; sesion: Sesion }

export type ContextoSesion = {
  estado: EstadoSesion
  entrar: (sesion: Sesion) => void
  salir: () => Promise<void>
}

export const Contexto = createContext<ContextoSesion | null>(null)

export function useSesion(): ContextoSesion {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useSesion se usa dentro de <ProveedorSesion>.')
  return ctx
}

// Para pantallas que solo existen con sesión (dentro de <RequiereSesion>).
export function useSesionActiva(): Sesion {
  const { estado } = useSesion()
  if (estado.tipo !== 'activa') throw new Error('Esta pantalla necesita una sesión activa.')
  return estado.sesion
}
