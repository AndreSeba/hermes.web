import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, escucharSesion, fijarToken, renovarSesion, type Sesion } from '../api/cliente'
import { Contexto, type EstadoSesion, type TiendaSesion } from './contexto'

// Renovar un minuto antes de que venza el token de acceso (15 min), así el usuario casi nunca
// recibe un 401. Si igual llega uno, cliente.ts renueva y repite el pedido.
const ANTICIPO_MS = 60_000

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({ tipo: 'cargando' })

  useEffect(() => {
    escucharSesion({
      alRenovar: (sesion) => setEstado({ tipo: 'activa', sesion }),
      alVencer: () => setEstado({ tipo: 'anonimo' }),
    })
    // Al abrir la app: si la cookie sigue valiendo, se entra directo.
    renovarSesion().then((sesion) => {
      if (!sesion) setEstado({ tipo: 'anonimo' })
    })
  }, [])

  const expira = estado.tipo === 'activa' ? estado.sesion.expiraEn : null
  useEffect(() => {
    if (!expira) return
    const ms = Math.max(new Date(expira).getTime() - Date.now() - ANTICIPO_MS, 5_000)
    const t = setTimeout(() => {
      renovarSesion().then((sesion) => {
        if (!sesion) {
          fijarToken(null)
          setEstado({ tipo: 'anonimo' })
        }
      })
    }, ms)
    return () => clearTimeout(t)
  }, [expira])

  const entrar = useCallback((sesion: Sesion) => {
    fijarToken(sesion.accessToken)
    setEstado({ tipo: 'activa', sesion })
  }, [])

  const salir = useCallback(async () => {
    try {
      await api.POST('/api/v1/auth/logout')
    } finally {
      fijarToken(null)
      setEstado({ tipo: 'anonimo' })
    }
  }, [])

  const actualizarTienda = useCallback((tienda: TiendaSesion) => {
    setEstado((previo) => (previo.tipo === 'activa' ? { tipo: 'activa', sesion: { ...previo.sesion, tienda } } : previo))
  }, [])

  const valor = useMemo(() => ({ estado, entrar, salir, actualizarTienda }), [estado, entrar, salir, actualizarTienda])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
