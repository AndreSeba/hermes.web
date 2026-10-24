import { useEffect, useState } from 'react'
import { api } from '../api/cliente'
import { useSesionActiva } from '../sesion/contexto'
import { iniciales } from '../util/texto'

// Lo que va dentro del círculo de la tienda en el menú: su logo (la miniatura) o, si todavía no tiene, sus iniciales.
// Se vuelve a pedir cada vez que cambia la tienda de la sesión (Mi tienda la actualiza al guardar), así el logo nuevo aparece sin recargar.
export function LogoTienda() {
  const { tienda } = useSesionActiva()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/tienda')
      .then(({ data }) => {
        if (!cancelado) setUrl(data?.logo?.miniatura ?? null)
      })
      .catch(() => undefined)
    return () => {
      cancelado = true
    }
  }, [tienda])

  if (url) return <img className="avatar-logo" src={url} alt="" onError={() => setUrl(null)} />
  return <>{iniciales(tienda.nombre)}</>
}
